const { app, BrowserWindow, Tray, Menu, nativeImage, dialog, Notification } = require('electron');
const { autoUpdater } = require('electron-updater');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');

class MonitorSwitcherApp {
    openConfigFile() {
        const { shell } = require('electron');
        if (fs.existsSync(this.configFile)) {
            shell.openPath(this.configFile);
        } else {
            this.showError('Arquivo de configuração não encontrado.');
        }
    }

    constructor() {
        this.isDev = null;
        this.tool = null;
        this.configFile = null;
        this.iconPath = null;
        this.display1StableId = '';
        this.display2StableId = '';
        this.tray = null;
        this.currentPrimaryStableId = null;
        this.isInitialized = false;
        this.autoUpdaterInitialized = false;
        this.updateStatusLabel = 'Aguardando verificação';
        this.isCheckingForUpdate = false;
        this.isUpdateDownloaded = false;
        this.isInstallingUpdate = false;
    }

    initializePaths() {
        if (this.isInitialized) return;

        this.isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

        this.tool = this.getResourcePath('MultiMonitorTool.exe');
        this.configFile = this.getResourcePath('display_config.txt');
        this.iconPath = this.getResourcePath('monitorswitcher.ico');

        this.isInitialized = true;
    }

    getResourcePath(fileName) {
        if (this.isDev) {
            return path.join(__dirname, fileName);
        } else {
            return path.join(process.resourcesPath, fileName);
        }
    }

    async init() {
        this.initializePaths();

        if (process.platform === 'win32') {
            app.setAppUserModelId('MonitorSwitcher');
        }

        if (!fs.existsSync(this.tool)) {
            await this.showError(`Arquivo '${path.basename(this.tool)}' não encontrado.`);
            return app.quit();
        }

        if (!fs.existsSync(this.configFile)) {
            await this.showError(`Arquivo '${path.basename(this.configFile)}' não encontrado.`);
            return app.quit();
        }

        this.loadDisplayConfig();
        this.createTray();
        this.initializeAutoUpdater();
        await this.syncCurrentPrimaryState();

        if (this.canUseAutoUpdater() && process.env.NODE_ENV !== 'test') {
            setTimeout(() => this.checkForUpdates(false), 15000);
            setInterval(() => this.checkForUpdates(false), 30 * 60 * 1000);
        } else if (!this.canUseAutoUpdater()) {
            this.setUpdateStatus('Atualização automática indisponível neste modo');
        }

        const isAutoStarted = process.argv.includes('--hidden') || app.getLoginItemSettings().wasOpenedAtLogin;
        if (!isAutoStarted && !this.isDev) {
            this.showBalloon('Monitor Switcher iniciado');
        }
    }

    loadDisplayConfig() {
        try {
            const data = fs.readFileSync(this.configFile, 'utf8');
            const lines = data.split('\n');
            this.display1StableId = '';
            this.display2StableId = '';
            lines.forEach(line => {
                const trimmedLine = line.trim();
                if (trimmedLine.startsWith('DISPLAY1=')) {
                    this.display1StableId = trimmedLine.substring('DISPLAY1='.length).trim();
                } else if (trimmedLine.startsWith('DISPLAY2=')) {
                    this.display2StableId = trimmedLine.substring('DISPLAY2='.length).trim();
                }
            });
        } catch (error) {
            console.error('Erro ao carregar configuração:', error);
        }
    }

    createTray() {
        let trayIcon;

        if (fs.existsSync(this.iconPath)) {
            trayIcon = nativeImage.createFromPath(this.iconPath);
        } else {
            trayIcon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
        }

        this.tray = new Tray(trayIcon);
        this.tray.setToolTip('Monitor Switcher');
        this.updateTrayMenu();
    }

    async showError(message) {
        return await dialog.showMessageBox({
            type: 'error',
            title: 'Erro',
            message: message,
            buttons: ['OK']
        });
    }

    async getMonitorStateForToggle() {
        const tempCsvPath = path.join(app.getPath('temp'), 'monitors.csv');
        const command = `"${this.tool}" /scomma "${tempCsvPath}"`;

        return new Promise((resolve) => {
            exec(command, { timeout: 10000 }, async (error, stdout, stderr) => {
                if (error) {
                    this.showError(`Erro ao consultar monitores:\n${error.message}`);
                    return resolve(null);
                }

                if (!fs.existsSync(tempCsvPath)) {
                    this.showError('Arquivo de estado do monitor não foi criado.');
                    return resolve(null);
                }

                try {
                    const csvData = fs.readFileSync(tempCsvPath, 'utf8');
                    fs.unlinkSync(tempCsvPath);

                    const processRecords = (records, delimiter) => {
                        let primaryMonitor = records.find(r => r.Primary === 'Yes');

                        if (!primaryMonitor) {
                            primaryMonitor = records.find(r =>
                                r['Is Primary'] === 'Yes' ||
                                r['Is Primary'] === 'Sim'
                            );
                        }

                        if (!primaryMonitor) {
                            primaryMonitor = records.find(r => r.Active === 'Yes' && r.Disconnected === 'No');
                        }

                        if (!primaryMonitor) {
                            this.showError('Não foi possível identificar o monitor principal atual.');
                            return resolve(null);
                        }

                        let currentPrimaryStableId = primaryMonitor['Monitor Serial Number'] || primaryMonitor['Monitor ID'];

                        if (currentPrimaryStableId.startsWith('00000') || currentPrimaryStableId === '') {
                            currentPrimaryStableId = primaryMonitor['Monitor ID'];
                        }

                        const currentPrimaryId = primaryMonitor['Monitor ID'];

                        const compareStableIds = (configuredId, detectedId) => {
                            if (!configuredId || !detectedId) return false;

                            configuredId = configuredId.trim();
                            detectedId = detectedId.trim();

                            if (configuredId === detectedId) {
                                return true;
                            }

                            if (!configuredId.startsWith('MONITOR\\') && !detectedId.startsWith('MONITOR\\')) {
                                return configuredId.includes(detectedId) || detectedId.includes(configuredId);
                            }

                            if (configuredId.startsWith('MONITOR\\') && detectedId.startsWith('MONITOR\\')) {
                                const configuredParts = configuredId.split('\\');
                                const detectedParts = detectedId.split('\\');

                                const minLength = Math.min(configuredParts.length, detectedParts.length);
                                let matches = 0;

                                for (let i = 0; i < minLength - 1; i++) {
                                    if (configuredParts[i] === detectedParts[i]) {
                                        matches++;
                                    }
                                }

                                return matches >= 2;
                            }

                            if (configuredId.startsWith('MONITOR\\') && !detectedId.startsWith('MONITOR\\')) {
                                const shortIdFromConfig = configuredId.split('\\')[1];
                                return detectedId.includes(shortIdFromConfig) || shortIdFromConfig.includes(detectedId);
                            }

                            if (!configuredId.startsWith('MONITOR\\') && detectedId.startsWith('MONITOR\\')) {
                                const shortIdFromDetected = detectedId.split('\\')[1];
                                return configuredId.includes(shortIdFromDetected) || shortIdFromDetected.includes(configuredId);
                            }

                            return false;
                        };

                        const isDisplay1Primary = compareStableIds(this.display1StableId, currentPrimaryStableId);
                        const isDisplay2Primary = compareStableIds(this.display2StableId, currentPrimaryStableId);

                        let targetStableId;
                        let targetModeName;

                        if (isDisplay1Primary) {
                            targetStableId = this.display2StableId;
                            targetModeName = 'Modo Jogo';
                        } else if (isDisplay2Primary) {
                            targetStableId = this.display1StableId;
                            targetModeName = 'Modo Reunião';
                        } else {
                            this.showError(`Monitor principal atual não corresponde a DISPLAY1 ou DISPLAY2 configurados.`);
                            return resolve(null);
                        }

                        const targetMonitor = records.find(r => {
                            let stableId = r['Monitor Serial Number'] || r['Monitor ID'];
                            if (stableId.startsWith('00000') || !stableId) {
                                stableId = r['Monitor ID'];
                            }
                            return compareStableIds(targetStableId, stableId);
                        });

                        if (!targetMonitor) {
                            this.showError(`Monitor alvo não encontrado. Verifique a configuração.`);
                            return resolve(null);
                        }

                        const targetId = targetMonitor['Monitor ID'];

                        this.currentPrimaryStableId = isDisplay1Primary ? this.display1StableId : this.display2StableId;

                        resolve({
                            currentPrimaryId: currentPrimaryId,
                            currentPrimaryStableId: this.currentPrimaryStableId,
                            targetId: targetId,
                            targetStableId: targetStableId,
                            targetModeName: targetModeName
                        });
                    };

                    parse(csvData, {
                        columns: true,
                        skip_empty_lines: true,
                        trim: true,
                        delimiter: ','
                    }, (err, records) => {
                        if (!err && records && records.length > 0) {
                            return processRecords(records, ',');
                        }

                        parse(csvData, {
                            columns: true,
                            skip_empty_lines: true,
                            trim: true,
                            delimiter: ';'
                        }, (err2, records2) => {
                            if (!err2 && records2 && records2.length > 0) {
                                return processRecords(records2, ';');
                            }

                            this.showError('Erro ao analisar dados de monitor.');
                            return resolve(null);
                        });
                    });
                } catch (e) {
                    this.showError(`Erro interno ao processar estado do monitor: ${e.message}`);
                    resolve(null);
                }
            });
        });
    }

    async syncCurrentPrimaryState() {
        const state = await this.getMonitorStateForToggle();
        if (state) {
            this.currentPrimaryStableId = state.currentPrimaryStableId;
        } else {
            this.currentPrimaryStableId = this.display1StableId;
        }
    }

    async setPrimary(displayId, modeName) {
        if (!displayId || displayId.trim() === '') {
            this.showError('Display ID não configurado corretamente');
            return;
        }

        const command = `"${this.tool}" /SetPrimary "${displayId}"`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                this.showError(`Erro ao alterar monitor:\n${error.message}`);
                return;
            }

            if (modeName === 'Modo Jogo') {
                this.currentPrimaryStableId = this.display2StableId;
            } else {
                this.currentPrimaryStableId = this.display1StableId;
            }

            this.showBalloon(`Alterado para ${modeName}.`);
        });
    }

    showBalloon(message) {
        if (Notification.isSupported()) {
            new Notification({
                title: 'Monitor Switcher',
                body: message,
                icon: this.iconPath,
                silent: false
            }).show();
        } else if (this.tray) {
            this.tray.displayBalloon({
                title: 'Monitor Switcher',
                content: message,
                icon: this.iconPath
            });
        }
    }

    showUpdateNotification(message, onClick = null) {
        if (Notification.isSupported()) {
            const notification = new Notification({
                title: 'Monitor Switcher - Atualização',
                body: message,
                icon: this.iconPath,
                silent: false
            });

            if (typeof onClick === 'function') {
                notification.on('click', onClick);
            }

            notification.show();
            return;
        }

        if (this.tray) {
            this.tray.displayBalloon({
                title: 'Monitor Switcher - Atualização',
                content: message,
                icon: this.iconPath
            });
        }
    }

    canUseAutoUpdater() {
        return app.isPackaged && process.platform === 'win32';
    }

    setUpdateStatus(statusLabel) {
        this.updateStatusLabel = statusLabel;
        this.updateTrayMenu();
    }

    initializeAutoUpdater() {
        if (this.autoUpdaterInitialized) return;
        this.autoUpdaterInitialized = true;

        if (!this.canUseAutoUpdater()) return;

        autoUpdater.autoDownload = true;
        autoUpdater.autoInstallOnAppQuit = true;

        autoUpdater.on('checking-for-update', () => {
            this.isCheckingForUpdate = true;
            this.setUpdateStatus('Verificando atualizações...');
        });

        autoUpdater.on('update-available', info => {
            this.setUpdateStatus(`Nova versão ${info.version} encontrada. Baixando...`);
            this.showUpdateNotification(`Versão ${info.version} disponível. Download iniciado.`);
        });

        autoUpdater.on('update-not-available', () => {
            this.isCheckingForUpdate = false;
            this.isUpdateDownloaded = false;
            this.setUpdateStatus('Aplicativo atualizado');
        });

        autoUpdater.on('download-progress', progress => {
            const percent = Math.round(progress.percent || 0);
            this.setUpdateStatus(`Baixando atualização... ${percent}%`);
        });

        autoUpdater.on('update-downloaded', info => {
            this.isCheckingForUpdate = false;
            this.isUpdateDownloaded = true;
            this.setUpdateStatus(`Atualização pronta (${info.version}) — instalando em 10s...`);
            this.showUpdateNotification(
                `Versão ${info.version} baixada. O app será reiniciado em 10 segundos para instalar.`,
                () => this.installDownloadedUpdate()
            );
            // Auto-instala após 10 segundos
            setTimeout(() => this.installDownloadedUpdate(), 10000);
        });

        autoUpdater.on('error', error => {
            this.isCheckingForUpdate = false;
            this.setUpdateStatus('Erro no auto-update');
            console.error('Erro no auto-update:', error);
        });
    }

    async checkForUpdates(manual = false) {
        if (!this.canUseAutoUpdater()) {
            this.setUpdateStatus('Atualização automática indisponível neste modo');
            if (manual) {
                this.showUpdateNotification('Auto-update disponível apenas no app instalado.');
            }
            return;
        }

        if (this.isCheckingForUpdate) {
            if (manual) {
                this.showUpdateNotification('Já existe uma verificação de atualização em andamento.');
            }
            return;
        }

        try {
            this.isCheckingForUpdate = true;
            await autoUpdater.checkForUpdates();
        } catch (error) {
            this.isCheckingForUpdate = false;
            this.setUpdateStatus('Erro ao verificar atualização');
            console.error('Erro ao verificar atualização:', error);
            if (manual) {
                this.showUpdateNotification('Não foi possível verificar atualizações.');
            }
        }
    }

    installDownloadedUpdate() {
        if (!this.isUpdateDownloaded || this.isInstallingUpdate) {
            return;
        }

        this.isInstallingUpdate = true;
        this.setUpdateStatus('Instalando atualização...');

        setTimeout(() => {
            try {
                autoUpdater.quitAndInstall(false, true);
            } catch (error) {
                this.isInstallingUpdate = false;
                this.setUpdateStatus('Erro ao instalar atualização');
                console.error('Erro ao instalar atualização:', error);
            }
        }, 250);
    }

    async togglePrimary() {
        if (!this.display1StableId || !this.display2StableId) {
            return this.showError('Configuração de displays não carregada corretamente.');
        }

        const state = await this.getMonitorStateForToggle();

        if (state) {
            await this.setPrimary(state.targetId, state.targetModeName);
        }
    }

    buildUpdateMenuItem() {
        const busyPatterns = ['Verificando', 'Baixando', 'Instalando'];
        const isBusy = busyPatterns.some(p => this.updateStatusLabel.startsWith(p));
        const isUnavailable = this.updateStatusLabel.includes('indisponível') || this.updateStatusLabel.includes('indisponivel');

        if (this.isUpdateDownloaded && !isBusy) {
            return [{
                label: '⚡ Instalar atualização',
                click: () => this.installDownloadedUpdate()
            }];
        } else if (isBusy) {
            return [{
                label: `🔄 ${this.updateStatusLabel}`,
                enabled: false
            }];
        } else if (isUnavailable) {
            return [{
                label: '🔄 Verificação indisponível',
                enabled: false
            }];
        } else {
            return [{
                label: '🔄 Verificar atualizações',
                click: () => this.checkForUpdates(true)
            }];
        }
    }

    updateTrayMenu() {
        if (!this.tray) return;
        
        const autoStartEnabled = app.getLoginItemSettings().openAtLogin;
        const autoStartIcon = autoStartEnabled ? '✅' : '⬜';
        
        const contextMenu = Menu.buildFromTemplate([
            {
                label: '🖥️ Monitor Switcher',
                enabled: false
            },
            { type: 'separator' },
            {
                label: '🔄 Alternar Monitor Principal',
                click: () => this.togglePrimary()
            },
            { type: 'separator' },
            {
                label: '⚙️ Editar Configuração',
                click: () => this.openConfigFile()
            },
            {
                label: `${autoStartIcon} Iniciar com Windows`,
                click: () => this.toggleAutoStart()
            },
            { type: 'separator' },
            ...this.buildUpdateMenuItem(),
            { type: 'separator' },
            {
                label: '🛑 Sair',
                click: () => app.quit()
            }
        ]);

        this.tray.setContextMenu(contextMenu);
    }

    toggleAutoStart() {
        const currentSettings = app.getLoginItemSettings();
        const willOpenAtLogin = !currentSettings.openAtLogin;

        app.setLoginItemSettings({
            openAtLogin: willOpenAtLogin,
            openAsHidden: true,
            name: 'Monitor Switcher',
            path: process.execPath
        });

        this.updateTrayMenu();

        const status = willOpenAtLogin ? 'habilitado' : 'desabilitado';
        this.showBalloon(`Inicialização automática ${status}`);
    }
}

module.exports = MonitorSwitcherApp;

if (require.main === module) {
    let monitorSwitcher = null;

    app.whenReady().then(() => {
        monitorSwitcher = new MonitorSwitcherApp();
        monitorSwitcher.init().catch(error => {
            console.error('Erro durante inicialização:', error);
        });
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
        }
    });

    app.on('before-quit', () => {
        if (monitorSwitcher && monitorSwitcher.tray) {
            monitorSwitcher.tray.destroy();
        }
    });

    const gotTheLock = app.requestSingleInstanceLock();

    if (!gotTheLock) {
        app.quit();
    } else {
        app.on('second-instance', () => { });
    }
}

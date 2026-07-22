const { app, Tray, Menu, nativeImage, dialog, Notification, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const { exec, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');
const {
  APP_NAME, APP_USER_MODEL_ID, MODES, ENV, UPDATE_PHASE, TIMING,
  RESOURCES, CLI_FLAGS, CSV_COLUMNS, FALLBACK_ICON_DATA_URL,
} = require('./modules/constants');

class MonitorSwitcherApp {
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
        this.updatePhase = UPDATE_PHASE.IDLE;
        this.updateStatusLabel = 'Aguardando verificação';
        this.isCheckingForUpdate = false;
        this.isUpdateDownloaded = false;
        this.isInstallingUpdate = false;
    }

    initializePaths() {
        if (this.isInitialized) return;

        this.isDev = process.env.NODE_ENV === ENV.DEVELOPMENT || !app.isPackaged;

        this.tool = this.getResourcePath(RESOURCES.TOOL);
        this.configFile = this.getResourcePath(RESOURCES.CONFIG);
        this.iconPath = this.getResourcePath(RESOURCES.ICON);

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
            app.setAppUserModelId(APP_USER_MODEL_ID);
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

        if (this.canUseAutoUpdater() && process.env.NODE_ENV !== ENV.TEST) {
            setTimeout(() => this.checkForUpdates(false), TIMING.INITIAL_UPDATE_CHECK_MS);
            setInterval(() => this.checkForUpdates(false), TIMING.UPDATE_CHECK_INTERVAL_MS);
        } else if (!this.canUseAutoUpdater()) {
            this.setUpdateStatus(UPDATE_PHASE.UNAVAILABLE, 'Atualização automática indisponível neste modo');
        }

        const isAutoStarted = process.argv.includes('--hidden') || app.getLoginItemSettings().wasOpenedAtLogin;
        if (!isAutoStarted && !this.isDev) {
            this.showBalloon(`${APP_NAME} iniciado`);
        }
    }

    loadDisplayConfig() {
        try {
            const data = fs.readFileSync(this.configFile, 'utf8');
            const lines = data.split('\n');
            this.display1StableId = '';
            this.display2StableId = '';
            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine.startsWith('DISPLAY1=')) {
                    this.display1StableId = trimmedLine.substring('DISPLAY1='.length).trim();
                } else if (trimmedLine.startsWith('DISPLAY2=')) {
                    this.display2StableId = trimmedLine.substring('DISPLAY2='.length).trim();
                }
            }
        } catch (error) {
            console.error('Erro ao carregar configuração:', error);
        }
    }

    openConfigFile() {
        if (fs.existsSync(this.configFile)) {
            const result = shell.openPath(this.configFile);
            if (typeof result === 'string' && result.length > 0) {
                console.error(`Erro ao abrir configuração: ${result}`);
                this.showError(`Não foi possível abrir o arquivo de configuração (${result}).`);
            }
        } else {
            this.showError('Arquivo de configuração não encontrado.');
        }
    }

    createTray() {
        let trayIcon;

        if (fs.existsSync(this.iconPath)) {
            trayIcon = nativeImage.createFromPath(this.iconPath);
        } else {
            trayIcon = nativeImage.createFromDataURL(FALLBACK_ICON_DATA_URL);
        }

        this.tray = new Tray(trayIcon);
        this.tray.setToolTip(APP_NAME);
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
        const command = `"${this.tool}" ${CLI_FLAGS.SCOMMA} "${tempCsvPath}"`;

        return new Promise((resolve) => {
            exec(command, { timeout: TIMING.EXEC_TIMEOUT_MS }, async (error) => {
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

                    const processRecords = (records) => {
                        let primaryMonitor = records.find(r => r[CSV_COLUMNS.PRIMARY] === CSV_COLUMNS.YES);

                        if (!primaryMonitor) {
                            primaryMonitor = records.find(r =>
                                r[CSV_COLUMNS.IS_PRIMARY] === CSV_COLUMNS.YES ||
                                r[CSV_COLUMNS.IS_PRIMARY] === CSV_COLUMNS.SIM
                            );
                        }

                        if (!primaryMonitor) {
                            primaryMonitor = records.find(r => r[CSV_COLUMNS.ACTIVE] === CSV_COLUMNS.YES && r[CSV_COLUMNS.DISCONNECTED] === CSV_COLUMNS.NO);
                        }

                        if (!primaryMonitor) {
                            this.showError('Não foi possível identificar o monitor principal atual.');
                            return resolve(null);
                        }

                        let currentPrimaryStableId = primaryMonitor[CSV_COLUMNS.MONITOR_SERIAL] || primaryMonitor[CSV_COLUMNS.MONITOR_ID];

                        if (currentPrimaryStableId.startsWith('00000') || currentPrimaryStableId === '') {
                            currentPrimaryStableId = primaryMonitor[CSV_COLUMNS.MONITOR_ID];
                        }

                        const currentPrimaryId = primaryMonitor[CSV_COLUMNS.MONITOR_ID];

                        const compareStableIds = (configuredId, detectedId) => {
                            if (!configuredId || !detectedId) return false;

                            configuredId = configuredId.trim();
                            detectedId = detectedId.trim();

                            if (configuredId === detectedId) {
                                return true;
                            }

                            const configHasPrefix = configuredId.startsWith('MONITOR\\');
                            const detectedHasPrefix = detectedId.startsWith('MONITOR\\');

                            if (!configHasPrefix && !detectedHasPrefix) {
                                return configuredId.includes(detectedId) || detectedId.includes(configuredId);
                            }

                            if (configHasPrefix && detectedHasPrefix) {
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

                            if (configHasPrefix && !detectedHasPrefix) {
                                const shortIdFromConfig = configuredId.split('\\')[1];
                                return detectedId.includes(shortIdFromConfig) || shortIdFromConfig.includes(detectedId);
                            }

                            if (!configHasPrefix && detectedHasPrefix) {
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
                            targetModeName = MODES.GAME;
                        } else if (isDisplay2Primary) {
                            targetStableId = this.display1StableId;
                            targetModeName = MODES.MEETING;
                        } else {
                            this.showError(`Monitor principal atual não corresponde a DISPLAY1 ou DISPLAY2 configurados.`);
                            return resolve(null);
                        }

                        const targetMonitor = records.find(r => {
                            let stableId = r[CSV_COLUMNS.MONITOR_SERIAL] || r[CSV_COLUMNS.MONITOR_ID];
                            if (stableId.startsWith('00000') || !stableId) {
                                stableId = r[CSV_COLUMNS.MONITOR_ID];
                            }
                            return compareStableIds(targetStableId, stableId);
                        });

                        if (!targetMonitor) {
                            this.showError(`Monitor alvo não encontrado. Verifique a configuração.`);
                            return resolve(null);
                        }

                        const targetId = targetMonitor[CSV_COLUMNS.MONITOR_ID];

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
                            return processRecords(records);
                        }

                        parse(csvData, {
                            columns: true,
                            skip_empty_lines: true,
                            trim: true,
                            delimiter: ';'
                        }, (err2, records2) => {
                            if (!err2 && records2 && records2.length > 0) {
                                return processRecords(records2);
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

        // D2: execFile com args array evita shell quoting no displayId.
        execFile(this.tool, [CLI_FLAGS.SET_PRIMARY, displayId], { timeout: TIMING.EXEC_TIMEOUT_MS }, (error) => {
            if (error) {
                this.showError(`Erro ao alterar monitor:\n${error.message}`);
                return;
            }

            if (modeName === MODES.GAME) {
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
                title: APP_NAME,
                body: message,
                icon: this.iconPath,
                silent: false
            }).show();
        } else if (this.tray) {
            this.tray.displayBalloon({
                title: APP_NAME,
                content: message,
                icon: this.iconPath
            });
        }
    }

    showUpdateNotification(message, onClick = null) {
        const title = `${APP_NAME} - Atualização`;
        if (Notification.isSupported()) {
            const notification = new Notification({
                title: title,
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
                title: title,
                content: message,
                icon: this.iconPath
            });
        }
    }

    canUseAutoUpdater() {
        return app.isPackaged && process.platform === 'win32';
    }

    setUpdateStatus(phase, statusLabel) {
        this.updatePhase = phase;
        this.updateStatusLabel = statusLabel;
        if (phase === UPDATE_PHASE.CHECKING) {
            this.isCheckingForUpdate = true;
        } else if (phase !== UPDATE_PHASE.DOWNLOADING) {
            this.isCheckingForUpdate = false;
        }
        this.updateTrayMenu();
    }

    initializeAutoUpdater() {
        if (this.autoUpdaterInitialized) return;
        this.autoUpdaterInitialized = true;

        if (!this.canUseAutoUpdater()) return;

        autoUpdater.autoDownload = true;
        autoUpdater.autoInstallOnAppQuit = true;

        autoUpdater.on('checking-for-update', () => {
            this.setUpdateStatus(UPDATE_PHASE.CHECKING, 'Verificando atualizações...');
        });

        autoUpdater.on('update-available', info => {
            this.setUpdateStatus(UPDATE_PHASE.DOWNLOADING, `Nova versão ${info.version} encontrada. Baixando...`);
            this.showUpdateNotification(`Versão ${info.version} disponível. Download iniciado.`);
        });

        autoUpdater.on('update-not-available', () => {
            this.isUpdateDownloaded = false;
            this.setUpdateStatus(UPDATE_PHASE.IDLE, 'Aplicativo atualizado');
        });

        autoUpdater.on('download-progress', progress => {
            const percent = Math.round(progress.percent || 0);
            this.setUpdateStatus(UPDATE_PHASE.DOWNLOADING, `Baixando atualização... ${percent}%`);
        });

        autoUpdater.on('update-downloaded', info => {
            this.isUpdateDownloaded = true;
            this.setUpdateStatus(UPDATE_PHASE.DOWNLOADED, `Atualização pronta (${info.version}) — instalando em 10s...`);
            this.showUpdateNotification(
                `Versão ${info.version} baixada. O app será reiniciado em 10 segundos para instalar.`,
                () => this.installDownloadedUpdate()
            );
            setTimeout(() => this.installDownloadedUpdate(), TIMING.AUTO_INSTALL_MS);
        });

        autoUpdater.on('error', error => {
            this.setUpdateStatus(UPDATE_PHASE.ERROR, 'Erro no auto-update');
            console.error('Erro no auto-update:', error);
        });
    }

    async checkForUpdates(manual = false) {
        if (!this.canUseAutoUpdater()) {
            this.setUpdateStatus(UPDATE_PHASE.UNAVAILABLE, 'Atualização automática indisponível neste modo');
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
            this.setUpdateStatus(UPDATE_PHASE.ERROR, 'Erro ao verificar atualização');
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
        this.setUpdateStatus(UPDATE_PHASE.INSTALLING, 'Instalando atualização...');

        setTimeout(() => {
            try {
                autoUpdater.quitAndInstall(false, true);
            } catch (error) {
                this.isInstallingUpdate = false;
                this.setUpdateStatus(UPDATE_PHASE.ERROR, 'Erro ao instalar atualização');
                console.error('Erro ao instalar atualização:', error);
            }
        }, TIMING.INSTALL_PRE_DELAY_MS);
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
        const phase = this.updatePhase;

        if (this.isUpdateDownloaded && phase !== UPDATE_PHASE.CHECKING && phase !== UPDATE_PHASE.DOWNLOADING && phase !== UPDATE_PHASE.INSTALLING) {
            return [{
                label: '⚡ Instalar atualização',
                click: () => this.installDownloadedUpdate()
            }];
        }

        if (phase === UPDATE_PHASE.CHECKING || phase === UPDATE_PHASE.DOWNLOADING || phase === UPDATE_PHASE.INSTALLING) {
            return [{
                label: `🔄 ${this.updateStatusLabel}`,
                enabled: false
            }];
        }

        if (phase === UPDATE_PHASE.UNAVAILABLE) {
            return [{
                label: '🔄 Verificação indisponível',
                enabled: false
            }];
        }

        return [{
            label: '🔄 Verificar atualizações',
            click: () => this.checkForUpdates(true)
        }];
    }

    updateTrayMenu() {
        if (!this.tray) return;

        const autoStartEnabled = app.getLoginItemSettings().openAtLogin;
        const autoStartIcon = autoStartEnabled ? '✅' : '⬜';

        const contextMenu = Menu.buildFromTemplate([
            {
                label: `🖥️ ${APP_NAME}`,
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
            name: APP_NAME,
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

    const gotTheLock = app.requestSingleInstanceLock();

    if (!gotTheLock) {
        app.quit();
    } else {
        app.on('second-instance', () => {
            // Tray-only: nada a fazer, mas ativamos a janela/bandeja se desejado no futuro.
        });

        app.whenReady().then(() => {
            monitorSwitcher = new MonitorSwitcherApp();
            monitorSwitcher.init().catch(error => {
                console.error('Erro durante inicialização:', error);
            });
        });

        app.on('before-quit', () => {
            if (monitorSwitcher && monitorSwitcher.tray) {
                monitorSwitcher.tray.destroy();
            }
        });
    }
}
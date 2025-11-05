const { app, BrowserWindow, Tray, Menu, nativeImage, dialog, Notification } = require('electron');
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
        this.display1StableId = ''; // ID estável configurado (Serial Number ou Monitor ID)
        this.display2StableId = ''; // ID estável configurado (Serial Number ou Monitor ID)
        this.tray = null;
        this.currentPrimaryStableId = null; // ID estável do monitor atualmente principal (para lógica de alternância)
        this.isInitialized = false;
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
        console.log('Iniciando aplicação...');
        
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
        
        // Sincroniza o estado inicial com o monitor principal real
        await this.syncCurrentPrimaryState();

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
            console.log(`Configuração carregada - DISPLAY1 (Stable): ${this.display1StableId}, DISPLAY2 (Stable): ${this.display2StableId}`);
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

    /**
     * Consulta o MultiMonitorTool para obter a lista atual de monitores e identifica o principal.
     * @returns {Promise<{currentPrimaryId: string, currentPrimaryStableId: string, targetId: string, targetStableId: string, targetModeName: string}|null>}
     */
    async getMonitorStateForToggle() {
        const tempCsvPath = path.join(app.getPath('temp'), 'monitors.csv');
        const command = `"${this.tool}" /scomma "${tempCsvPath}"`;
        
        console.log(`Consultando estado dos monitores: ${command}`);

        return new Promise((resolve) => {
            exec(command, { timeout: 5000 }, async (error, stdout, stderr) => {
                if (error) {
                    console.error(`Erro ao consultar monitores: ${error}`);
                    this.showError(`Erro ao consultar monitores:\n${error.message}`);
                    return resolve(null);
                }
                
                if (!fs.existsSync(tempCsvPath)) {
                    this.showError('Arquivo de estado do monitor não foi criado.');
                    return resolve(null);
                }

                try {
                    const csvData = fs.readFileSync(tempCsvPath, 'utf8');
                    fs.unlinkSync(tempCsvPath); // Limpa o arquivo temporário
                    
                    parse(csvData, {
                        columns: true,
                        skip_empty_lines: true,
                        trim: true
                    }, (err, records) => {
                        if (err) {
                            console.error('Erro ao analisar CSV:', err);
                            this.showError('Erro ao analisar dados de monitor.');
                            return resolve(null);
                        }
                        
                        const primaryMonitor = records.find(r => r['Is Primary'] === 'Yes');
                        
                        if (!primaryMonitor) {
                            this.showError('Não foi possível identificar o monitor principal atual.');
                            return resolve(null);
                        }
                        
                        // O ID a ser usado no /SetPrimary é o 'Monitor ID' ou 'Device ID'
                        // O Monitor ID é mais estável que o Device ID (\\.\DISPLAY1), mas menos que o Serial Number.
                        // O MultiMonitorTool aceita o Monitor ID ou o Serial Number.
                        // Vamos usar o Monitor ID (que inclui o Serial Number se disponível) ou o Device ID como fallback para o comando.
                        
                        let currentPrimaryId = primaryMonitor['Monitor ID'] || primaryMonitor['Device ID'];
                        let currentPrimaryStableId = primaryMonitor['Monitor Serial Number'] || primaryMonitor['Monitor ID'];
                        
                        // Se o Serial Number for '00000000', o Monitor ID é o melhor identificador estável.
                        if (currentPrimaryStableId.startsWith('00000')) {
                            currentPrimaryStableId = primaryMonitor['Monitor ID'];
                        }

                        // Garante que o ID usado no comando seja o mais robusto que o MultiMonitorTool aceita
                        // O MultiMonitorTool aceita o Monitor ID completo ou o Serial Number.
                        // Usaremos o Monitor ID completo, pois é o que a aplicação original usava em DISPLAY2.
                        currentPrimaryId = primaryMonitor['Monitor ID'];
                        
                        // Mapeia o ID estável atual para o configurado
                        let isDisplay1Primary = currentPrimaryStableId.includes(this.display1StableId);
                        let isDisplay2Primary = currentPrimaryStableId.includes(this.display2StableId);
                        
                        let targetStableId;
                        let targetModeName;
                        
                        if (isDisplay1Primary) {
                            targetStableId = this.display2StableId;
                            targetModeName = 'Modo Jogo';
                        } else if (isDisplay2Primary) {
                            targetStableId = this.display1StableId;
                            targetModeName = 'Modo Reunião';
                        } else {
                            // Se o monitor principal atual não for nenhum dos configurados, não podemos alternar.
                            this.showError(`Monitor principal atual (${currentPrimaryStableId}) não corresponde a DISPLAY1 ou DISPLAY2 configurados.`);
                            return resolve(null);
                        }
                        
                        // Encontra o monitor alvo na lista de records
                        const targetMonitor = records.find(r => {
                            const stableId = r['Monitor Serial Number'] || r['Monitor ID'];
                            return stableId.includes(targetStableId);
                        });

                        if (!targetMonitor) {
                            this.showError(`Monitor alvo com ID estável ${targetStableId} não encontrado na lista atual de monitores.`);
                            return resolve(null);
                        }
                        
                        // O ID real a ser usado no comando /SetPrimary para o monitor alvo
                        const targetId = targetMonitor['Monitor ID'];

                        console.log(`Monitor Principal Atual (Stable ID): ${currentPrimaryStableId}`);
                        console.log(`Monitor Alvo (Stable ID): ${targetStableId}`);
                        
                        // Atualiza o estado interno para o ID estável do monitor principal atual
                        this.currentPrimaryStableId = isDisplay1Primary ? this.display1StableId : this.display2StableId;

                        resolve({
                            currentPrimaryId: currentPrimaryId,
                            currentPrimaryStableId: this.currentPrimaryStableId,
                            targetId: targetId,
                            targetStableId: targetStableId,
                            targetModeName: targetModeName
                        });
                    });
                } catch (e) {
                    console.error('Erro ao processar estado do monitor:', e);
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
            console.log(`Estado inicial sincronizado com: ${this.currentPrimaryStableId}`);
        } else {
            // Fallback: se não conseguir sincronizar, assume DISPLAY1 para tentar a primeira alternância
            this.currentPrimaryStableId = this.display1StableId;
            console.log(`Falha ao sincronizar estado. Assumindo: ${this.currentPrimaryStableId}`);
        }
    }

    async setPrimary(displayId, modeName) {
        if (!displayId || displayId.trim() === '') {
            this.showError('Display ID não configurado corretamente');
            return;
        }

        // O MultiMonitorTool aceita o Monitor ID completo ou o Serial Number.
        // Usamos o ID dinâmico encontrado na consulta.
        const command = `"${this.tool}" /SetPrimary "${displayId}"`;
        console.log(`Comando: ${command} (modo: ${modeName})`);

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Erro ao executar comando: ${error}`);
                this.showError(`Erro ao alterar monitor:\n${error.message}`);
                return;
            }
            
            // Se o comando foi bem sucedido, atualiza o estado interno
            // A lógica de alternância já garante que o ID estável do alvo é o novo principal.
            // Apenas garantimos que o estado interno seja o ID estável do monitor que acabamos de definir como principal.
            if (modeName === 'Modo Jogo') {
                this.currentPrimaryStableId = this.display2StableId;
            } else {
                this.currentPrimaryStableId = this.display1StableId;
            }
            
            console.log(`Estado interno atualizado para: ${this.currentPrimaryStableId}`);
            
            if (stderr) console.error(`Stderr: ${stderr}`);
            if (stdout) console.log(`Stdout: ${stdout}`);
            
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

    async togglePrimary() {
        if (!this.display1StableId || !this.display2StableId) {
            return this.showError('Configuração de displays não carregada corretamente.');
        }

        console.log(`Tentando alternar. Estado estável atual: ${this.currentPrimaryStableId}`);
        
        // Consulta o estado atual e determina o alvo
        const state = await this.getMonitorStateForToggle();
        
        if (state) {
            // O state já contém o ID dinâmico do monitor alvo e o nome do modo
            await this.setPrimary(state.targetId, state.targetModeName);
        } else {
            console.error('Falha ao obter estado do monitor para alternância.');
        }
    }

    updateTrayMenu() {
        if (!this.tray) return;
        
        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Alternar Monitor Principal',
                click: () => this.togglePrimary()
            },
            { type: 'separator' },
            {
                label: 'Editar Configuração',
                click: () => this.openConfigFile()
            },
            {
                label: 'Iniciar com Windows',
                type: 'checkbox',
                checked: app.getLoginItemSettings().openAtLogin,
                click: () => this.toggleAutoStart()
            },
            { type: 'separator' },
            {
                label: 'Sair',
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

// Exporta a classe para permitir testes
module.exports = MonitorSwitcherApp;

// Garante que o código de inicialização do Electron só rode quando não estiver em modo de teste
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
            // App de bandeja, não deve fechar
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
        app.on('second-instance', () => {
            console.log('Segunda instância detectada');
        });
    }
}
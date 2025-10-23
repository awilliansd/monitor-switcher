const { app, BrowserWindow, Tray, Menu, nativeImage, dialog, Notification } = require('electron');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

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
        this.display1 = '';
        this.display2 = '';
        this.tray = null;
        this.mainWindow = null;
        this.isInitialized = false;
    }

    initializePaths() {
        if (this.isInitialized) return;
        
        this.isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
        
        this.tool = this.getResourcePath('MultiMonitorTool.exe');
        this.configFile = this.getResourcePath('display_config.txt');
        this.iconPath = this.getResourcePath('monitorswitcher.ico');
        
        this.isInitialized = true;
        
        console.log('Caminhos inicializados:');
        console.log(`Modo: ${this.isDev ? 'Desenvolvimento' : 'Produção'}`);
        console.log(`Caminho do tool: ${this.tool}`);
        console.log(`Caminho do config: ${this.configFile}`);
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
        
        const isAutoStarted = process.argv.includes('--hidden') || app.getLoginItemSettings().wasOpenedAtLogin;
        
        if (isAutoStarted) {
            console.log('Aplicativo iniciado automaticamente com o Windows');
        }
        
        if (!fs.existsSync(this.tool)) {
            await this.showError(`Arquivo '${path.basename(this.tool)}' não encontrado em:\n${this.tool}`);
            setTimeout(() => app.quit(), 3000);
            return;
        }

        if (!fs.existsSync(this.configFile)) {
            await this.showError(`Arquivo '${path.basename(this.configFile)}' não encontrado em:\n${this.configFile}`);
            setTimeout(() => app.quit(), 3000);
            return;
        }

        this.loadDisplayConfig();
        this.createTray();
        
        if (!isAutoStarted && !this.isDev) {
            this.showBalloon('Monitor Switcher iniciado');
        }
    }

    loadDisplayConfig() {
        try {
            const data = fs.readFileSync(this.configFile, 'utf8');
            const lines = data.split('\n');
            this.display1 = '';
            this.display2 = '';
            lines.forEach(line => {
                const trimmedLine = line.trim();
                if (trimmedLine.startsWith('DISPLAY1=')) {
                    this.display1 = trimmedLine.substring('DISPLAY1='.length).trim();
                } else if (trimmedLine.startsWith('DISPLAY2=')) {
                    this.display2 = trimmedLine.substring('DISPLAY2='.length).trim();
                }
            });
            console.log(`Configuração carregada - DISPLAY1: ${this.display1}, DISPLAY2: ${this.display2}`);
        } catch (error) {
            console.error('Erro ao carregar configuração:', error);
        }
    }

    // Função para dividir CSV respeitando aspas
    parseCsvLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current);
        return result;
    }

    /**
     * Obtém o identificador estável (Serial Number ou Monitor ID) do monitor principal atual.
     */
    async getCurrentPrimaryId() {
        const tempDir = app.getPath('temp');
        const csvPath = path.join(tempDir, 'monitorswitcher_temp_primary.csv');
        
        await new Promise((resolve, reject) => {
            const proc = spawn(this.tool, ['/scomma', csvPath], {
                stdio: ['ignore', 'pipe', 'pipe'],
                detached: false,
                windowsHide: true
            });
            proc.on('close', () => resolve());
            proc.on('error', reject);
        });

        if (!fs.existsSync(csvPath)) return null;

        const csvData = fs.readFileSync(csvPath, 'utf8');
        const lines = csvData.split('\n');
        let foundId = null;
        let header = [];

        lines.forEach((line, idx) => {
            if (line.trim() === '' || foundId) return;

            const fields = this.parseCsvLine(line).map(f => f.replace(/"/g, '').trim());
            
            if (idx === 0) {
                header = fields;
                return;
            }

            const primaryIdx = header.findIndex(h => h.toLowerCase() === 'primary');
            const primary = primaryIdx !== -1 ? fields[primaryIdx] : '';

            if (primary.toLowerCase() === 'yes') {
                const serialNumberIdx = header.findIndex(h => h.toLowerCase() === 'monitor serial number');
                const monitorIdIdx = header.findIndex(h => h.toLowerCase() === 'monitor id');

                const serialNumber = serialNumberIdx !== -1 ? fields[serialNumberIdx] : '';
                const monitorId = monitorIdIdx !== -1 ? fields[monitorIdIdx] : '';

                // Prioriza o número de série se for válido
                if (serialNumber && !/^0+$/.test(serialNumber.trim())) {
                    foundId = serialNumber;
                } else {
                    foundId = monitorId;
                }
            }
        });

        try { fs.unlinkSync(csvPath); } catch {}
        return foundId;
    }

    createTray() {
        let trayIcon;
        
        if (fs.existsSync(this.iconPath)) {
            trayIcon = nativeImage.createFromPath(this.iconPath);
        } else {
            console.log(`Ícone não encontrado em: ${this.iconPath}`);
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

    async setPrimary(displayId, modeName) {
        if (!displayId || displayId.trim() === '') {
            this.showError('Display ID não configurado corretamente');
            return;
        }

        // MultiMonitorTool aceita o ID/Serial Number diretamente, entre aspas
        const command = `"${this.tool}" /SetPrimary "${displayId}"`;
        console.log(`Comando: ${command} (modo: ${modeName})`);

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Erro ao executar comando: ${error}`);
                this.showError(`Erro ao alterar monitor:\n${error.message}`);
                return;
            }
            if (stderr) {
                console.error(`Stderr: ${stderr}`);
            }
            console.log(`Stdout: ${stdout}`);
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
        if (!this.display1 || !this.display2) {
            this.showError('Configuração de displays não carregada corretamente.');
            return;
        }

        const currentPrimaryId = await this.getCurrentPrimaryId();
        console.log(`ID do monitor principal atual: ${currentPrimaryId}`);

        if (!currentPrimaryId) {
            this.showError('Não foi possível detectar o monitor principal atual.');
            return;
        }

        // Normaliza as strings para comparação
        const normCurrent = currentPrimaryId.trim();
        const normDisplay1 = this.display1.trim();
        const normDisplay2 = this.display2.trim();

        let targetDisplayId;
        let modeName;

        if (normCurrent === normDisplay1) {
            targetDisplayId = this.display2;
            modeName = 'Modo Jogo';
        } else if (normCurrent === normDisplay2) {
            targetDisplayId = this.display1;
            modeName = 'Modo Reunião';
        } else {
            console.log(`IDs para comparação: \nAtual: '${normCurrent}'\nDisplay1: '${normDisplay1}'\nDisplay2: '${normDisplay2}'`);
            this.showError('O monitor principal atual não corresponde a nenhum dos configurados.');
            return;
        }

        await this.setPrimary(targetDisplayId, modeName);
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

const { app, BrowserWindow, Tray, Menu, nativeImage, dialog, Notification } = require('electron');
const { exec } = require('child_process');
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
        this.currentPrimary = null; // Variável para controlar o estado
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
        
        // Define o estado inicial. Assume que DISPLAY1 é o principal ao iniciar.
        // O usuário pode precisar trocar uma vez para sincronizar.
        this.currentPrimary = this.display1;
        console.log(`Estado inicial definido para: ${this.currentPrimary}`);

        this.createTray();
        
        const isAutoStarted = process.argv.includes('--hidden') || app.getLoginItemSettings().wasOpenedAtLogin;
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

    async setPrimary(displayId, modeName) {
        if (!displayId || displayId.trim() === '') {
            this.showError('Display ID não configurado corretamente');
            return;
        }

        const command = `"${this.tool}" /SetPrimary "${displayId}"`;
        console.log(`Comando: ${command} (modo: ${modeName})`);

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Erro ao executar comando: ${error}`);
                this.showError(`Erro ao alterar monitor:\n${error.message}`);
                return;
            }
            
            // Se o comando foi bem sucedido, atualiza o estado interno
            this.currentPrimary = displayId;
            console.log(`Estado interno atualizado para: ${this.currentPrimary}`);
            
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
        if (!this.display1 || !this.display2) {
            return this.showError('Configuração de displays não carregada corretamente.');
        }

        console.log(`Tentando alternar. Estado atual: ${this.currentPrimary}`);

        let targetDisplayId;
        let modeName;

        if (this.currentPrimary === this.display1) {
            targetDisplayId = this.display2;
            modeName = 'Modo Jogo';
        } else {
            targetDisplayId = this.display1;
            modeName = 'Modo Reunião';
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

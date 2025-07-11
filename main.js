const { app, BrowserWindow, Tray, Menu, nativeImage, dialog, Notification } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class MonitorSwitcherApp {
    constructor() {
        this.tool = 'MultiMonitorTool.exe';
        this.configFile = 'display_config.txt';
        this.display1 = '';
        this.display2 = '';
        this.tray = null;
        this.mainWindow = null;
    }

    async init() {
        // Verifica se os arquivos necessários existem
        if (!fs.existsSync(this.tool)) {
            await this.showError(`Arquivo '${this.tool}' não encontrado.`);
            app.quit();
            return;
        }

        if (!fs.existsSync(this.configFile)) {
            await this.showError(`Arquivo '${this.configFile}' não encontrado.`);
            app.quit();
            return;
        }

        this.loadDisplayConfig();
        this.createTray();
    }

    loadDisplayConfig() {
        try {
            const data = fs.readFileSync(this.configFile, 'utf8');
            const lines = data.split('\n');
            
            lines.forEach(line => {
                const trimmedLine = line.trim();
                if (trimmedLine.startsWith('DISPLAY1=')) {
                    this.display1 = trimmedLine.substring('DISPLAY1='.length).trim();
                } else if (trimmedLine.startsWith('DISPLAY2=')) {
                    this.display2 = trimmedLine.substring('DISPLAY2='.length).trim();
                }
            });
        } catch (error) {
            console.error('Erro ao carregar configuração:', error);
        }
    }

    createTray() {
        // Cria o ícone da bandeja
        const iconPath = path.join(__dirname, 'monitorswitcher.ico');
        let trayIcon;
        
        if (fs.existsSync(iconPath)) {
            trayIcon = nativeImage.createFromPath(iconPath);
        } else {
            // Fallback para um ícone padrão se não encontrar o arquivo
            trayIcon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
        }

        this.tray = new Tray(trayIcon);
        this.tray.setToolTip('Monitor Switcher');

        // Cria o menu de contexto
        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Modo Reunião',
                click: () => this.setPrimary(this.display2, 'Modo Reunião')
            },
            {
                label: 'Modo Jogo',
                click: () => this.setPrimary(this.display1, 'Modo Jogo')
            },
            { type: 'separator' },
            {
                label: 'Sair',
                click: () => {
                    app.quit();
                }
            }
        ]);

        this.tray.setContextMenu(contextMenu);
    }

    setPrimary(displayId, modeName) {
        if (!displayId || displayId.trim() === '') {
            console.log('Display ID vazio');
            return;
        }

        const args = ['/SetPrimary', `"${displayId}"`];
        
        try {
            const process = spawn(this.tool, args, {
                stdio: 'ignore',
                detached: false
            });

            process.on('close', (code) => {
                if (code === 0) {
                    this.showBalloon(`Alterado para ${modeName}.`);
                } else {
                    console.error(`Processo terminou com código: ${code}`);
                }
            });

            process.on('error', (error) => {
                console.error('Erro ao executar o processo:', error);
                this.showError(`Erro ao definir monitor principal:\n${error.message}`);
            });

        } catch (error) {
            console.error('Erro ao iniciar processo:', error);
            this.showError(`Erro ao definir monitor principal:\n${error.message}`);
        }
    }

    showBalloon(message) {
        // No Electron, usamos a API de Notification
        if (Notification.isSupported()) {
            const notification = new Notification({
                title: 'Monitor Switcher',
                body: message,
                icon: path.join(__dirname, 'monitorswitcher.ico'),
                silent: false
            });

            notification.show();
        } else {
            console.log('Notificações não suportadas:', message);
        }
    }

    async showError(message) {
        const options = {
            type: 'error',
            title: 'Erro',
            message: message,
            buttons: ['OK']
        };

        await dialog.showMessageBox(options);
    }
}

// Instância da aplicação
const monitorSwitcher = new MonitorSwitcherApp();

// Configuração do Electron
app.whenReady().then(() => {
    monitorSwitcher.init();
});

app.on('window-all-closed', () => {
    // No macOS, aplicações ficam ativas mesmo sem janelas
    if (process.platform !== 'darwin') {
        // Não sai da aplicação porque é um app de bandeja
        // app.quit();
    }
});

app.on('activate', () => {
    // No macOS, recria a janela quando clica no ícone do dock
    if (BrowserWindow.getAllWindows().length === 0) {
        // Este app não tem janela principal, apenas tray
    }
});

// Previne que a aplicação saia quando todas as janelas são fechadas
app.on('before-quit', (event) => {
    if (monitorSwitcher.tray) {
        monitorSwitcher.tray.destroy();
    }
});

// Garante que apenas uma instância da aplicação rode
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        // Alguém tentou executar uma segunda instância
        console.log('Segunda instância detectada');
    });
}
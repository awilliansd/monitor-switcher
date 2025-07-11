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
            this.showError('Display ID não configurado corretamente');
            return;
        }

        console.log(`Tentando definir monitor principal: ${displayId}`);
        console.log(`Modo: ${modeName}`);

        // Converte os nomes de display para números
        let displayNumber = '';
        
        if (displayId.includes('DISPLAY1') || displayId === '1') {
            displayNumber = '1';
        } else if (displayId.includes('DISPLAY2') || displayId === '2') {
            displayNumber = '2';
        } else {
            // Se não for um formato reconhecido, tenta usar como está
            displayNumber = displayId;
        }
        
        const args = ['/SetPrimary', displayNumber];
        
        console.log(`Comando: ${this.tool} ${args.join(' ')}`);
        
        try {
            const process = spawn(this.tool, args, {
                stdio: ['ignore', 'pipe', 'pipe'],
                detached: false,
                windowsHide: true,
                shell: false
            });

            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            process.on('close', (code) => {
                console.log(`Processo terminou com código: ${code}`);
                if (stdout) console.log(`stdout: ${stdout}`);
                if (stderr) console.log(`stderr: ${stderr}`);
                
                if (code === 0) {
                    this.showBalloon(`Alterado para ${modeName}.`);
                } else {
                    this.showError(`Erro ao alterar monitor (código ${code}):\n${stderr || 'Erro desconhecido'}`);
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

    listMonitors() {
        const process = spawn(this.tool, ['/scomma', 'monitors_temp.csv'], {
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: false,
            windowsHide: true
        });

        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        process.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        process.on('close', (code) => {
            if (code === 0) {
                // Lê o arquivo CSV gerado
                setTimeout(() => {
                    try {
                        if (fs.existsSync('monitors_temp.csv')) {
                            const csvData = fs.readFileSync('monitors_temp.csv', 'utf8');
                            const lines = csvData.split('\n');
                            
                            let monitorInfo = 'Monitores encontrados:\n\n';
                            
                            lines.forEach((line, index) => {
                                if (index === 0) return; // Pula o cabeçalho
                                if (line.trim() === '') return; // Pula linhas vazias
                                
                                const fields = line.split(',');
                                if (fields.length > 0) {
                                    const name = fields[0] ? fields[0].replace(/"/g, '') : '';
                                    const description = fields[1] ? fields[1].replace(/"/g, '') : '';
                                    const active = fields[2] ? fields[2].replace(/"/g, '') : '';
                                    const primary = fields[3] ? fields[3].replace(/"/g, '') : '';
                                    
                                    monitorInfo += `Nome: ${name}\n`;
                                    monitorInfo += `Descrição: ${description}\n`;
                                    monitorInfo += `Ativo: ${active}\n`;
                                    monitorInfo += `Principal: ${primary}\n\n`;
                                }
                            });
                            
                            monitorInfo += `\nConfiguração atual:\n`;
                            monitorInfo += `DISPLAY1=${this.display1}\n`;
                            monitorInfo += `DISPLAY2=${this.display2}`;
                            
                            this.showInfo('Lista de Monitores', monitorInfo);
                            
                            // Remove o arquivo temporário
                            fs.unlinkSync('monitors_temp.csv');
                        }
                    } catch (error) {
                        console.error('Erro ao ler lista de monitores:', error);
                        this.showError('Erro ao listar monitores: ' + error.message);
                    }
                }, 1000);
            } else {
                this.showError(`Erro ao listar monitores (código ${code}):\n${stderr || 'Erro desconhecido'}`);
            }
        });
    }

    testConfiguration() {
        let testResult = 'Teste de Configuração:\n\n';
        
        // Verifica se os arquivos existem
        testResult += `✓ MultiMonitorTool.exe: ${fs.existsSync(this.tool) ? 'Encontrado' : 'NÃO ENCONTRADO'}\n`;
        testResult += `✓ display_config.txt: ${fs.existsSync(this.configFile) ? 'Encontrado' : 'NÃO ENCONTRADO'}\n`;
        
        // Verifica configuração
        testResult += `\nConfigurações carregadas:\n`;
        testResult += `DISPLAY1: ${this.display1 || 'NÃO CONFIGURADO'}\n`;
        testResult += `DISPLAY2: ${this.display2 || 'NÃO CONFIGURADO'}\n`;
        
        // Testa comando básico
        testResult += `\nTestando comando básico...\n`;
        
        const process = spawn(this.tool, ['/help'], {
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: false,
            windowsHide: true
        });

        process.on('close', (code) => {
            if (code === 0) {
                testResult += `✓ MultiMonitorTool.exe responde corretamente\n`;
            } else {
                testResult += `✗ MultiMonitorTool.exe falhou (código ${code})\n`;
            }
            
            this.showInfo('Teste de Configuração', testResult);
        });

        process.on('error', (error) => {
            testResult += `✗ Erro ao executar MultiMonitorTool.exe: ${error.message}\n`;
            this.showInfo('Teste de Configuração', testResult);
        });
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
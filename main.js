const { app, BrowserWindow, Tray, Menu, nativeImage, dialog, Notification } = require('electron');
const { spawn } = require('child_process');
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
        
        // Detecta se está em desenvolvimento ou produção
        this.isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
        
        // Define os caminhos dos arquivos
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
            // Em desenvolvimento, os arquivos estão na pasta do projeto
            return path.join(__dirname, fileName);
        } else {
            // Em produção, os arquivos estão em process.resourcesPath
            return path.join(process.resourcesPath, fileName);
        }
    }

    async init() {
        console.log('Iniciando aplicação...');
        
        // Inicializa os caminhos primeiro
        this.initializePaths();
        
        // Configura o nome da aplicação para notificações no Windows
        if (process.platform === 'win32') {
            app.setAppUserModelId('MonitorSwitcher');
        }
        
        // Verifica se foi iniciado automaticamente com o Windows
        const isAutoStarted = process.argv.includes('--hidden') || app.getLoginItemSettings().wasOpenedAtLogin;
        
        if (isAutoStarted) {
            console.log('Aplicativo iniciado automaticamente com o Windows');
        }
        
        // Verifica se os arquivos necessários existem
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
        
        // Mostra notificação apenas se não foi iniciado automaticamente
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

    /**
     * Busca o número do monitor (1, 2, ...) pelo identificador único salvo na config.
     * Prioriza o campo 'Short Monitor ID' do CSV do MultiMonitorTool.
     */
    async getMonitorNumberById(uniqueId) {
        const tempDir = app.getPath('temp');
        const csvPath = path.join(tempDir, 'monitorswitcher_temp.csv');
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
        let found = null;
        let header = [];
        const allIds = [];
        // Função para normalizar barras invertidas
        function normalizeSlashes(str) {
            return (str || '').replace(/\\+/g, '\\');
        }
        // Função para dividir CSV respeitando aspas
        function parseCsvLine(line) {
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
        const normUniqueId = normalizeSlashes(uniqueId);
        lines.forEach((line, idx) => {
            if (line.trim() === '') return;
            const fields = parseCsvLine(line).map(f => f.replace(/"/g, '').trim());
            if (idx === 0) {
                header = fields;
                return;
            }
            const shortIdIdx = header.findIndex(h => h.toLowerCase() === 'short monitor id');
            const deviceNameIdx = header.findIndex(h => h.toLowerCase() === 'device name');
            const descriptionIdx = header.findIndex(h => h.toLowerCase() === 'description');
            const shortId = shortIdIdx !== -1 ? fields[shortIdIdx] : '';
            const deviceName = deviceNameIdx !== -1 ? fields[deviceNameIdx] : '';
            const description = descriptionIdx !== -1 ? fields[descriptionIdx] : '';
            allIds.push({ shortId, deviceName, description });
            let match = false;
            if (shortId && normUniqueId === normalizeSlashes(shortId)) match = true;
            if (!match && deviceName && normUniqueId === normalizeSlashes(deviceName)) match = true;
            if (!match && description && normUniqueId === normalizeSlashes(description)) match = true;
            if (match) {
                found = (idx).toString();
            }
        });
        console.log('Identificadores encontrados no CSV:', allIds);
        console.log('Procurando por:', uniqueId);
        try { fs.unlinkSync(csvPath); } catch {}
        return found;
    }

    createTray() {
        // Cria o ícone da bandeja
        let trayIcon;
        
        if (fs.existsSync(this.iconPath)) {
            trayIcon = nativeImage.createFromPath(this.iconPath);
        } else {
            console.log(`Ícone não encontrado em: ${this.iconPath}`);
            // Fallback para um ícone padrão se não encontrar o arquivo
            trayIcon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
        }

        this.tray = new Tray(trayIcon);
        this.tray.setToolTip('Monitor Switcher');

        // Cria o menu de contexto
        this.updateTrayMenu();
    }

    async showError(message) {
        const options = {
            type: 'error',
            title: 'Erro',
            message: message,
            buttons: ['OK']
        };

        return await dialog.showMessageBox(options);
    }

    async setPrimary(displayId, modeName) {
        if (!displayId || displayId.trim() === '') {
            console.log('Display ID vazio');
            this.showError('Display ID não configurado corretamente');
            return;
        }

        // Busca o número do monitor pelo identificador único
        const displayNumber = await this.getMonitorNumberById(displayId);
        if (!displayNumber) {
            this.showError('Não foi possível localizar o monitor correspondente ao identificador salvo.');
            return;
        }

        const args = ['/SetPrimary', displayNumber];
        console.log(`Comando: ${this.tool} ${args.join(' ')} (modo: ${modeName})`);

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
        // Prioriza a notificação do sistema (mais moderna)
        if (Notification.isSupported()) {
            const notification = new Notification({
                title: 'Monitor Switcher',
                body: message,
                icon: this.iconPath,
                silent: false
            });

            notification.show();
        } else if (this.tray) {
            // Fallback para notificação do tray (Windows mais antigos)
            this.tray.displayBalloon({
                title: 'Monitor Switcher',
                content: message,
                icon: this.iconPath
            });
        } else {
            console.log('Notificações não suportadas:', message);
        }
    }

    listMonitors() {
        // Garante que os caminhos estão inicializados
        if (!this.isInitialized) {
            this.initializePaths();
        }
        
        // Define o caminho para o arquivo CSV temporário na pasta TEMP do usuário
        // Isso evita problemas de permissão em Program Files
        const tempDir = app.getPath('temp');
        const csvPath = path.join(tempDir, 'monitorswitcher_temp.csv');

        console.log(`Executando comando de listagem: ${this.tool} /scomma "${csvPath}"`);

        const childProcess = spawn(this.tool, ['/scomma', csvPath], {
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: false,
            windowsHide: true
        });

        let stdout = '';
        let stderr = '';

        childProcess.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        childProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        childProcess.on('close', (code) => {
            console.log(`Comando de listagem terminou com código: ${code}`);
            if (stdout) console.log(`stdout: ${stdout}`);
            if (stderr) console.log(`stderr: ${stderr}`);
            
            if (code === 0) {
                // Aguarda um pouco para garantir que o arquivo foi escrito
                setTimeout(() => {
                    this.processMonitorList(csvPath);
                }, 1500);
            } else {
                this.showError(`Erro ao listar monitores (código ${code}):\n${stderr || 'Erro desconhecido'}`);
            }
        });

        childProcess.on('error', (error) => {
            console.error('Erro ao executar comando de listagem:', error);
            this.showError(`Erro ao executar comando de listagem:\n${error.message}`);
        });
    }

    processMonitorList(csvPath) {
        try {
            if (fs.existsSync(csvPath)) {
                const csvData = fs.readFileSync(csvPath, 'utf8');
                console.log('Dados CSV lidos:', csvData);
                
                const lines = csvData.split('\n');
                
                let monitorInfo = 'Monitores encontrados:\n\n';
                
                lines.forEach((line, index) => {
                    if (index === 0) return; // Pula o cabeçalho
                    if (line.trim() === '') return; // Pula linhas vazias
                    
                    const fields = line.split(',');
                    if (fields.length > 3) {
                        const name = fields[0] ? fields[0].replace(/"/g, '') : '';
                        const description = fields[1] ? fields[1].replace(/"/g, '') : '';
                        const active = fields[2] ? fields[2].replace(/"/g, '') : '';
                        const primary = fields[3] ? fields[3].replace(/"/g, '') : '';
                        
                        monitorInfo += `Monitor ${index}:\n`;
                        monitorInfo += `  Nome: ${name}\n`;
                        monitorInfo += `  Descrição: ${description}\n`;
                        monitorInfo += `  Ativo: ${active}\n`;
                        monitorInfo += `  Principal: ${primary}\n\n`;
                    }
                });
                
                monitorInfo += `\nConfiguração atual:\n`;
                monitorInfo += `DISPLAY1=${this.display1}\n`;
                monitorInfo += `DISPLAY2=${this.display2}`;
                
                this.showInfo('Lista de Monitores', monitorInfo);
                
                // Remove o arquivo temporário
                try {
                    fs.unlinkSync(csvPath);
                } catch (deleteError) {
                    console.log('Erro ao deletar arquivo temporário:', deleteError);
                }
            } else {
                this.showError('Arquivo CSV temporário não foi criado. Verifique se o MultiMonitorTool.exe tem permissões de escrita.');
            }
        } catch (error) {
            console.error('Erro ao processar lista de monitores:', error);
            this.showError('Erro ao processar lista de monitores: ' + error.message);
        }
    }

    testConfiguration() {
        // Garante que os caminhos estão inicializados
        if (!this.isInitialized) {
            this.initializePaths();
        }
        
        let testResult = 'Teste de Configuração:\n\n';
        
        // Verifica se os arquivos existem
        testResult += `✓ MultiMonitorTool.exe: ${fs.existsSync(this.tool) ? 'Encontrado' : 'NÃO ENCONTRADO'}\n`;
        testResult += `✓ display_config.txt: ${fs.existsSync(this.configFile) ? 'Encontrado' : 'NÃO ENCONTRADO'}\n`;
        testResult += `✓ monitorswitcher.ico: ${fs.existsSync(this.iconPath) ? 'Encontrado' : 'NÃO ENCONTRADO'}\n`;
        
        // Verifica configuração
        testResult += `\nConfigurações carregadas:\n`;
        testResult += `DISPLAY1: ${this.display1 || 'NÃO CONFIGURADO'}\n`;
        testResult += `DISPLAY2: ${this.display2 || 'NÃO CONFIGURADO'}\n`;
        
        // Verifica modo
        testResult += `\nModo: ${this.isDev ? 'Desenvolvimento' : 'Produção'}\n`;
        testResult += `Caminho do tool: ${this.tool}\n`;
        
        // Testa comando básico
        testResult += `\nTestando comando básico...\n`;
        
        const testProcess = spawn(this.tool, ['/help'], {
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: false,
            windowsHide: true
        });

        testProcess.on('close', (code) => {
            if (code === 0) {
                testResult += `✓ MultiMonitorTool.exe responde corretamente\n`;
            } else {
                testResult += `✗ MultiMonitorTool.exe falhou (código ${code})\n`;
            }
            
            this.showInfo('Teste de Configuração', testResult);
        });

        testProcess.on('error', (error) => {
            testResult += `✗ Erro ao executar MultiMonitorTool.exe: ${error.message}\n`;
            this.showInfo('Teste de Configuração', testResult);
        });
    }

    toggleAutoStart() {
        const currentSettings = app.getLoginItemSettings();
        const willOpenAtLogin = !currentSettings.openAtLogin;
        
        app.setLoginItemSettings({
            openAtLogin: willOpenAtLogin,
            openAsHidden: true, // Inicia minimizado
            name: 'Monitor Switcher',
            path: process.execPath
        });
        
        // Atualiza o menu
        this.updateTrayMenu();
        
        // Mostra notificação
        const status = willOpenAtLogin ? 'habilitado' : 'desabilitado';
        this.showBalloon(`Inicialização automática ${status}`);
    }

    updateTrayMenu() {
        if (!this.tray) return;
        
        // Recria o menu com o estado atualizado
        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Modo Reunião',
                click: () => this.setPrimary(this.display1, 'Modo Reunião')
            },
            {
                label: 'Modo Jogo',
                click: () => this.setPrimary(this.display2, 'Modo Jogo')
            },
            { type: 'separator' },
            {
                label: 'Editar Configuração',
                click: () => this.openConfigFile()
            },
            {
                label: 'Listar Monitores',
                click: () => this.listMonitors()
            },
            {
                label: 'Testar Configuração',
                click: () => this.testConfiguration()
            },
            { type: 'separator' },
            {
                label: 'Iniciar com Windows',
                type: 'checkbox',
                checked: app.getLoginItemSettings().openAtLogin,
                click: () => this.toggleAutoStart()
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

    async showInfo(title, message) {
        const options = {
            type: 'info',
            title: title,
            message: message,
            buttons: ['OK']
        };

        return await dialog.showMessageBox(options);
    }
}

// Instância da aplicação
let monitorSwitcher = null;

// Configuração do Electron
app.whenReady().then(() => {
    monitorSwitcher = new MonitorSwitcherApp();
    monitorSwitcher.init().catch(error => {
        console.error('Erro durante inicialização:', error);
    });
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
    if (monitorSwitcher && monitorSwitcher.tray) {
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
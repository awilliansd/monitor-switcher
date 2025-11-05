const MonitorSwitcherApp = require('./main.js');

// Mocks simples e diretos
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

jest.mock('child_process', () => ({
  exec: jest.fn(),
}));

jest.mock('csv-parse', () => ({
  parse: jest.fn(),
}));

jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => '/tmp'),
    getLoginItemSettings: jest.fn(() => ({ 
      openAtLogin: false,
      wasOpenedAtLogin: false 
    })),
    setLoginItemSettings: jest.fn(),
    isPackaged: false,
    setAppUserModelId: jest.fn(),
    on: jest.fn(),
    quit: jest.fn(),
    requestSingleInstanceLock: jest.fn(() => true),
    whenReady: jest.fn(() => Promise.resolve()),
  },
  Tray: jest.fn(() => ({
    setToolTip: jest.fn(),
    setContextMenu: jest.fn(),
    displayBalloon: jest.fn(),
    destroy: jest.fn(),
  })),
  Menu: {
    buildFromTemplate: jest.fn(() => 'mock-menu'),
  },
  nativeImage: {
    createFromPath: jest.fn(() => 'mock-image'),
    createFromDataURL: jest.fn(() => 'mock-image'),
  },
  dialog: {
    showMessageBox: jest.fn(() => Promise.resolve({ response: 0 })),
  },
  Notification: {
    isSupported: jest.fn(() => false),
  },
  shell: {
    openPath: jest.fn(),
  }
}));

const fs = require('fs');
const { exec } = require('child_process');
const { parse } = require('csv-parse');
const { dialog } = require('electron');

describe('MonitorSwitcherApp', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    
    const mockConfigFile = 'DISPLAY1=6KL82W2\nDISPLAY2=MONITOR\\DHIFFFF\\{4d36e96e-e325-11ce-bfc1-08002be10318}';
    fs.readFileSync.mockReturnValue(mockConfigFile);
    fs.existsSync.mockReturnValue(true);
    fs.unlinkSync.mockImplementation(() => {});
    
    exec.mockImplementation((command, options, callback) => {
      if (callback && typeof callback === 'function') {
        callback(null, 'stdout', 'stderr');
      }
    });

    app = new MonitorSwitcherApp();
    app.loadDisplayConfig();
  });

  describe('Configuração Inicial', () => {
    test('deve carregar a configuração dos monitores corretamente', () => {
      expect(app.display1StableId).toBe('6KL82W2');
      expect(app.display2StableId).toBe('MONITOR\\DHIFFFF\\{4d36e96e-e325-11ce-bfc1-08002be10318}');
    });

    test('deve inicializar paths corretamente', () => {
      app.initializePaths();
      expect(app.isDev).toBe(true);
      expect(app.tool).toContain('MultiMonitorTool.exe');
      expect(app.configFile).toContain('display_config.txt');
    });
  });

  describe('Processamento de CSV', () => {
    test('deve processar CSV com vírgula corretamente', async () => {
      const mockRecords = [
        {
          'Monitor ID': 'MONITOR\\DELA114\\{4d36e96e-e325-11ce-bfc1-08002be10318}\\0003',
          'Monitor Serial Number': '6KL82W2',
          Primary: 'Yes',
          Active: 'Yes',
          Disconnected: 'No',
        },
        {
          'Monitor ID': 'MONITOR\\DHIFFFF\\{4d36e96e-e325-11ce-bfc1-08002be10318}\\0002',
          'Monitor Serial Number': '0000000000000',
          Primary: 'No',
          Active: 'Yes',
          Disconnected: 'No',
        }
      ];

      parse.mockImplementation((data, options, callback) => {
        callback(null, mockRecords);
      });

      const state = await app.getMonitorStateForToggle();

      expect(state).toBeTruthy();
      expect(state.currentPrimaryStableId).toBe('6KL82W2');
      expect(state.targetModeName).toBe('Modo Jogo');
    });

    test('deve tentar ponto e vírgula quando vírgula falhar', async () => {
      parse
        .mockImplementationOnce((data, options, callback) => {
          callback(new Error('Parse error'), null);
        })
        .mockImplementationOnce((data, options, callback) => {
          callback(null, []); // Retorna array vazio
        });

      const state = await app.getMonitorStateForToggle();

      expect(parse).toHaveBeenCalledTimes(2);
      // Não verificamos o state pois sabemos que vai ser null com array vazio
    });
  });

  describe('Lógica de Alternância', () => {
    test('deve alternar de DISPLAY1 para DISPLAY2', async () => {
      const mockRecords = [
        {
          'Monitor ID': 'MONITOR\\DELA114\\{4d36e96e-e325-11ce-bfc1-08002be10318}\\0003',
          'Monitor Serial Number': '6KL82W2',
          Primary: 'Yes',
          Active: 'Yes',
          Disconnected: 'No',
        },
        {
          'Monitor ID': 'MONITOR\\DHIFFFF\\{4d36e96e-e325-11ce-bfc1-08002be10318}\\0002',
          'Monitor Serial Number': '0000000000000',
          Primary: 'No',
          Active: 'Yes',
          Disconnected: 'No',
        }
      ];

      parse.mockImplementation((data, options, callback) => {
        callback(null, mockRecords);
      });

      await app.togglePrimary();

      expect(exec).toHaveBeenCalledWith(
        expect.stringContaining('/SetPrimary'),
        expect.any(Function)
      );
    });

    test('deve lidar com erro quando não encontra monitor principal', async () => {
      const mockRecords = [{
        'Monitor ID': 'MONITOR\\TEST\\{4d36e96e-e325-11ce-bfc1-08002be10318}\\0001',
        'Monitor Serial Number': '00000000',
        Primary: 'No',
        Active: 'No',
        Disconnected: 'Yes',
      }];

      parse.mockImplementation((data, options, callback) => {
        callback(null, mockRecords);
      });

      const state = await app.getMonitorStateForToggle();

      expect(state).toBeNull();
      expect(dialog.showMessageBox).toHaveBeenCalled();
    });
  });

  describe('Gerenciamento de Estado', () => {
    test('deve sincronizar estado inicial corretamente', async () => {
      const mockRecords = [{
        'Monitor ID': 'MONITOR\\DELA114\\{4d36e96e-e325-11ce-bfc1-08002be10318}\\0003',
        'Monitor Serial Number': '6KL82W2',
        Primary: 'Yes',
        Active: 'Yes',
        Disconnected: 'No',
      }];

      parse.mockImplementation((data, options, callback) => {
        callback(null, mockRecords);
      });

      await app.syncCurrentPrimaryState();

      expect(app.currentPrimaryStableId).toBe('6KL82W2');
    });

    test('deve usar fallback quando sincronização falha', async () => {
      exec.mockImplementation((command, options, callback) => {
        if (callback) {
          callback(new Error('Falha na consulta'), null, 'stderr');
        }
      });

      await app.syncCurrentPrimaryState();

      expect(app.currentPrimaryStableId).toBe('6KL82W2');
    });
  });

  describe('Tratamento de Erros', () => {
    test('deve lidar com arquivo de configuração ausente', async () => {
      fs.existsSync.mockReturnValue(false);
      
      await app.init();
      
      expect(dialog.showMessageBox).toHaveBeenCalled();
    });

    test('deve lidar com erro ao executar comando', async () => {
      exec.mockImplementation((command, options, callback) => {
        if (callback) {
          callback(new Error('Comando falhou'), null, 'stderr');
        }
      });

      await app.togglePrimary();

      expect(dialog.showMessageBox).toHaveBeenCalled();
    });
  });

  describe('Interface do Usuário', () => {
    test('deve atualizar menu da bandeja', () => {
      app.tray = {
        setContextMenu: jest.fn()
      };
      
      app.updateTrayMenu();
      
      expect(app.tray.setContextMenu).toHaveBeenCalledWith('mock-menu');
    });

    test('deve alternar inicialização automática', () => {
      const mockSetLoginItemSettings = require('electron').app.setLoginItemSettings;
      
      app.tray = {
        setContextMenu: jest.fn(),
        displayBalloon: jest.fn(),
      };
      
      app.toggleAutoStart();
      
      expect(mockSetLoginItemSettings).toHaveBeenCalledWith({
        openAtLogin: true,
        openAsHidden: true,
        name: 'Monitor Switcher',
        path: expect.any(String)
      });
    });

    test('deve abrir arquivo de configuração', () => {
      const { shell } = require('electron');
      
      app.configFile = '/path/to/config.txt';
      fs.existsSync.mockReturnValue(true);
      
      app.openConfigFile();
      
      expect(shell.openPath).toHaveBeenCalledWith('/path/to/config.txt');
    });
  });

  describe('Métodos Auxiliares', () => {
    test('deve mostrar erro corretamente', async () => {
      await app.showError('Mensagem de erro');
      
      expect(dialog.showMessageBox).toHaveBeenCalledWith({
        type: 'error',
        title: 'Erro',
        message: 'Mensagem de erro',
        buttons: ['OK']
      });
    });

    test('deve criar tray com ícone padrão quando arquivo não existe', () => {
      fs.existsSync.mockReturnValue(false);
      
      app.createTray();
      
      const { nativeImage } = require('electron');
      expect(nativeImage.createFromDataURL).toHaveBeenCalled();
    });
  });
});
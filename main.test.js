// Extrai a classe do main.js para que possamos testá-la isoladamente
const MonitorSwitcherApp = require('./main.js');

// Mock dos módulos do Node.js e Electron que não queremos executar de verdade
jest.mock('fs');
jest.mock('child_process');
jest.mock('electron', () => ({
  app: {
    getPath: () => '/tmp', // Usar /tmp para simular o path temporário
    getLoginItemSettings: () => ({ openAtLogin: false }),
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
    buildFromTemplate: jest.fn(() => ({
      popup: jest.fn(),
    })),
  },
  nativeImage: {
    createFromPath: jest.fn(),
    createFromDataURL: jest.fn(),
  },
  dialog: {
    showMessageBox: jest.fn(),
  },
  Notification: {
    isSupported: jest.fn(() => true),
    mockImplementation: function() {
        this.show = jest.fn();
    }
  },
}));

const fs = require('fs');
const { exec } = require('child_process');

// Mock para o módulo csv-parse
jest.mock('csv-parse', () => ({
    parse: jest.fn((data, options, callback) => {
        // Simula o CSV do MultiMonitorTool.exe
        const mockRecords = [
            {
                'Monitor ID': 'MONITOR\\DHIFFFF\\{4d36e96e-e325-11ce-bfc1-08002be10318}\\0004',
                'Monitor Serial Number': '00000000',
                'Is Primary': 'No'
            },
            {
                'Monitor ID': 'MONITOR\\ACR0001\\{4d36e96e-e325-11ce-bfc1-08002be10318}\\0001',
                'Monitor Serial Number': '6KL82W2',
                'Is Primary': 'Yes'
            }
        ];
        callback(null, mockRecords);
    }),
}));

describe('MonitorSwitcherApp - Refatorado', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock do arquivo de configuração com IDs estáveis
    const mockConfigFile = 'DISPLAY1=6KL82W2\nDISPLAY2=MONITOR\\DHIFFFF\\{4d36e96e-e325-11ce-bfc1-08002be10318}\\0004';
    fs.readFileSync.mockReturnValue(mockConfigFile);
    fs.existsSync.mockReturnValue(true);
    fs.unlinkSync.mockImplementation(() => {}); // Mock para a exclusão do arquivo temporário
    
    // Mock para a execução do comando de consulta
    exec.mockImplementation((command, options, callback) => {
        // Simula a criação do arquivo temporário com o CSV
        if (command.includes('/scomma')) {
            const tempPath = command.match(/"([^"]+)"$/)[1];
            fs.existsSync.mockReturnValueOnce(true); // Garante que o teste leia o arquivo
            fs.readFileSync.mockReturnValueOnce('CSV_CONTENT'); // O conteúdo real é mockado pelo csv-parse
            callback(null, 'stdout', 'stderr');
        } else if (command.includes('/SetPrimary')) {
            // Simula a execução do comando de set primary
            callback(null, 'stdout', 'stderr');
        }
    });

    app = new MonitorSwitcherApp();
    // A função init é async e precisa ser aguardada para sincronizar o estado
  });

  test('deve carregar a configuração dos monitores corretamente', () => {
    app.loadDisplayConfig();
    expect(app.display1StableId).toBe('6KL82W2');
    expect(app.display2StableId).toBe('MONITOR\\DHIFFFF\\{4d36e96e-e325-11ce-bfc1-08002be10318}\\0004');
  });

  test('deve sincronizar o estado inicial com o monitor principal real', async () => {
    app.loadDisplayConfig();
    await app.syncCurrentPrimaryState();
    
    // O mock do CSV define o monitor com Serial Number '6KL82W2' como principal.
    expect(app.currentPrimaryStableId).toBe('6KL82W2');
  });

  test('deve alternar o monitor principal corretamente', async () => {
    app.loadDisplayConfig();
    // Sincroniza o estado para que o toggle saiba qual é o atual
    await app.syncCurrentPrimaryState(); 
    
    // O estado atual é '6KL82W2' (DISPLAY1), o alvo deve ser DISPLAY2
    await app.togglePrimary();

    // Verifica se o comando exec foi chamado para consultar o estado (1ª chamada)
    expect(exec).toHaveBeenCalledWith(
        expect.stringContaining('/scomma'),
        expect.any(Object),
        expect.any(Function)
    );

    // Verifica se o comando exec foi chamado para definir o novo principal (2ª chamada)
    // O ID alvo é o Monitor ID do DISPLAY2: MONITOR\DHIFFFF\{4d36e96e-e325-11ce-bfc1-08002be10318}\0004
    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining('/SetPrimary "MONITOR\\DHIFFFF\\{4d36e96e-e325-11ce-bfc1-08002be10318}\\0004"'),
      expect.any(Function)
    );
    
    // Verifica se o estado interno foi atualizado após a chamada de setPrimary
    // setPrimary é chamado com 'Modo Jogo', que define o estado interno para display2StableId
    expect(app.currentPrimaryStableId).toBe('MONITOR\\DHIFFFF\\{4d36e96e-e325-11ce-bfc1-08002be10318}\\0004');
  });
});
// Extrai a classe do main.js para que possamos testá-la isoladamente
const MonitorSwitcherApp = require('./main.js');

// Mock dos módulos do Node.js e Electron que não queremos executar de verdade
jest.mock('fs');
jest.mock('child_process');
jest.mock('electron', () => ({
  app: {
    getPath: () => 'temp',
    getLoginItemSettings: () => ({ openAtLogin: false }),
    setLoginItemSettings: jest.fn(),
    isPackaged: false,
    // Adiciona mocks para as funções que estavam faltando
    setAppUserModelId: jest.fn(),
    on: jest.fn(),
    quit: jest.fn(),
    requestSingleInstanceLock: jest.fn(() => true),
  },
  Tray: jest.fn(() => ({
    setToolTip: jest.fn(),
    setContextMenu: jest.fn(),
  })),
  Menu: {
    buildFromTemplate: jest.fn(() => ({
      popup: jest.fn(),
    })),
  },
  nativeImage: {
    createFromPath: jest.fn(),
  },
  dialog: {
    showMessageBox: jest.fn(),
  },
  Notification: jest.fn(),
}));

const fs = require('fs');
const { exec } = require('child_process');

describe('MonitorSwitcherApp', () => {
  let app;

/*   beforeEach(() => {
    // Reseta os mocks antes de cada teste
    jest.clearAllMocks();

    // Simula a leitura do arquivo de configuração
    const mockConfigFile = 'DISPLAY1=ID_MONITOR_1\nDISPLAY2=ID_MONITOR_2';
    fs.readFileSync.mockReturnValue(mockConfigFile);
    fs.existsSync.mockReturnValue(true); // Simula que todos os arquivos existem

    app = new MonitorSwitcherApp();
    // A função init é async, mas para os testes podemos chamá-la de forma síncrona
    // pois estamos simulando todas as operações de IO.
    app.init();
  }); */

  beforeEach(() => {
    // Reseta os mocks antes de cada teste
    jest.clearAllMocks();

    // Simula a leitura do arquivo de configuração
    const mockConfigFile = 'DISPLAY1=ID_MONITOR_1\nDISPLAY2=ID_MONITOR_2';
    fs.readFileSync.mockReturnValue(mockConfigFile);
    fs.existsSync.mockReturnValue(true);

    app = new MonitorSwitcherApp();
    // Inicializa os paths antes de carregar a configuração
    app.initializePaths();
    app.loadDisplayConfig();
    app.currentPrimary = 'ID_MONITOR_1'; // Define o estado inicial
  });

  test('deve carregar a configuração dos monitores corretamente', () => {
    expect(app.display1).toBe('ID_MONITOR_1');
    expect(app.display2).toBe('ID_MONITOR_2');
  });

  test('deve alternar para o DISPLAY2 se o principal atual for o DISPLAY1', async () => {
    // Estado inicial (definido no init)
    app.currentPrimary = 'ID_MONITOR_1';

    await app.togglePrimary();

    // Verifica se o comando exec foi chamado com o ID do segundo monitor
    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining('/SetPrimary "ID_MONITOR_2"'),
      expect.any(Function)
    );
  });

  test('deve alternar para o DISPLAY1 se o principal atual for o DISPLAY2', async () => {
    // Define o estado atual como DISPLAY2
    app.currentPrimary = 'ID_MONITOR_2';

    await app.togglePrimary();

    // Verifica se o comando exec foi chamado com o ID do primeiro monitor
    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining('/SetPrimary "ID_MONITOR_1"'),
      expect.any(Function)
    );
  });

  test('deve atualizar o estado interno após a troca bem-sucedida', async () => {
    app.currentPrimary = 'ID_MONITOR_1';

    // Simula que a execução do comando foi bem-sucedida
    exec.mockImplementation((command, callback) => {
      callback(null, 'stdout', ''); // (error, stdout, stderr)
    });

    await app.togglePrimary();

    // Verifica se o estado interno foi atualizado para o novo monitor principal
    expect(app.currentPrimary).toBe('ID_MONITOR_2');
  });
});

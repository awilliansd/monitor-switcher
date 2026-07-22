// modules/constants.js
// Strings, enums e magic numbers centralizados.

const APP_NAME = 'Monitor Switcher';
const APP_USER_MODEL_ID = 'MonitorSwitcher';

const MODES = Object.freeze({
  MEETING: 'Modo Reunião',
  GAME: 'Modo Jogo',
});

const ENV = Object.freeze({
  DEVELOPMENT: 'development',
  TEST: 'test',
});

// Fases do auto-update (substitui o state-machine por substring de labels).
const UPDATE_PHASE = Object.freeze({
  IDLE: 'idle',
  CHECKING: 'checking',
  DOWNLOADING: 'downloading',
  INSTALLING: 'installing',
  DOWNLOADED: 'downloaded',
  UNAVAILABLE: 'unavailable',
  ERROR: 'error',
});

const TIMING = Object.freeze({
  INITIAL_UPDATE_CHECK_MS: 15000,
  UPDATE_CHECK_INTERVAL_MS: 30 * 60 * 1000,
  AUTO_INSTALL_MS: 10000,
  INSTALL_PRE_DELAY_MS: 250,
  EXEC_TIMEOUT_MS: 10000,
});

const RESOURCES = Object.freeze({
  TOOL: 'MultiMonitorTool.exe',
  CONFIG: 'display_config.txt',
  ICON: 'monitorswitcher.ico',
});

const CLI_FLAGS = Object.freeze({
  SCOMMA: '/scomma',
  SET_PRIMARY: '/SetPrimary',
});

const CSV_COLUMNS = Object.freeze({
  PRIMARY: 'Primary',
  IS_PRIMARY: 'Is Primary',
  YES: 'Yes',
  SIM: 'Sim',
  ACTIVE: 'Active',
  DISCONNECTED: 'Disconnected',
  NO: 'No',
  MONITOR_ID: 'Monitor ID',
  MONITOR_SERIAL: 'Monitor Serial Number',
});

const FALLBACK_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

module.exports = {
  APP_NAME,
  APP_USER_MODEL_ID,
  MODES,
  ENV,
  UPDATE_PHASE,
  TIMING,
  RESOURCES,
  CLI_FLAGS,
  CSV_COLUMNS,
  FALLBACK_ICON_DATA_URL,
};
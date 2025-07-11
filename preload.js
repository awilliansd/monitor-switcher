// preload.js - Script de preload para segurança adicional
// Este arquivo é opcional, mas recomendado para aplicações mais complexas

const { contextBridge, ipcRenderer } = require('electron');

// Expõe APIs seguras para o processo renderer se necessário
contextBridge.exposeInMainWorld('electronAPI', {
    // Funções que podem ser chamadas do renderer process
    switchToMeetingMode: () => ipcRenderer.invoke('switch-to-meeting-mode'),
    switchToGameMode: () => ipcRenderer.invoke('switch-to-game-mode'),
    
    // Listeners para eventos
    onModeChanged: (callback) => ipcRenderer.on('mode-changed', callback),
    
    // Remoção de listeners
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});

// Configurações de segurança
window.addEventListener('DOMContentLoaded', () => {
    // Desabilita o menu de contexto padrão
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    
    // Desabilita atalhos de teclado perigosos
    document.addEventListener('keydown', (e) => {
        // Desabilita F12 (DevTools)
        if (e.key === 'F12') {
            e.preventDefault();
        }
        
        // Desabilita Ctrl+Shift+I (DevTools)
        if (e.ctrlKey && e.shiftKey && e.key === 'I') {
            e.preventDefault();
        }
        
        // Desabilita Ctrl+U (View Source)
        if (e.ctrlKey && e.key === 'u') {
            e.preventDefault();
        }
    });
});
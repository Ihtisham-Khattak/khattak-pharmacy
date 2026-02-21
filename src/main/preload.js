/**
 * Preload Script for Secure Electron IPC Communication
 * This script runs in a privileged context and exposes only necessary APIs
 * to the renderer process via contextBridge
 */

const { contextBridge, ipcRenderer } = require('electron');
const pkg = require('../../package.json');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App control
  quitApp: () => ipcRenderer.send('app-quit'),
  reloadApp: () => ipcRenderer.send('app-reload'),
  restartApp: () => ipcRenderer.send('restart-app'),
  
  // Element clicks (for native menu integration)
  sendClickEvent: (elementId) => ipcRenderer.send('click-element', elementId),
  onClickEvent: (callback) => ipcRenderer.on('click-element', (event, elementId) => callback(elementId)),
  
  // Platform info
  getPlatform: () => process.platform,
  
  // App configuration (safe to expose)
  getAppConfig: () => ({
    appName: pkg.productName || pkg.name || 'PharmaSpot',
    appVersion: pkg.version || '1.6.0',
    platform: process.platform
  }),
  
  // Server port (will be set by main process)
  getServerPort: () => process.env.PORT || 0,
  
  // Safe logging (remotes console.log to main process)
  log: (level, message) => ipcRenderer.send('log', { level, message })
});

// Listen for reload commands from main process
ipcRenderer.on('reload-window', () => {
  window.location.reload();
});

// Expose server port when it's set
ipcRenderer.on('server-started', (event, port) => {
  window.electronAPI.serverPort = port;
});

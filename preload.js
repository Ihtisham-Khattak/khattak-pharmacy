const { contextBridge, ipcRenderer } = require("electron");
const Store = require("electron-store");

const store = new Store();

contextBridge.exposeInMainWorld("pharmaDesktop", {
  store: {
    get: (key, defaultValue) => store.get(key, defaultValue),
    set: (key, value) => store.set(key, value),
    delete: (key) => store.delete(key),
    clear: () => store.clear(),
  },
  ipc: {
    send: (channel, ...args) => {
      const allowed = ["app-quit", "app-reload", "restart-app"];
      if (allowed.includes(channel)) {
        ipcRenderer.send(channel, ...args);
      }
    },
    on: (channel, listener) => {
      const allowed = ["click-element"];
      if (!allowed.includes(channel)) return () => {};
      const wrapped = (_event, ...args) => listener(...args);
      ipcRenderer.on(channel, wrapped);
      return () => ipcRenderer.removeListener(channel, wrapped);
    },
  },
  paths: {
    appData: process.env.APPDATA || "",
    appName: process.env.APPNAME || "PharmaSpot",
    userData: process.env.PHARMASPOT_USERDATA || "",
  },
});

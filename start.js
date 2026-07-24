require("electron-store").initRenderer();
const setupEvents = require("./installers/setupEvents");
if (setupEvents.handleSquirrelEvent()) {
    return;
}
const server = require('./server');
const { app, BrowserWindow, ipcMain, screen} = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const contextMenu = require("electron-context-menu");
let { Menu, template } = require("./assets/js/native_menu/menu");
const menuController = require('./assets/js/native_menu/menuController.js');
const isPackaged = app.isPackaged;
const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);
let mainWindow;

//stop app from launching multiple times during these squirrel spawning events
if (require('electron-squirrel-startup')) app.quit();

function createWindow() {

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    process.env.PHARMASPOT_USERDATA = app.getPath("userData");
    mainWindow = new BrowserWindow({
        width: width,
        height: height,
        frame: true,
        webPreferences: {
            // jQuery renderer still uses require()/electron-store directly.
            // Do not enable contextIsolation or a contextBridge preload until
            // that migration is complete — both blank the window.
            nodeIntegration: true,
            enableRemoteModule: false,
            contextIsolation: false,
            sandbox: false,
        },
    });
    menuController.initializeMainWindow(mainWindow); 
    mainWindow.maximize();
    mainWindow.show();

    mainWindow.loadURL(`file://${path.join(__dirname, "index.html")}`);

    mainWindow.on("closed", () => {
        mainWindow = null;
    });

    mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
        console.error("Renderer failed to load:", code, desc, url);
    });
    mainWindow.webContents.on("render-process-gone", (_e, details) => {
        console.error("Renderer process gone:", details);
    });
    mainWindow.webContents.on("console-message", (_e, level, message, line, sourceId) => {
        if (level >= 2) {
            console.error(`[renderer:${level}] ${message} (${sourceId}:${line})`);
        }
    });
    
}

app.whenReady().then(() => {
    createWindow();
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("activate", () => {
    if (mainWindow === null) {
        createWindow();
    }
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
});

ipcMain.on("app-quit", (evt, arg) => {
    app.quit();
});

ipcMain.on("app-reload", (event, arg) => {
    mainWindow.reload();
});

ipcMain.on("restart-app", () => {
    autoUpdater.quitAndInstall();
});

//Context menu
contextMenu({
    prepend: (params, browserWindow) => [
        {
            label: "Refresh",
            click() {
                mainWindow.reload();
            },
        },
    ],
});

//Live reload during development
if (!isPackaged) {
    try {
        require("electron-reloader")(module);
    } catch (_) {}
}

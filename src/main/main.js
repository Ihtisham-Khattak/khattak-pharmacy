/**
 * Main Electron Process - Secure Configuration
 * This file initializes the Electron main process with security best practices
 */

const { app, BrowserWindow, ipcMain, screen, Menu } = require("electron");
const path = require("path");
const contextMenu = require("electron-context-menu");
const menuController = require("../../assets/js/native_menu/menuController.js");
const pkg = require("../../package.json");

// Initialize remote module for legacy compatibility (phased out gradually)
require("@electron/remote/main").initialize();

// Stop app from launching multiple times during squirrel events
if (require('electron-squirrel-startup')) app.quit();

let mainWindow = null;
let serverInstance = null;

/**
 * Start the Express server
 */
function startServer() {
    return new Promise((resolve, reject) => {
        try {
            // Set up app data paths before starting server
            process.env.APPDATA = app.getPath("appData");
            process.env.APPNAME = app.getName() || "PharmaSpot";
            
            // Require and start the server
            const { restartServer } = require('../../server');
            serverInstance = { restartServer };
            resolve(serverInstance);
        } catch (error) {
            console.error('Failed to start server:', error);
            reject(error);
        }
    });
}

/**
 * Creates the main application window with secure settings
 */
function createWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    
    mainWindow = new BrowserWindow({
        width: width,
        height: height,
        frame: true,
        show: false, // Don't show until ready
        webPreferences: {
            // TEMPORARY: Re-enabled for backward compatibility
            // TODO: Migrate frontend code to use preload API
            nodeIntegration: true,             // Allow require() in renderer
            contextIsolation: false,           // Disable context isolation temporarily
            enableRemoteModule: true,          // Enable remote module temporarily
            preload: path.join(__dirname, 'preload.js'),
            webviewTag: false,
            sandbox: false,
            allowRunningInsecureContent: false,
            experimentalFeatures: false,
            devTools: !app.isPackaged
        },
        icon: path.join(__dirname, 'assets/images/icon.ico')
    });

    // Initialize menu controller
    menuController.initializeMainWindow(mainWindow);
    
    // Show window when ready to prevent flash of unstyled content
    mainWindow.once('ready-to-show', () => {
        mainWindow.maximize();
        mainWindow.show();
    });

    // Load the main HTML file
    mainWindow.loadFile(path.join(__dirname, '../../index.html'));

    // Handle window close
    mainWindow.on("closed", () => {
        mainWindow = null;
    });

    // Security: Prevent navigation to external URLs
    mainWindow.webContents.on('will-navigate', (event, url) => {
        const allowedUrls = [
            mainWindow.webContents.getURL()
        ];
        if (!allowedUrls.some(allowed => url.startsWith(allowed))) {
            event.preventDefault();
            console.warn(`Blocked navigation to external URL: ${url}`);
        }
    });

    // Security: Prevent new windows
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        console.warn(`Blocked new window creation: ${url}`);
        return { action: 'deny' };
    });
}

// Enable remote module for existing windows (temporary compatibility)
app.on("browser-window-created", (_, window) => {
    require("@electron/remote/main").enable(window.webContents);
});

// Create window and start server when Electron is ready
app.whenReady().then(async () => {
    try {
        // Start the Express server first
        await startServer();
        console.log('Express server started successfully');
        
        // Then create the window
        createWindow();
        
        // Send server port to renderer after a short delay
        setTimeout(() => {
            if (mainWindow && process.env.PORT) {
                mainWindow.webContents.send('server-started', process.env.PORT);
            }
        }, 1000);
    } catch (error) {
        console.error('Failed to initialize application:', error);
        app.quit();
    }
});

// Quit when all windows are closed (except on macOS)
app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

// Recreate window when activated (macOS)
app.on("activate", () => {
    if (mainWindow === null) {
        createWindow();
    }
});

// IPC Handlers - Secure communication
ipcMain.on("app-quit", () => {
    app.quit();
});

ipcMain.on("app-reload", () => {
    if (mainWindow) {
        mainWindow.reload();
    }
});

ipcMain.on("restart-app", () => {
    const { autoUpdater } = require("electron-updater");
    autoUpdater.quitAndInstall();
});

// Forward click events from menu to renderer
ipcMain.on('click-element', (event, elementId) => {
    if (mainWindow) {
        mainWindow.webContents.send('click-element', elementId);
    }
});

// Secure logging from renderer
ipcMain.on('log', (event, { level, message }) => {
    const logMessage = `[Renderer] ${level.toUpperCase()}: ${message}`;
    switch(level) {
        case 'error': console.error(logMessage); break;
        case 'warn': console.warn(logMessage); break;
        case 'info': console.info(logMessage); break;
        default: console.log(logMessage);
    }
});

// Context menu with refresh option
contextMenu({
    prepend: (params, browserWindow) => [
        {
            label: "Refresh",
            click() {
                if (mainWindow) {
                    mainWindow.reload();
                }
            },
        },
    ],
});

// Error handling
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Log to file in production
    if (app.isPackaged) {
        const fs = require('fs');
        const logPath = path.join(app.getPath('userData'), 'logs', 'error.log');
        const logDir = path.dirname(logPath);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        fs.appendFileSync(logPath, `${new Date().toISOString()} - ${error.stack}\n`);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
    // Log to file in production
    if (app.isPackaged) {
        const fs = require('fs');
        const logPath = path.join(app.getPath('userData'), 'logs', 'error.log');
        const logDir = path.dirname(logPath);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        fs.appendFileSync(logPath, `${new Date().toISOString()} - Unhandled Rejection: ${reason}\n`);
    }
});

// Live reload during development
if (!app.isPackaged) {
    try {
        require("electron-reloader")(module);
    } catch (_) {}
}

module.exports = { 
    mainWindow,
    restartServer: () => serverInstance ? serverInstance.restartServer() : null
};

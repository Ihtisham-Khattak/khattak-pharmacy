/**
 * Application Entry Point
 * This file serves as the main entry point for the Electron application
 */

const { app } = require('electron');
const path = require('path');

// Stop app from launching multiple times during squirrel events
if (require('electron-squirrel-startup')) app.quit();

// Handle app ready event
app.whenReady().then(() => {
    // Load the secure main process
    try {
        require('./src/main/main.js');
    } catch (error) {
        console.error('Failed to start application:', error);
        app.quit();
    }
});

// Re-export for compatibility
module.exports = app;



/**
 * Renderer Process Entry Point
 * Updated for secure context isolation
 */

// jQuery is loaded via bundle.min.js, access it from window
// All other modules are loaded via the bundle

// Listen for click events from main process (native menu)
if (window.electronAPI) {
    window.electronAPI.onClickEvent((elementId) => {
        const element = document.getElementById(elementId);
        if (element) {
            element.click();
        }
    });
}

// Export electronAPI for use in other renderer scripts
window.api = window.electronAPI || {};
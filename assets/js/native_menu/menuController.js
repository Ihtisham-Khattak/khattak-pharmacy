const { app, dialog } = require("electron");
let mainWindow;
const path = require("path");
const iconPath = path.join(__dirname, "../../../assets/images/favicon.png");
const appVersion = app.getVersion();
const appName = app.getName();
const pkg = require("../../../package.json");
const { appConfig } = require("../../../app.config");
const { autoUpdater } = require("electron-updater");
const unzipper = require("unzipper");
const archiver = require("archiver");
const fs = require("fs");
const crypto = require("crypto");
const isPackaged = app.isPackaged;
const updateServer = appConfig.UPDATE_SERVER;
const updateUrl = `${updateServer}/update/${
  process.platform
}/${app.getVersion()}`;
const { restartServer } = require("../../../server");

function getDataPaths() {
  const userData = app.getPath("userData");
  return {
    userDataPath: userData,
    dbFilePath: path.join(userData, "pharmacy.db"),
    uploadsFolderPath: path.join(
      process.env.APPDATA || app.getPath("appData"),
      process.env.APPNAME || pkg.name,
      "uploads",
    ),
  };
}

// Legacy exports kept for menu.js callers; paths now resolve at dialog time.
const dbFolderPath = path.join(
  process.env.APPDATA || "",
  process.env.APPNAME || pkg.name,
  "server",
  "databases",
);
const uploadsFolderPath = path.join(
  process.env.APPDATA || "",
  process.env.APPNAME || pkg.name,
  "uploads",
);

function showAbout() {
  const options = {
    applicationName: `${appName}`,
    applicationVersion: `v${appVersion}`,
    copyright: `Copyright © ${
      appConfig.COPYRIGHT_YEAR
    }-${new Date().getFullYear()} ${pkg.author}`,
    version: `v${appVersion}`,
    authors: [pkg.author],
    website: pkg.website,
    iconPath: iconPath,
  };
  app.setAboutPanelOptions(options);
  app.showAboutPanel();
}

function getDocs() {}

function sendFeedback() {}

function checkForUpdates() {
  if (!isPackaged) {
    console.log(`Skipping update check in development mode`);
    return;
  }

  const dialogOpts = {
    type: "info",
    buttons: ["Update now", "Later"],
    title: "New version available",
  };

  autoUpdater.setFeedURL({
    provider: "generic",
    url: updateUrl,
  });

  autoUpdater.checkForUpdates();
  autoUpdater.autoDownload = false;

  const handleUpdateAvailable = (info) => {
    const message = `Current version: ${pkg.version}\nNew Version: ${info.version}`;
    dialogOpts.message = message;
    dialogOpts.detail =
      process.platform === "win32" ? info.releaseNotes : info.releaseName;

    dialog.showMessageBox(dialogOpts).then((returnValue) => {
      if (returnValue.response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
  };

  const handleUpdateNotAvailable = (info) => {
    dialogOpts.type = "info";
    dialogOpts.buttons = ["OK"];
    dialogOpts.title = "No Updates Available";
    dialogOpts.message = `You are using the latest version: ${info.version}`;
    dialog.showMessageBox(dialogOpts);
  };

  const handleUpdateDownloaded = (info) => {
    dialogOpts.buttons = ["Install now", "Later"];
    dialogOpts.title = "Ready to Install Update";
    dialogOpts.message = `The update for version ${info.version} is downloaded.\nClick 'Install now' to restart the app and apply the update.`;
    dialog.showMessageBox(dialogOpts).then((returnValue) => {
      if (returnValue.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  };

  const handleError = async (error) => {
    const dialogOpts = {
      type: "error",
      buttons: ["OK"],
      title: "Update Error",
      message: "Failed to check for updates",
      detail: error == null ? "unknown" : error.toString(),
    };
    const returnValue = await dialog.showMessageBox(dialogOpts);
  };

  autoUpdater.on("update-available", handleUpdateAvailable);
  autoUpdater.on("update-not-available", handleUpdateNotAvailable);
  autoUpdater.on("update-downloaded", handleUpdateDownloaded);
  autoUpdater.on("error", handleError);
}

/**
 * Backs up pharmacy.db and the uploads folder into a nested zip with SHA256.
 */
const createBackup = async (dbFilePath, uploadsFolderPath, backupZipPath) => {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const output = fs.createWriteStream(backupZipPath);

    output.on("close", async () => {
      try {
        const hash = crypto.createHash("sha256");
        const input = fs.createReadStream(backupZipPath);
        input.on("data", (chunk) => hash.update(chunk));
        input.on("end", async () => {
          const digest = hash.digest("hex");
          const tempZipPath = backupZipPath + ".tmp";
          const tempArchive = archiver("zip", { zlib: { level: 9 } });
          const tempOutput = fs.createWriteStream(tempZipPath);

          tempOutput.on("close", () => {
            fs.renameSync(tempZipPath, backupZipPath);
            resolve();
          });

          tempArchive.on("error", reject);
          tempArchive.pipe(tempOutput);
          tempArchive.append(fs.createReadStream(backupZipPath), {
            name: "backup.zip",
          });
          tempArchive.append(digest, { name: "sha256.txt" });
          tempArchive.finalize();
        });
      } catch (err) {
        reject(err);
      }
    });

    archive.on("error", reject);
    archive.pipe(output);

    if (!fs.existsSync(dbFilePath)) {
      reject(new Error(`Database not found at ${dbFilePath}`));
      return;
    }
    archive.file(dbFilePath, { name: "pharmacy.db" });
    if (fs.existsSync(uploadsFolderPath)) {
      archive.directory(uploadsFolderPath, "uploads");
    }
    archive.finalize();
  });
};

/**
 * Restores pharmacy.db and uploads from a signed backup zip.
 */
const restoreBackup = async (backupZipPath, dbFilePath, uploadsFolderPath) => {
  const zip = await unzipper.Open.file(backupZipPath);
  const shaFileEntry = zip.files.find((f) => f.path === "sha256.txt");
  if (!shaFileEntry) throw new Error("SHA256 file not found in backup!");
  const expectedHash = (await shaFileEntry.buffer()).toString().trim();

  const backupEntry = zip.files.find((f) => f.path === "backup.zip");
  if (!backupEntry) throw new Error("backup.zip not found in backup!");

  const hash = crypto.createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = backupEntry.stream();
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => {
      const digest = hash.digest("hex");
      if (digest !== expectedHash) {
        reject(new Error("Backup file integrity check failed!"));
      } else {
        resolve();
      }
    });
    stream.on("error", reject);
  });

  const dbDir = path.dirname(dbFilePath);
  fs.mkdirSync(dbDir, { recursive: true });
  fs.mkdirSync(uploadsFolderPath, { recursive: true });

  await new Promise((resolve, reject) => {
    const parseStream = backupEntry.stream().pipe(unzipper.Parse());
    let failed = false;

    const fail = (err) => {
      if (failed) return;
      failed = true;
      parseStream.destroy(err);
      reject(err);
    };

    parseStream
      .on("entry", (entry) => {
        if (failed) {
          entry.autodrain();
          return;
        }

        let targetPath;
        let allowedBase;
        if (entry.path === "pharmacy.db" || entry.path === "databases/pharmacy.db") {
          targetPath = dbFilePath;
          allowedBase = dbDir;
        } else if (entry.path.startsWith("uploads/")) {
          targetPath = path.join(
            uploadsFolderPath,
            entry.path.replace(/^uploads\//, ""),
          );
          allowedBase = uploadsFolderPath;
        } else if (entry.path.startsWith("databases/")) {
          // Legacy backups: restore any databases/*.db beside pharmacy.db
          const name = entry.path.replace(/^databases\//, "");
          targetPath = path.join(dbDir, name);
          allowedBase = dbDir;
        } else {
          entry.autodrain();
          return;
        }

        const resolvedPath = path.resolve(targetPath);
        if (!resolvedPath.startsWith(path.resolve(allowedBase))) {
          entry.autodrain();
          fail(
            new Error(
              "Security violation: Attempted directory traversal in backup!",
            ),
          );
          return;
        }

        if (entry.type === "Directory") {
          fs.mkdirSync(resolvedPath, { recursive: true });
          entry.autodrain();
          return;
        }

        fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
        const writeStream = fs.createWriteStream(resolvedPath);
        writeStream.on("error", fail);
        entry.pipe(writeStream);
      })
      .on("close", () => {
        if (!failed) resolve();
      })
      .on("error", fail);
  });
};

const saveBackupDialog = async () => {
  const { dbFilePath, uploadsFolderPath } = getDataPaths();
  const now = new Date();
  const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
  const defaultName = `${process.env.APPNAME || pkg.name}-backup-${timestamp}.zip`;
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Save Database Backup",
    defaultPath: defaultName,
    filters: [{ name: "Zip Files", extensions: ["zip"] }],
  });

  if (!canceled && filePath) {
    try {
      await createBackup(dbFilePath, uploadsFolderPath, filePath);
      dialog.showMessageBox({
        type: "info",
        title: "Backup Successful",
        message: "Backup saved successfully.",
        detail: `${filePath}\n\nDatabase: ${dbFilePath}`,
      });
    } catch (err) {
      dialog.showErrorBox("Backup Failed", err.message || String(err));
    }
  }
};

const restoreBackupDialog = async () => {
  const { dbFilePath, uploadsFolderPath } = getDataPaths();
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Select Database Backup to Restore",
    filters: [{ name: "Zip Files", extensions: ["zip"] }],
    properties: ["openFile"],
  });

  if (!canceled && filePaths && filePaths[0]) {
    const confirm = await dialog.showMessageBox({
      type: "warning",
      title: "Confirm Restore",
      message:
        "Restoring a backup will overwrite your current database and uploads, and the app will restart to complete the restore. Are you sure?",
      buttons: ["Restore", "Cancel"],
      defaultId: 1,
      cancelId: 1,
    });
    if (confirm.response !== 0) return;

    try {
      await restoreBackup(filePaths[0], dbFilePath, uploadsFolderPath);
      await dialog.showMessageBox({
        type: "info",
        title: "Restore Successful",
        message:
          "Backup restored successfully. The application will now restart to complete the restore.",
        detail: filePaths[0],
      });
      app.relaunch();
      app.exit();
    } catch (err) {
      dialog.showErrorBox("Restore Failed", err.message || String(err));
    }
  }
};

const initializeMainWindow = (win) => {
  mainWindow = win;
};

const handleClick = (elementId) => {
  mainWindow.webContents.send("click-element", elementId);
};

module.exports = {
  showAbout,
  checkForUpdates,
  getDocs,
  sendFeedback,
  initializeMainWindow,
  handleClick,
  dbFolderPath,
  uploadsFolderPath,
  saveBackupDialog,
  restoreBackupDialog,
};

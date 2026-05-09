import { app, BrowserWindow, ipcMain, shell } from "electron";
import { autoUpdater } from "electron-updater";
import path from "node:path";

const isDev = !app.isPackaged;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1024,
    minHeight: 600,
    autoHideMenuBar: true,
    title: "Aura — The Desktop Sanctuary",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    void win.loadURL("http://localhost:8080");
    win.webContents.openDevTools();
  } else {
    void win.loadFile(path.join(app.getAppPath(), "dist/index.html"));
  }

  // Open anchor/window.open links in the system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  return win;
}

ipcMain.on("install-update", () => {
  autoUpdater.quitAndInstall();
});

// --- Auto-updater events ---

autoUpdater.on("update-available", () => {
  BrowserWindow.getAllWindows()[0]?.webContents.send("update-available");
});

autoUpdater.on("update-downloaded", () => {
  BrowserWindow.getAllWindows()[0]?.webContents.send("update-downloaded");
});

// --- App lifecycle ---

app.whenReady().then(() => {
  createWindow();

  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

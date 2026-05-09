import { app, BrowserWindow, ipcMain, nativeImage, shell } from "electron";
import { autoUpdater } from "electron-updater";
import path from "node:path";

const isDev = !app.isPackaged;

function createWindow(): BrowserWindow {
  const iconPath = isDev
    ? path.join(__dirname, "../public/aura-logo.png")
    : path.join(app.getAppPath(), "dist/aura-logo.png");

  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1024,
    minHeight: 600,
    autoHideMenuBar: true,
    title: "Aura — The Desktop Sanctuary",
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    const img = nativeImage.createFromPath(iconPath);
    if (!img.isEmpty()) win.setIcon(img);
  } catch {
    // icon file missing — use default
  }

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

function sendToRenderer(channel: string, ...args: unknown[]) {
  BrowserWindow.getAllWindows()[0]?.webContents.send(channel, ...args);
}

autoUpdater.on("update-available", () => sendToRenderer("update-available"));
autoUpdater.on("download-progress", (p) => sendToRenderer("update-download-progress", p.percent));
autoUpdater.on("update-downloaded", () => sendToRenderer("update-downloaded"));
autoUpdater.on("error", (err) => sendToRenderer("update-error", err.message));

// --- App lifecycle ---

app.whenReady().then(() => {
  const win = createWindow();

  if (!isDev) {
    // Wait for renderer to load so IPC listeners are registered before events fire
    win.webContents.once("did-finish-load", () => {
      autoUpdater.checkForUpdatesAndNotify();
    });
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

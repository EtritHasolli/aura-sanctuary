import { app, BrowserWindow, ipcMain, nativeImage, net, shell } from "electron";
import { autoUpdater } from "electron-updater";
import path from "node:path";

const isDev = !app.isPackaged;

/** Same as `src/lib/branding.ts` — keep in sync (Electron bundle is separate). */
const APP_LOGO_URL =
  "https://wvuoisxjuzyaoapuofrk.supabase.co/storage/v1/object/public/Logo/aura_logo.png";

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

  void (async () => {
    try {
      const res = await net.fetch(APP_LOGO_URL);
      if (!res.ok) return;
      const buf = Buffer.from(await res.arrayBuffer());
      const img = nativeImage.createFromBuffer(buf);
      if (!img.isEmpty()) win.setIcon(img);
    } catch {
      /* offline / blocked — default window chrome */
    }
  })();

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

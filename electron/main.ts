import { app, BrowserWindow, ipcMain, nativeImage, screen, shell } from "electron";
import { autoUpdater } from "electron-updater";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.join(app.getAppPath(), ".env") });

const isDev = !app.isPackaged;

let mainWin: BrowserWindow | null = null;
let miniPlayerWin: BrowserWindow | null = null;
let miniPlayerUserClosed = false;

function createWindow(): BrowserWindow {
  const iconPath = isDev
    ? path.join(__dirname, "../public/aura-logo.png")
    : path.join(app.getAppPath(), "dist/aura-logo.png");

  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1024,
    minHeight: 600,
    frame: false,
    autoHideMenuBar: true,
    title: "Aura — The Desktop Sanctuary",
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.on("maximize", () => win.webContents.send("window:maximize-change", true));
  win.on("unmaximize", () => win.webContents.send("window:maximize-change", false));
  win.on("blur", () => win.webContents.send("window:did-minimize"));
  win.on("focus", () => win.webContents.send("window:did-restore"));

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

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  return win;
}

// --- Window controls ---

ipcMain.handle("window:minimize", () => mainWin?.minimize());
ipcMain.handle("window:toggle-maximize", () => {
  if (!mainWin) return;
  mainWin.isMaximized() ? mainWin.unmaximize() : mainWin.maximize();
});
ipcMain.handle("window:close", () => mainWin?.close());
ipcMain.handle("window:is-maximized", () => mainWin?.isMaximized() ?? false);

// --- Mini player ---

const BADGE_W = 70, BADGE_H = 70;
const PANEL_W = 270, PANEL_H = 104;

function getMiniPlayerHtmlPath(): string {
  return isDev
    ? path.join(__dirname, "../electron/mini-player.html")
    : path.join(__dirname, "mini-player.html");
}

function getLogoFileUrl(): string {
  const p = isDev
    ? path.join(__dirname, "../public/aura-logo.png")
    : path.join(app.getAppPath(), "dist/aura-logo.png");
  return "file:///" + p.replace(/\\/g, "/");
}

ipcMain.handle("mini-player:show", () => {
  if (miniPlayerWin && !miniPlayerWin.isDestroyed()) return;

  const { workArea } = screen.getPrimaryDisplay();
  const margin = 16;
  const x = workArea.x + workArea.width - BADGE_W - margin;
  const y = workArea.y + workArea.height - BADGE_H - margin;

  miniPlayerWin = new BrowserWindow({
    width: BADGE_W,
    height: BADGE_H,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  void miniPlayerWin.loadFile(getMiniPlayerHtmlPath(), {
    query: { logo: getLogoFileUrl() },
  });

  miniPlayerUserClosed = false;
  miniPlayerWin.on("closed", () => {
    const wasUser = miniPlayerUserClosed;
    miniPlayerUserClosed = false;
    miniPlayerWin = null;
    if (wasUser && mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send("window:mini-player-closed");
    }
  });
});

ipcMain.handle("mini-player:hide", () => {
  miniPlayerUserClosed = false;
  if (miniPlayerWin && !miniPlayerWin.isDestroyed()) {
    miniPlayerWin.close();
    miniPlayerWin = null;
  }
});

ipcMain.handle("mini-player:expand", () => {
  if (!miniPlayerWin || miniPlayerWin.isDestroyed()) return;
  const { x, y } = miniPlayerWin.getBounds();
  // setPosition then setSize keeps bottom-right corner fixed
  miniPlayerWin.setPosition(x - (PANEL_W - BADGE_W), y - (PANEL_H - BADGE_H));
  miniPlayerWin.setSize(PANEL_W, PANEL_H);
});

ipcMain.handle("mini-player:collapse", () => {
  if (!miniPlayerWin || miniPlayerWin.isDestroyed()) return;
  const { x, y } = miniPlayerWin.getBounds();
  miniPlayerWin.setPosition(x + (PANEL_W - BADGE_W), y + (PANEL_H - BADGE_H));
  miniPlayerWin.setSize(BADGE_W, BADGE_H);
});

ipcMain.on("mini-player:close", (event) => {
  miniPlayerUserClosed = false;
  const sender = BrowserWindow.fromWebContents(event.sender);
  if (sender && !sender.isDestroyed()) sender.close();
});

ipcMain.on("mini-player:stop", (event) => {
  miniPlayerUserClosed = true;
  const sender = BrowserWindow.fromWebContents(event.sender);
  if (sender && !sender.isDestroyed()) sender.close();
});

ipcMain.on("install-update", () => {
  autoUpdater.quitAndInstall();
});

if (process.env.GH_TOKEN) {
  autoUpdater.addAuthHeader(`token ${process.env.GH_TOKEN}`);
}

// --- Auto-updater events ---

function sendToRenderer(channel: string, ...args: unknown[]) {
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send(channel, ...args);
  }
}

autoUpdater.on("update-available", () => sendToRenderer("update-available"));
autoUpdater.on("download-progress", (p) => sendToRenderer("update-download-progress", p.percent));
autoUpdater.on("update-downloaded", () => sendToRenderer("update-downloaded"));
autoUpdater.on("error", (err) => {
  const msg = err.message || String(err);
  // Suppress 404/403 errors which happen on private repos without a token
  if (msg.includes("404") || msg.includes("403") || msg.includes("Not Found")) {
    console.warn("[Updater] Silent failure (Private Repo/Auth):", msg);
    return;
  }
  sendToRenderer("update-error", msg);
});

// --- App lifecycle ---

app.whenReady().then(() => {
  mainWin = createWindow();

  if (!isDev) {
    mainWin.webContents.once("did-finish-load", () => {
      autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        console.error("[Updater] Failed to check for updates:", err);
      });
    });
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWin = createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

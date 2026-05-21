import { app, BrowserWindow, dialog, ipcMain, nativeImage, net, protocol, screen, session, shell } from "electron";
import { autoUpdater } from "electron-updater";
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Enable GPU acceleration for smoother animations
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("ignore-gpu-blocklist");

// Register custom protocol so the packaged app has a proper web origin
// (YouTube embeds refuse to load from file:// origins — Error 153)
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

// Load .env manually (dotenv gets broken by Vite bundling)
try {
  const envPath = path.join(app.getAppPath(), ".env");
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split(/\r?\n/)) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*"?(.*?)"?\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
} catch {
  // .env not found — expected when running without bundled env
}

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
      autoplayPolicy: "no-user-gesture-required",
      webSecurity: false,
      webviewTag: true,
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
    void win.loadURL("app://localhost/index.html#/");
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
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send("music:stop");
});

ipcMain.on("install-update", () => {
  autoUpdater.quitAndInstall();
});

// --- Music libraries (local folder picker + built-in lofi/ambient library) ---

const AUDIO_EXTS = new Set([".mp3", ".flac", ".wav", ".ogg", ".m4a", ".aac", ".opus", ".wma"]);

ipcMain.handle("music:pick-folder", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openDirectory"],
    title: "Select Music Folder",
  });
  return canceled ? null : filePaths[0];
});

ipcMain.handle("music:scan-folder", (_event, folderPath: string) => {
  try {
    return readdirSync(folderPath)
      .filter((f) => AUDIO_EXTS.has(path.extname(f).toLowerCase()))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
      .map((f) => ({
        name: path.basename(f, path.extname(f)),
        path: path.join(folderPath, f),
      }));
  } catch {
    return [];
  }
});

// Built-in lofi / ambient library folders (stored in Electron userData so they
// survive app updates and the user can find and fill them easily).
const scanAudioDir = (dir: string) => {
  try {
    mkdirSync(dir, { recursive: true });
    return readdirSync(dir)
      .filter((f) => AUDIO_EXTS.has(path.extname(f).toLowerCase()))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
      .map((f) => ({ name: path.basename(f, path.extname(f)), path: path.join(dir, f) }));
  } catch {
    return [];
  }
};

ipcMain.handle("music:get-library-paths", () => {
  const base = path.join(app.getPath("userData"), "music");
  return {
    lofi: path.join(base, "lofi"),
    ambient: path.join(base, "ambient"),
  };
});

ipcMain.handle("music:scan-library", () => {
  const base = path.join(app.getPath("userData"), "music");
  return {
    lofi: scanAudioDir(path.join(base, "lofi")),
    ambient: scanAudioDir(path.join(base, "ambient")),
  };
});

ipcMain.handle("music:reveal-folder", (_event, folderPath: string) => {
  mkdirSync(folderPath, { recursive: true });
  shell.openPath(folderPath);
});

ipcMain.handle("music:get-bundled-tracks", () => {
  const base = isDev
    ? path.join(app.getAppPath(), "src/assets/music")
    : path.join(process.resourcesPath, "music");
  const result: Record<string, { name: string; path: string }[]> = { lofi: [], ambient: [] };
  for (const cat of ["lofi", "ambient"] as const) {
    result[cat] = scanAudioDir(path.join(base, cat));
  }
  return result;
});

if (process.env.GH_TOKEN) {
  process.env.GITHUB_TOKEN = process.env.GH_TOKEN;
  autoUpdater.setFeedURL({
    provider: "github",
    owner: "EtritHasolli",
    repo: "aura-sanctuary",
    private: false,
    token: process.env.GH_TOKEN,
  });
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
  console.error("[Updater] Error:", msg);
  // Suppress auth/not-found errors (public repo, no token needed)
  if (msg.includes("404") || msg.includes("403") || msg.includes("Not Found")) return;
  sendToRenderer("update-error", msg);
});

// --- App lifecycle ---

app.whenReady().then(() => {
  // Serve packaged files via app:// so the renderer has a real web origin
  // (fixes YouTube embed Error 153 caused by file:// restrictions)
  protocol.handle("app", (request) => {
    const { pathname } = new URL(request.url);
    const filePath = path.join(app.getAppPath(), "dist", pathname);
    return net.fetch(pathToFileURL(filePath).toString());
  });

  // Mask Electron user agent globally — YouTube blocks playback when it sees "Electron/xx"
  // in the UA string. Must be set before createWindow() so the first page load already
  // uses the spoofed UA, and before the webRequest interceptors are registered.
  const CHROME_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
  session.defaultSession.setUserAgent(CHROME_UA);

  // Spoof Referer/Origin so YouTube embeds load from app:// and localhost origins.
  // Must be registered before createWindow() so the interceptors are active
  // when the first request fires.
  const youtubeUrls = [
    "*://*.youtube.com/*",
    "*://*.youtube-nocookie.com/*",
    "*://*.googlevideo.com/*",
    "*://*.ytimg.com/*",
  ];

  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: youtubeUrls },
    (details: { requestHeaders: Record<string, string> }, callback: (r: { requestHeaders: Record<string, string> }) => void) => {
      details.requestHeaders["Referer"] = "https://www.youtube.com/";
      details.requestHeaders["Origin"] = "https://www.youtube.com";
      details.requestHeaders["User-Agent"] = CHROME_UA;
      callback({ requestHeaders: details.requestHeaders });
    },
  );

  // Strip X-Frame-Options and CSP frame-ancestors from YouTube responses so
  // the embed iframe renders instead of showing a black screen / error 152.
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: youtubeUrls },
    (details: { responseHeaders?: Record<string, string[]> }, callback: (r: { responseHeaders?: Record<string, string[]> }) => void) => {
      const headers = { ...(details.responseHeaders ?? {}) };
      for (const key of Object.keys(headers)) {
        const lower = key.toLowerCase();
        if (lower === "x-frame-options" || lower === "content-security-policy") {
          delete headers[key];
        }
      }
      callback({ responseHeaders: headers });
    },
  );

  // Grant camera/microphone permissions for LiveKit study calls
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ["media", "camera", "microphone", "audio-capture", "video-capture"];
    callback(allowed.includes(permission));
  });

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

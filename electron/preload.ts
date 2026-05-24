import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  onUpdateAvailable: (cb: () => void) => {
    ipcRenderer.on("update-available", cb);
    return () => ipcRenderer.removeListener("update-available", cb);
  },

  onDownloadProgress: (cb: (percent: number) => void) => {
    const handler = (_: unknown, percent: number) => cb(percent);
    ipcRenderer.on("update-download-progress", handler);
    return () => ipcRenderer.removeListener("update-download-progress", handler);
  },

  onUpdateDownloaded: (cb: () => void) => {
    ipcRenderer.on("update-downloaded", cb);
    return () => ipcRenderer.removeListener("update-downloaded", cb);
  },

  installUpdate: () => ipcRenderer.send("install-update"),

  onUpdateError: (cb: (message: string) => void) => {
    const handler = (_: unknown, message: string) => cb(message);
    ipcRenderer.on("update-error", handler);
    return () => ipcRenderer.removeListener("update-error", handler);
  },

  windowControls: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
    close: () => ipcRenderer.invoke("window:close"),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke("window:is-maximized"),
    onMaximizeChange: (cb: (maximized: boolean) => void) => {
      const handler = (_: unknown, maximized: boolean) => cb(maximized);
      ipcRenderer.on("window:maximize-change", handler);
      return () => ipcRenderer.removeListener("window:maximize-change", handler);
    },
  },

  // --- Mini player (called from main renderer) ---
  showMiniPlayer: (): Promise<void> =>
    ipcRenderer.invoke("mini-player:show"),
  hideMiniPlayer: (): Promise<void> => ipcRenderer.invoke("mini-player:hide"),
  onWindowMinimize: (cb: () => void) => {
    ipcRenderer.on("window:did-minimize", cb);
    return () => ipcRenderer.removeListener("window:did-minimize", cb);
  },
  onWindowRestore: (cb: () => void) => {
    ipcRenderer.on("window:did-restore", cb);
    return () => ipcRenderer.removeListener("window:did-restore", cb);
  },
  onMiniPlayerClosed: (cb: () => void) => {
    ipcRenderer.on("window:mini-player-closed", cb);
    return () => ipcRenderer.removeListener("window:mini-player-closed", cb);
  },
  onMiniPlayerStop: (cb: () => void) => {
    ipcRenderer.on("music:stop", cb);
    return () => ipcRenderer.removeListener("music:stop", cb);
  },

  // --- Mini player window controls (called from mini-player.html) ---
  miniPlayerExpand: (): Promise<void> => ipcRenderer.invoke("mini-player:expand"),
  miniPlayerCollapse: (): Promise<void> => ipcRenderer.invoke("mini-player:collapse"),
  miniPlayerClose: () => ipcRenderer.send("mini-player:close"),
  miniPlayerStop: () => ipcRenderer.send("mini-player:stop"),

  // --- Local music library (arbitrary folder picker) ---
  pickMusicFolder: (): Promise<string | null> => ipcRenderer.invoke("music:pick-folder"),
  scanMusicFolder: (folderPath: string): Promise<Array<{ name: string; path: string }>> =>
    ipcRenderer.invoke("music:scan-folder", folderPath),
  fileToUrl: (filePath: string): string =>
    "file:///" + filePath.replace(/\\/g, "/"),

  // --- Built-in lofi / ambient library ---
  getLibraryPaths: (): Promise<{ lofi: string; ambient: string }> =>
    ipcRenderer.invoke("music:get-library-paths"),
  scanLibrary: (): Promise<{ lofi: Array<{ name: string; path: string }>; ambient: Array<{ name: string; path: string }> }> =>
    ipcRenderer.invoke("music:scan-library"),
  revealFolder: (folderPath: string): Promise<void> =>
    ipcRenderer.invoke("music:reveal-folder", folderPath),
  getBundledTracks: (): Promise<{ lofi: Array<{ name: string; path: string }>; ambient: Array<{ name: string; path: string }> }> =>
    ipcRenderer.invoke("music:get-bundled-tracks"),

  showNotification: (title: string, body: string): Promise<void> =>
    ipcRenderer.invoke("notification:show", title, body),
});

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
});

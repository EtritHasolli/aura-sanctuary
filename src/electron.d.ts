export {};

declare global {
  interface Window {
    electronAPI?: {
      onUpdateAvailable: (cb: () => void) => () => void;
      onDownloadProgress: (cb: (percent: number) => void) => () => void;
      onUpdateDownloaded: (cb: () => void) => () => void;
      installUpdate: () => void;
    };
  }
}

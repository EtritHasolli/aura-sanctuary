export {};

declare global {
  interface Window {
    electronAPI?: {
      onUpdateAvailable: (cb: () => void) => () => void;
      onUpdateDownloaded: (cb: () => void) => () => void;
      installUpdate: () => void;
    };
  }
}

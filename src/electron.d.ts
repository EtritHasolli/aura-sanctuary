export {};

declare global {
  interface Window {
    electronAPI?: {
      onUpdateAvailable: (cb: () => void) => () => void;
      onDownloadProgress: (cb: (percent: number) => void) => () => void;
      onUpdateDownloaded: (cb: () => void) => () => void;
      installUpdate: () => void;
      onUpdateError: (cb: (message: string) => void) => () => void;
      windowControls: {
        minimize: () => Promise<void>;
        toggleMaximize: () => Promise<void>;
        close: () => Promise<void>;
        isMaximized: () => Promise<boolean>;
        onMaximizeChange: (cb: (maximized: boolean) => void) => () => void;
      };
      showMiniPlayer: () => Promise<void>;
      hideMiniPlayer: () => Promise<void>;
      onWindowMinimize: (cb: () => void) => () => void;
      onWindowRestore: (cb: () => void) => () => void;
      onMiniPlayerClosed: (cb: () => void) => () => void;
      onMiniPlayerStop: (cb: () => void) => () => void;
      miniPlayerExpand: () => Promise<void>;
      miniPlayerCollapse: () => Promise<void>;
      miniPlayerClose: () => void;
      miniPlayerStop: () => void;
      pickMusicFolder: () => Promise<string | null>;
      scanMusicFolder: (folderPath: string) => Promise<Array<{ name: string; path: string }>>;
      fileToUrl: (filePath: string) => string;
      getLibraryPaths: () => Promise<{ lofi: string; ambient: string }>;
      scanLibrary: () => Promise<{ lofi: Array<{ name: string; path: string }>; ambient: Array<{ name: string; path: string }> }>;
      revealFolder: (folderPath: string) => Promise<void>;
      getBundledTracks: () => Promise<{ lofi: Array<{ name: string; path: string }>; ambient: Array<{ name: string; path: string }> }>;
    };
  }
}

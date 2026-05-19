/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: "app.aurasanctuary.desktop",
  productName: "Aura Sanctuary",
  icon: "build/icon.png",

  directories: { output: "release" },

  files: ["dist/**/*", "electron-dist/**/*", "package.json"],

  extraResources: [
    {
      from: "src/assets/music",
      to: "music",
      filter: ["**/*.mp3", "**/*.flac", "**/*.wav", "**/*.ogg", "**/*.m4a", "**/*.aac", "**/*.opus", "**/*.wma"],
    },
  ],

  nsis: { createDesktopShortcut: "always" },

  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
  },
  mac: {
    // zip must be listed first — electron-updater uses the first file in
    // latest-mac.yml as the auto-update artifact. DMG is first-install only.
    target: [
      { target: "zip", arch: ["x64", "arm64"] },
      { target: "dmg", arch: ["x64", "arm64"] },
    ],
  },
  linux: {
    target: [{ target: "AppImage", arch: ["x64"] }],
  },

  publish: {
    provider: "github",
    owner: "EtritHasolli",
    repo: "aura-sanctuary",
    releaseType: "release",
    private: false,
  },
};

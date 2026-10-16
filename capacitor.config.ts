import type { CapacitorConfig } from "@capacitor/cli";

// The Android app is a native shell around the live site: it loads
// https://aurasanctuary.netlify.app instead of a bundled copy, so every push that
// Netlify deploys reaches the phone on the next launch without a new APK.
// Only changes under android/ (icon, permissions, native plugins) need a rebuild;
// see .github/workflows/android.yml and public/android-version.json.
const config: CapacitorConfig = {
  appId: "app.aurasanctuary.android",
  appName: "Aura Sanctuary",
  // Holds only the offline page; the app itself comes from server.url.
  webDir: "mobile-shell",
  server: {
    url: "https://aurasanctuary.netlify.app",
    errorPath: "offline.html",
  },
  android: {
    backgroundColor: "#1a1410",
  },
};

export default config;

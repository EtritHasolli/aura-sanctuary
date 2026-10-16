import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Files in /public — use this instead of `/file.png` so Electron (file://) and Vite base `./` resolve correctly. */
export function publicAsset(filename: string): string {
  const name = filename.replace(/^\/+/, "");
  return `${import.meta.env.BASE_URL}${name}`;
}

const WEB_ORIGIN = "https://aurasanctuary.netlify.app";

/**
 * Origin for links that leave the app, such as the ones in auth emails. The desktop build runs
 * from app://localhost, which a link in an email cannot open, so it falls back to the website.
 */
export function webOrigin(): string {
  return window.location.protocol.startsWith("http") ? window.location.origin : WEB_ORIGIN;
}

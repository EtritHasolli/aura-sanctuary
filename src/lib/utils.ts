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

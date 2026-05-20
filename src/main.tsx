import { RouterProvider } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";
import "./styles.css";
import { APP_LOGO_URL } from "./lib/branding";
import { publicAsset } from "./lib/utils";
import { getRouter } from "./router";

function ensureLink(rel: string, href: string, extra?: { type?: string }) {
  const sel = `link[rel="${rel}"]`;
  let el = document.head.querySelector<HTMLLinkElement>(sel);
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
  if (extra?.type) el.type = extra.type;
}

ensureLink("icon", APP_LOGO_URL, { type: "image/png" });
ensureLink("apple-touch-icon", APP_LOGO_URL);

document.documentElement.style.setProperty(
  "--cursor-pointer",
  `url("${publicAsset("pointer.png")}") 16 16, auto`,
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("Service worker registration failed:", err);
    });
  });
}

const router = getRouter();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <RouterProvider router={router} />,
);

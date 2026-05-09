import { RouterProvider } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";
import "./styles.css";
import { getRouter } from "./router";

const router = getRouter();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <RouterProvider router={router} />,
);

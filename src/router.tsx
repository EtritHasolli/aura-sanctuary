import { QueryClient } from "@tanstack/react-query";
import { createBrowserHistory, createHashHistory, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

const isElectron =
  typeof window !== "undefined" && !!window.electronAPI;

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    history: isElectron ? createHashHistory() : createBrowserHistory(),
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};

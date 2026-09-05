import { QueryClient, dehydrate, hydrate } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  // The loaders prefetch into this cache and the server renders from it. The
  // cache travels with the page so the client's first render reads the same
  // rows the HTML was made from. Started from empty, the client drew skeletons
  // and empty rails over a filled document, and React threw that part of the
  // document away (error #418) on every page where a prefetch had landed.
  // Attached after construction, the way TanStack's own query integration
  // does it: the constructor's serializable-type check rejects react-query's
  // dehydrated state, which serializes fine.
  router.options.dehydrate = () => ({ queryClient: dehydrate(queryClient) });
  router.options.hydrate = (state) => {
    hydrate(queryClient, state.queryClient);
  };

  return router;
};

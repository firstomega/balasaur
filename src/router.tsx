import { QueryClient, dehydrate, hydrate } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Shown in place of a page whose loader has not answered yet. The top bar and
// the footer live in the root shell, so only this column swaps: the chrome
// stays put and a hairline under the bar says the click was heard. It is
// deliberately not a percentage: nothing on this page could say how far
// along the load is, so a filling bar would be a number nobody can check.
// prefers-reduced-motion is handled globally in styles.css, which freezes the
// pulse into a static line.
function PendingPage() {
  return (
    <div className="min-h-[60vh]" role="status" aria-label="Loading">
      <div className="h-0.5 w-full animate-pulse bg-primary/70" />
    </div>
  );
}

// Read once, when the router is built. The server has no preference to read
// and never animates anything, so it answers true and the client decides.
function prefersMotion() {
  if (typeof window === "undefined") return true;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,

    // Start the next page's loader while the pointer is still travelling to
    // the link, so the click lands on data that is already in flight. The
    // 50ms hold is what keeps a mouse swept across a 40-card grid from firing
    // 40 prefetches: a link has to be dwelt on, not passed over. Do not set
    // this to zero.
    defaultPreload: "intent",
    defaultPreloadDelay: 50,
    // The loaders prefetch into react-query, which does its own deduping and
    // freshness. Leaving the router's own preload cache always stale means a
    // second hover re-enters the loader and react-query answers it from
    // memory, rather than the router skipping the loader and the query cache
    // never being filled. This option was already here; it did nothing until
    // the line above turned preloading on.
    defaultPreloadStaleTime: 0,

    // Feedback only when there is something to feed back. Under 150ms the eye
    // reads the swap as instant and a flash of loading state is worse than
    // none, so nothing is shown. Once shown it stays 300ms so a load that
    // resolves right after the threshold cannot strobe.
    defaultPendingComponent: PendingPage,
    defaultPendingMs: 150,
    defaultPendingMinMs: 300,

    // Cross-fades the document swap where the browser supports it. There is no
    // library behind this and no polyfill: browsers without the API take the
    // same instant swap they take today, so the floor is current behaviour.
    // Off for anyone who asked for reduced motion. The blanket rule in
    // styles.css targets elements, and the cross-fade runs on
    // ::view-transition pseudo-elements it cannot reach, so the switch has to
    // be thrown here.
    defaultViewTransition: prefersMotion(),
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

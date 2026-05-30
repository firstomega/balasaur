import { createFileRoute, redirect } from "@tanstack/react-router";

// "Triage" was renamed to "Build Your Library" at /watched. Keep this path as a
// permanent redirect so old links/bookmarks don't 404.
export const Route = createFileRoute("/triage")({
  beforeLoad: () => {
    throw redirect({ to: "/watched", replace: true });
  },
});

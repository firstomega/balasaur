import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False during server rendering and during the first client render (the one
 * that hydrates), true afterwards. Anything that must render identically on
 * both sides but then wants personal or browser-only input reads it through
 * this gate, so the server HTML and the hydrating render never disagree.
 *
 * Built on useSyncExternalStore because React applies the server snapshot
 * while hydrating and re-renders with the client snapshot once the boundary
 * is hydrated, without treating the difference as a mismatch.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

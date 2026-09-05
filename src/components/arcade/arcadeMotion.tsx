// The arcade's keyframes, in one place. Components that animate render
// <ArcadeMotion /> once; a duplicate style tag on a page is a few hundred
// bytes and harmless. Every animation here is a transform or an opacity, and
// styles.css already collapses all animation durations to nothing under
// prefers-reduced-motion, so nothing needs a second guard.

export const ARCADE_KEYFRAMES = `
@keyframes arc-float {
  0% { transform: translate(-50%, 0) scale(1); opacity: 1; }
  100% { transform: translate(-50%, -28px) scale(1.15); opacity: 0; }
}
@keyframes arc-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-4px); }
  40% { transform: translateX(4px); }
  60% { transform: translateX(-3px); }
  80% { transform: translateX(3px); }
}
@keyframes arc-tick {
  0% { transform: scale(1); }
  40% { transform: scale(1.12); }
  100% { transform: scale(1); }
}
@keyframes arc-bump {
  0% { transform: scale(1); box-shadow: 0 0 0 0 transparent; }
  40% { transform: scale(1.15); box-shadow: 0 0 18px 2px var(--game, var(--primary)); }
  100% { transform: scale(1); box-shadow: 0 0 0 0 transparent; }
}
@keyframes arc-pop {
  0% { transform: scale(0.6); opacity: 0; }
  60% { transform: scale(1.08); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
.arc-float { animation: arc-float 700ms ease-out forwards; }
.arc-shake { animation: arc-shake 300ms ease-in-out; }
.arc-tick { animation: arc-tick 200ms ease-out; }
.arc-bump { animation: arc-bump 320ms ease-out; }
.arc-pop { animation: arc-pop 260ms cubic-bezier(0.2, 0.8, 0.3, 1.2) both; }
`;

export function ArcadeMotion() {
  return <style dangerouslySetInnerHTML={{ __html: ARCADE_KEYFRAMES }} />;
}

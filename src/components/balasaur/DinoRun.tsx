import { useEffect, useState } from "react";
import { useKonami } from "@/hooks/useKonami";
import { DinoMark } from "./DinoMark";

/**
 * Type r-a-w-r anywhere outside a text field and the dino crosses the bottom of
 * the page once, then leaves.
 *
 * Mounted once at the root and null until it fires, so the standing cost is one
 * keydown listener and a four-character string. Nothing renders, no timer runs
 * and no style ships until someone types it.
 */

const RUN_MS = 2500;
const STILL_MS = 1600;

const RUN_CSS = `
@keyframes dino-run-across {
  from { transform: translateX(-18vw); }
  to   { transform: translateX(118vw); }
}
@keyframes dino-run-bob {
  0%, 100% { transform: translateY(0) rotate(-3deg); }
  50%      { transform: translateY(-9px) rotate(3deg); }
}
.dino-run-track { animation: dino-run-across ${RUN_MS}ms linear both; }
.dino-run-bob { animation: dino-run-bob 260ms ease-in-out infinite; }
`;

export function DinoRun() {
  const [mode, setMode] = useState<"run" | "still" | null>(null);

  useKonami("rawr", () => {
    setMode((m) =>
      m ? m : window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "still" : "run",
    );
  });

  useEffect(() => {
    if (!mode) return;
    const t = window.setTimeout(() => setMode(null), mode === "run" ? RUN_MS : STILL_MS);
    return () => window.clearTimeout(t);
  }, [mode]);

  if (!mode) return null;

  const body = (
    <div className="flex items-end gap-2">
      <span className="text-[13px] font-black uppercase tracking-[0.14em] text-primary/70">
        Rawr
      </span>
      <DinoMark mood="chomp" size={44} filled className="h-11 w-11 text-primary" />
    </div>
  );

  return (
    // The run sits in the band directly above the consent bar. The bar
    // publishes its own height as --consent-h, which is 0px when it is not up,
    // so one number puts the dino on the floor of the window for a returning
    // visitor and just above the bar for a first-time one. Before this it ran
    // at a fixed distance from the bottom and a 90px bar on a 390px phone hid
    // the whole joke from exactly the person most likely to type it.
    //
    // z-20 keeps it under every fixed control (the bar is z-50, the top bar
    // z-30) and pointer-events-none keeps it out of the way of a tap, so it
    // cannot cover or block a control even while the two overlap.
    <div
      className="pointer-events-none fixed left-0 z-20 w-full overflow-hidden"
      style={{ bottom: "calc(var(--consent-h, 0px) + 12px)" }}
      aria-hidden="true"
    >
      {mode === "run" ? (
        <>
          <style>{RUN_CSS}</style>
          <div className="dino-run-track w-fit">
            <div className="dino-run-bob">{body}</div>
          </div>
        </>
      ) : (
        <div className="flex justify-center">{body}</div>
      )}
    </div>
  );
}

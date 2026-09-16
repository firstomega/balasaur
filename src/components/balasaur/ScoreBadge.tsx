import { cn } from "@/lib/utils";

// The Balasaur Score badge. Accessible by design: the number is always shown as
// text, color is a *supplementary* cue, and the two extremes get a dinosaur-themed
// icon (a non-color second cue) — an asteroid below 60, a bite mark at 85+.

/** Named tiers make the score quotable. The title page prints the tier next to
 *  the number at size "lg"; at the smaller sizes it rides in the tooltip and the
 *  aria-label, so a screen reader hears "92, Apex" where a sighted reader has
 *  the color. */
export function tierName(score: number): string {
  if (score >= 90) return "Apex";
  if (score >= 85) return "Balasaur Approved";
  if (score >= 70) return "Worth a look";
  if (score >= 60) return "Mixed";
  if (score >= 40) return "Rough";
  return "Extinction event";
}

function tierClasses(score: number): { text: string; ring: string } {
  if (score >= 85) return { text: "text-emerald-300", ring: "ring-emerald-400/40" };
  if (score >= 70) return { text: "text-lime-200", ring: "ring-lime-400/40" };
  if (score >= 60) return { text: "text-amber-200", ring: "ring-amber-400/40" };
  return { text: "text-orange-300", ring: "ring-orange-400/40" };
}

/** A rough space rock — shown when the score is low (it bombed). */
function Asteroid({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M11.6 2.6c2.2-.5 4.2.5 5.8 1.9 1.8 1.6 3 3.6 2.4 5.9-.4 1.7.5 2.7-.6 4.4-1.2 1.9-3.4 3-5.7 3.1-2.6.1-5.2-1-6.6-3.2-1.3-2-1.4-4.5-.5-6.7.9-2.2 2.9-4.8 5.2-5.4Z" />
      <circle cx="9.5" cy="9" r="1.4" className="text-background" fill="currentColor" />
      <circle cx="14" cy="13.5" r="1" className="text-background" fill="currentColor" />
    </svg>
  );
}

/** A bite taken out of a circle — shown when the score is high (it's tasty). */
function BiteMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 1 0 9.7 12.4 3.6 3.6 0 0 1-4.6-4.6A3.6 3.6 0 0 1 12 5.1 10 10 0 0 0 12 2Z" />
    </svg>
  );
}

export function ScoreBadge({
  score,
  size = "sm",
  className,
}: {
  score: number;
  /** "lg" is the title-page hero, where the tier is printed beside the badge. */
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const t = tierClasses(score);
  const dino = score >= 85 ? "bite" : score < 60 ? "asteroid" : null;
  const iconCls =
    size === "sm" ? "h-2.5 w-2.5" : size === "md" ? "h-3.5 w-3.5" : "h-5 w-5 md:h-6 md:w-6";
  return (
    <span
      // At "lg" the score name and its tier are printed next to the badge, so
      // the badge is just the number and everyone gets the same words in the
      // same order. At the smaller sizes there is nowhere to print them, so the
      // label and the tooltip carry them.
      aria-label={
        size === "lg"
          ? undefined
          : `Balasaur Score ${score} out of 100. ${tierName(score)}${score >= 90 ? ". Balasaur Approved" : ""}`
      }
      title={
        size === "lg"
          ? undefined
          : `${score}/100 · ${tierName(score)}${score >= 90 ? " · Balasaur Approved" : ""}`
      }
      className={cn(
        "inline-flex items-center gap-1 rounded-[4px] bg-background/90 font-mono font-semibold tabular-nums ring-1 backdrop-blur-sm",
        size === "sm" && "h-[20px] px-1.5 text-[11px]",
        size === "md" && "px-2 py-1 text-[14px]",
        // leading-none keeps the box height a function of the font size and the
        // padding alone, so the hero row does not change height when the
        // webfont swaps in.
        size === "lg" &&
          "gap-2 rounded-[6px] px-2.5 py-1.5 text-[30px] leading-none md:text-[38px]",
        t.text,
        t.ring,
        className,
      )}
    >
      {dino === "asteroid" && <Asteroid className={iconCls} />}
      {dino === "bite" && <BiteMark className={iconCls} />}
      {score}
    </span>
  );
}

import { cn } from "@/lib/utils";

// The Balasaur Score sticker: a black number on a white sticker with a black
// edge, the same at every score. The tile under it carries the poster's colour,
// so a tier colour here would be a second colour system on the same card, and
// a tier name or icon would restate the number. Callers decide whether a score
// is shown at all (src/lib/trust.ts); this only draws one.

export function ScoreBadge({
  score,
  size = "sm",
  className,
}: {
  score: number;
  /** "sm" sits on cards, rows and search hits; "md" in a panel; "lg" is the
   *  title-page hero, where "Balasaur Score" is printed beside it. */
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const label = `Balasaur Score ${score} out of 100`;
  return (
    <span
      // At "lg" the score's name is printed next to the sticker, so the
      // sticker is just the number. At the smaller sizes there is nowhere to
      // print it, so the label and the tooltip carry it.
      aria-label={size === "lg" ? undefined : label}
      title={size === "lg" ? undefined : label}
      className={cn(
        // leading-none keeps the box height a function of the explicit height
        // alone, so a row does not change height when the webfont swaps in.
        "inline-flex shrink-0 items-center justify-center border-2 border-sticker-ink bg-sticker font-display font-extrabold tabular-nums leading-none text-sticker-ink",
        size === "sm" && "h-7 min-w-8 rounded-lg px-1 text-lg",
        size === "md" && "h-9 min-w-10 rounded-lg px-1.5 text-xl",
        size === "lg" &&
          "h-12 min-w-14 rounded-xl border-[3px] px-2 text-3xl md:h-16 md:min-w-[4.5rem] md:text-4xl",
        className,
      )}
    >
      {score}
    </span>
  );
}

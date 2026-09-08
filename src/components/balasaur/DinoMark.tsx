/** Mood changes the head only. Body, tail and legs are identical in all three,
 *  so the mark still reads as the same animal at 20px in the top bar and at
 *  64px in an empty state. */
export type DinoMood = "calm" | "chomp" | "sleep";

interface DinoMarkProps {
  className?: string;
  /** Rendered width and height in px. A CSS size class on `className` wins. */
  size?: number;
  /** calm: resting. chomp: jaw open. sleep: eye shut, one z. */
  mood?: DinoMood;
  /** Accessible name. Omitted, the mark is decorative. */
  title?: string;
}

// Friendly, minimalist dino glyph. Rounded, characterful, not prehistoric or
// fossil. Faces right: tail at the bottom left, snout at x=21.
//
// The jaw is cut into the outline rather than drawn on top of it. A thin wedge
// laid over the closed head was invisible below about 40px, which is most of
// the places this mark appears.
const BODY_CLOSED =
  "M4 17c0-3 2-5 5-5h2c2 0 3-1 3-3 0-2 2-3 4-3 1.5 0 3 1 3 3v2c0 4-3 7-7 7H6c-1 0-2-.5-2-1z";

// Same path to the snout at (21,9), then back into the mouth at (16.2,10.6),
// out to the dropped lower jaw at (21.8,13.4), and down to the same belly.
// The 4.5-unit gap between the jaw tips is what keeps the mouth open rather
// than blobbed shut once the stroke is drawn.
const BODY_OPEN =
  "M4 17c0-3 2-5 5-5h2c2 0 3-1 3-3 0-2 2-3 4-3 1.5 0 3 1 3 3l-4.8 1.6 5.6 2.8C21.6 17 18.4 18 14 18H6c-1 0-2-.5-2-1z";

export function DinoMark({ className, size = 24, mood = "calm", title }: DinoMarkProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path d={mood === "chomp" ? BODY_OPEN : BODY_CLOSED} />
      {/* tail */}
      <path d="M4 17l-2 2" />
      {/* legs */}
      <path d="M8 17v3M12 17v3" />

      {mood === "sleep" ? (
        <>
          {/* shut eye */}
          <path d="M17.1 9.1h1.9" strokeWidth="1.4" />
          {/* one z, drawn thin so it keeps daylight from the head */}
          <path d="M15.4 1.4h3.2l-3.2 3.4h3.2" strokeWidth="1.2" opacity="0.75" />
        </>
      ) : (
        // The open jaw pushes the eye up out of the mouth.
        <circle
          cx={mood === "chomp" ? 18.2 : 18}
          cy={mood === "chomp" ? 7.4 : 9}
          r="0.6"
          fill="currentColor"
          stroke="none"
        />
      )}
    </svg>
  );
}

/** Mood changes the head only. Body, tail and legs are identical in all three,
 *  so the mark still reads as the same animal at 16px in the top bar and at
 *  96px in an empty state. */
export type DinoMood = "calm" | "chomp" | "sleep";

interface DinoMarkProps {
  className?: string;
  /** Rendered width and height in px. A CSS size class on `className` wins for
   *  layout, but this number still decides the stroke weight, so pass it when
   *  the mark is drawn much bigger or smaller than 24. */
  size?: number;
  /** calm: resting. chomp: jaw open. sleep: eye shut, one z. */
  mood?: DinoMood;
  /** Accessible name. Omitted, the mark is decorative. */
  title?: string;
  /** Solid body instead of an outline. Defaults on at 56px and up, where an
   *  outline starts to read as wire. */
  filled?: boolean;
}

/** The drawing sits low in a 0..24 box (the head is high and to the right, the
 *  feet are near the floor), so the window is shifted down to centre the ink. A
 *  canvas drawing these paths applies the same offset: translate(0, -1.3). */
export const DINO_MARK_VIEWBOX = "0 1.3 24 24";
export const DINO_MARK_ORIGIN_Y = 1.3;

// A long-necked, round-bodied dinosaur facing right: the one dinosaur
// silhouette a person recognises from across the room, which is the whole job
// at 16px. The animal is drawn as one closed outline from the rear of the body,
// over the back, up the neck, around the head, down the throat and along the
// belly, so no two parts cross and the outline never doubles back on itself.
//
// Two faults in the mark this replaces:
//
// - It used one stroke weight for everything, at every size. Here the body
//   carries the heaviest line, the legs sit just under it and the tail is the
//   finest, which is what makes a drawing read as a drawing instead of as wire.
//   The weights also move with `size`: a 2-unit stroke that is right at 24px is
//   lint at 16px and clumsy at 96px, and past 56px the body fills in instead.
// - It had no eye, and an animal without an eye is a shape. The eye is a solid
//   dot on the outline mark and a hole punched through the body on the filled
//   one, and it is the one detail carried at every size.
//
// The solid mark carries two values of the one colour, the way the arcade marks
// do: the tail and the far leg sit at 0.55 and everything else is full. It is
// the far side of the animal, so the drawing has a near side and a far side
// instead of being one silhouette. Nothing else changes, so the mark is still
// one path set in whatever colour the caller sets, and at 16px, where the mark
// is an outline, there is only ever one value.
/** Body, neck and head as one closed outline, jaw shut. */
const BODY_CALM =
  "M5.4 12.6C5.6 10.9 7.4 9.7 9.7 9.7c1.5 0 2.9.4 3.9 1.1c.5-1.7 1.5-3.5 2.9-4.8c.9-.9 2-1.5 3.1-1.5c1.7 0 2.9 1.1 2.9 2.5c0 1.3-1.1 2.4-2.7 2.4c-.9 0-1.6-.2-2.2-.6c-.9 1.2-1.5 2.6-1.7 4.1c.7 1.1.9 2.5.7 3.8c-.4 2-2.5 3.4-5.2 3.4c-2.4 0-4.4-.9-5.3-2.4c-.7-1.2-.9-3.6-.7-5.1z";

/** Same animal with the jaw dropped: the mouth is cut into the outline, not
 *  drawn on top of it. A wedge laid over a closed head vanished below 40px. */
const BODY_CHOMP =
  "M5.4 12.6C5.6 10.9 7.4 9.7 9.7 9.7c1.5 0 2.9.4 3.9 1.1c.5-1.7 1.5-3.5 2.9-4.8c.9-.9 2-1.5 3.1-1.5c1.7 0 2.9 1.1 2.9 2.5c0 .5-.2 1-.5 1.4l-4.3.5l3.5 1.7c-.5.5-1.3.8-2.2.8c-.5 0-.9-.1-1.3-.2c-.6 1-1 2.1-1.2 3.2c.7 1.1.9 2.5.7 3.8c-.4 2-2.5 3.4-5.2 3.4c-2.4 0-4.4-.9-5.3-2.4c-.7-1.2-.9-3.6-.7-5.1z";

/** The tail in two forms, because a tail is the one part that has to change
 *  with the mark. Filled, it is a wedge that thins to a point, which is what a
 *  tail does. Outlined, it is the finest line in the drawing: a filled wedge
 *  inside a hollow body reads as a solid triangle poking into it. */
const TAIL_FILL = "M6.2 13.0C4.6 12.2 3.1 11.6 1.7 11.2C3.0 12.6 4.4 13.9 6.1 15.2Z";
const TAIL_STROKE = "M5.9 14.2C4.4 13.4 3.0 12.6 1.8 11.8";

const LEG_BACK = "M8.6 19.4v2.5";
const LEG_FRONT = "M13.2 19.2v2.7";

/** Eye centre, used for the dot, the hole and the shut lid. */
const EYE = { x: 19.6, y: 6.6, r: 0.85 };

/** The second value, matching the arcade marks, whose receding parts sit at
 *  0.45 to 0.55 of the same hue. */
const SHADE = 0.55;

/** A circle as path data, so the filled mark can punch the eye out of the body
 *  with `evenodd` instead of painting a dot in a background colour it cannot
 *  know. */
function circlePath(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0z`;
}

export interface DinoPath {
  d: string;
  /** Painted solid rather than stroked. */
  fill?: boolean;
  /** Stroke width in viewBox units. Ignored when `fill` is set. */
  width?: number;
  /** `evenodd` on a filled path, so an inner sub-path is a hole. */
  evenOdd?: boolean;
  /** Opacity, 0 to 1. Omitted means full colour. */
  ink?: number;
}

/**
 * The mark as path data, in the same shape the arcade marks use, so the canvas
 * that draws the taste card and this SVG draw the same animal. Everything is
 * one colour: the caller sets it, the mark never picks a hue, and the second
 * value is a fraction of that same colour.
 *
 * `depth` turns the two-value pass on. It follows `filled`, which is what a
 * caller wants: the outline mark is small enough that a dimmed part reads as a
 * mistake, and the solid one is big enough to carry it.
 */
export function dinoPaths(
  mood: DinoMood,
  filled: boolean,
  weight: number,
  depth: boolean = filled,
): DinoPath[] {
  const body = mood === "chomp" ? BODY_CHOMP : BODY_CALM;
  const eyeDot = circlePath(EYE.x, EYE.y, EYE.r);
  const hole = (d: string) => (mood === "sleep" ? d : d + eyeDot);

  const out: DinoPath[] = [];
  if (filled) {
    // Body and eye in one path: evenodd turns the inner circle into daylight.
    out.push({ d: hole(body), fill: true, evenOdd: true });
    if (depth) {
      // The far side of the animal at the second value: the tail, which passes
      // behind the body, and the far leg. Both are drawn after the body, so
      // where they lie under it they add nothing (half a colour over the whole
      // of it is that colour) and only the part that clears the body dims. The
      // near leg stays full, and that difference is the depth.
      out.push({ d: TAIL_FILL, fill: true, ink: SHADE });
      out.push({ d: LEG_BACK, width: weight * 1.5, ink: SHADE });
    } else {
      out.push({ d: TAIL_FILL, fill: true });
      out.push({ d: LEG_BACK, width: weight * 1.5 });
    }
    out.push({ d: LEG_FRONT, width: weight * 1.5 });
  } else {
    out.push({ d: body, width: weight });
    out.push({ d: TAIL_STROKE, width: weight * 0.62 });
    out.push({ d: LEG_BACK, width: weight * 0.95 });
    out.push({ d: LEG_FRONT, width: weight * 0.95 });
    if (mood !== "sleep") out.push({ d: eyeDot, fill: true });
  }
  if (mood === "sleep") {
    // A shut lid, drawn dark on the filled mark and light on the outline one.
    out.push({
      d: `M${EYE.x - 1} ${EYE.y}h2`,
      width: weight * 0.7,
      ink: filled ? 0.35 : 1,
    });
    out.push({ d: "M16.7 2.3h2.6l-2.6 2.7h2.6", width: weight * 0.55, ink: 0.7 });
  }
  return out;
}

/** A 2-unit stroke is right at 24px, thin at 16 and heavy at 96. */
export function dinoWeight(size: number): number {
  if (size <= 18) return 2.5;
  if (size <= 32) return 2.1;
  if (size <= 56) return 1.9;
  return 1.7;
}

export function DinoMark({ className, size = 24, mood = "calm", title, filled }: DinoMarkProps) {
  const solid = filled ?? size >= 56;
  const paths = dinoPaths(mood, solid, dinoWeight(size));

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={DINO_MARK_VIEWBOX}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {paths.map((p, i) =>
        p.fill ? (
          <path
            key={i}
            d={p.d}
            fill="currentColor"
            fillRule={p.evenOdd ? "evenodd" : undefined}
            stroke="none"
            opacity={p.ink}
          />
        ) : (
          <path key={i} d={p.d} strokeWidth={p.width} opacity={p.ink} />
        ),
      )}
    </svg>
  );
}

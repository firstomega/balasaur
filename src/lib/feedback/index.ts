// The arcade's feedback channel: sound, haptics, and the two "less, please"
// preferences that decide how much of either a player gets.
//
// Why this exists. The arcade escalates. A streak is worth more than a hit,
// the last three seconds are worth more than the first thirty, and the payout
// at the end is the point of the run. None of that is visible without adding
// more to the screen, and the screen is already full. Sound carries
// escalation for free and changes no rule.
//
// Everything is synthesized at runtime. Samples would be 60 to 150 KB of mp3
// plus a decode before the first cue can play, on a site that already has a
// page-weight problem.
//
// Nothing here makes a sound until the player turns it on. The switch lives on
// each game's ready panel and starts off.

/** The seven things the arcade can say. */
export type CueName = "commit" | "right" | "wrong" | "tick" | "land" | "combo" | "payout";

const KEY = "balasaur:sound";

/** Game events fire at unpredictable times and one game can judge an answer
 *  every 300ms. Two cues closer together than this read as a single smear, so
 *  the second is dropped. The payout ends the run and is never dropped. */
const FLOOR_MS = 120;

type Engine = typeof import("./engine");

let ctx: AudioContext | null = null;
let engine: Promise<Engine> | null = null;
let enabled = false;
let read = false;
let lastAt = 0;
let canBuzz: boolean | null = null;

/**
 * prefers-reduced-motion lives beside the sound preference because it answers
 * the same question: how much does this person want happening at them. It is
 * NOT a sound preference and nothing here treats it as one. Sound is off for
 * everyone until they switch it on, so this query gates no audio at all. It is
 * here so the two checks sit in one place instead of six.
 *
 * Unreadable means treat it as set: stillness is the safe default.
 */
export function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return true;
  }
}

/** The stored preference. False on the server and on a first visit. */
export function soundEnabled(): boolean {
  if (!read) {
    read = true;
    try {
      enabled = localStorage.getItem(KEY) === "1";
    } catch {
      enabled = false;
    }
  }
  return enabled;
}

function makeContext(): boolean {
  if (ctx) return true;
  const Ctor =
    typeof window === "undefined"
      ? undefined
      : (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Ctor) return false;
  try {
    ctx = new Ctor();
  } catch {
    return false;
  }
  return true;
}

/**
 * Turn sound on or off. Call this from the click handler itself, never from an
 * effect: the AudioContext has to be constructed inside a real gesture or the
 * browser hands back a suspended one and every cue after it is silence.
 *
 * Returns what the preference actually became, which is false when the browser
 * has no Web Audio at all.
 */
export function setSoundEnabled(on: boolean): boolean {
  if (on) {
    if (!makeContext()) return false;
    void ctx?.resume?.().catch(() => {});
    if (!engine) engine = import("./engine");
  }
  read = true;
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* private mode; the preference lasts the session */
  }
  return on;
}

/** For a player who switched sound on in an earlier session: a tab has no
 *  gesture yet, so the context they get is suspended. Call this from the first
 *  real click of the session, which is the play control. */
export function resumeSound(): void {
  if (!soundEnabled()) return;
  if (!makeContext()) return;
  void ctx?.resume?.().catch(() => {});
  if (!engine) engine = import("./engine");
}

/**
 * Fire one cue. Silent and free when sound is off: the synthesizer is a
 * separate chunk that is never fetched until the switch goes on.
 *
 * `step` is the streak position for the pitched cues. Zero is the root.
 */
export function cue(name: CueName, step = 0): void {
  if (!soundEnabled() || !ctx) return;
  const now = Date.now();
  if (name !== "payout" && now - lastAt < FLOOR_MS) return;
  lastAt = now;
  engine
    ?.then((m) => {
      if (ctx) m.play(ctx, name, step);
    })
    .catch(() => {});
}

/**
 * One buzz, one capability check. navigator.vibrate does not exist in Safari
 * on iOS, so a bare call there is a line of code that has never once run.
 */
export function haptic(ms = 10): void {
  if (canBuzz === null) {
    canBuzz = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
  }
  if (!canBuzz) return;
  try {
    navigator.vibrate(ms);
  } catch {
    canBuzz = false;
  }
}

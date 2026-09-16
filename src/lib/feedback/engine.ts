// The synthesizer. Loaded only after a player switches sound on, so a visitor
// who arrives from search and never touches the switch fetches none of it.

import type { CueName } from "./index";

// Major pentatonic. The scale matters more than the notes: arcade events fire
// at times nobody can predict and two of them can land in the same tenth of a
// second, and this is the scale where no two of its notes, in any order or
// together, make a sour interval. A streak can therefore climb it without
// anyone having to decide what happens when a hit lands on top of a tick.
const DEGREES = [0, 2, 4, 7, 9];
const ROOT_HZ = 440;

/** Two octaves of climb. Past this the note is thin on a phone speaker and the
 *  streak stops reading as a streak. */
const MAX_STEP = 10;

/** A phone browser will start dozens of oscillators without complaint and then
 *  crackle. Six at once is more than any cue asks for. */
const MAX_VOICES = 6;
let voices = 0;

function hz(step: number): number {
  const s = Math.max(0, Math.min(MAX_STEP, Math.round(step)));
  const semitones = DEGREES[s % 5] + 12 * Math.floor(s / 5);
  return ROOT_HZ * Math.pow(2, semitones / 12);
}

interface Voice {
  hz: number;
  /** Seconds from now. */
  at?: number;
  dur?: number;
  type?: OscillatorType;
  gain?: number;
  /** Bend to this frequency across the note. */
  to?: number;
}

function tone(ctx: AudioContext, v: Voice): void {
  if (voices >= MAX_VOICES) return;
  const t0 = ctx.currentTime + (v.at ?? 0);
  const dur = v.dur ?? 0.12;
  const peak = v.gain ?? 0.12;
  const osc = ctx.createOscillator();
  osc.type = v.type ?? "triangle";
  osc.frequency.setValueAtTime(v.hz, t0);
  if (v.to) osc.frequency.exponentialRampToValueAtTime(v.to, t0 + dur);
  const amp = ctx.createGain();
  // Exponential ramps cannot touch zero, hence the near-silent floor. The 8ms
  // attack is what keeps a square wave from clicking on every blip.
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(amp).connect(ctx.destination);
  voices += 1;
  osc.onended = () => {
    voices -= 1;
  };
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

let noiseBuffer: AudioBuffer | null = null;

/** A band of noise: the part of a card hitting a surface that no oscillator
 *  can make. Built once, reused. */
function thud(ctx: AudioContext, centreHz: number, dur: number, gain: number): void {
  if (voices >= MAX_VOICES) return;
  if (!noiseBuffer) {
    const frames = Math.floor(ctx.sampleRate * 0.2);
    noiseBuffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = centreHz;
  band.Q.value = 1.2;
  const amp = ctx.createGain();
  const t0 = ctx.currentTime;
  amp.gain.setValueAtTime(gain, t0);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(band).connect(amp).connect(ctx.destination);
  voices += 1;
  src.onended = () => {
    voices -= 1;
  };
  src.start(t0);
  src.stop(t0 + dur);
}

/**
 * `step` is the streak position: 0 on the first hit, one pentatonic degree per
 * hit after it. The engine holds no state of its own, so a broken streak is a
 * caller passing 0 again and the line audibly drops back to the root.
 */
export function play(ctx: AudioContext, name: CueName, step = 0): void {
  switch (name) {
    // You did a thing. Short, flat, no opinion about whether it was right.
    case "commit":
      tone(ctx, { hz: hz(2), dur: 0.05, type: "square", gain: 0.05 });
      break;
    // The streak, one degree higher than the last one, with a quiet octave on
    // top so the climb stays bright as it rises.
    case "right":
      tone(ctx, { hz: hz(step), dur: 0.14, gain: 0.14 });
      tone(ctx, { hz: hz(step) * 2, dur: 0.09, type: "sine", gain: 0.05 });
      break;
    // Down a fourth, still inside the scale. A buzzer would be a punishment;
    // this is the line falling off.
    case "wrong":
      tone(ctx, { hz: hz(0) / 2, to: hz(0) / 2.67, dur: 0.22, gain: 0.13 });
      break;
    // The last few seconds. High and very short so it sits above everything
    // else without ever being the loudest thing.
    case "tick":
      tone(ctx, { hz: hz(9), dur: 0.035, type: "sine", gain: 0.07 });
      break;
    // A card arriving in a slot.
    case "land":
      thud(ctx, 1100, 0.055, 0.05);
      tone(ctx, { hz: hz(0) / 2, dur: 0.07, type: "sine", gain: 0.07 });
      break;
    // Crossing a heat tier. Starts on the note the streak had reached, then
    // leaps, so the rising line carries straight through the jump.
    case "combo":
      tone(ctx, { hz: hz(step), dur: 0.1, gain: 0.1 });
      tone(ctx, { hz: hz(step + 2), at: 0.07, dur: 0.14, gain: 0.11 });
      break;
    // The run is over and the comets are counted.
    case "payout":
      [0, 2, 4, 7].forEach((s, i) => {
        tone(ctx, { hz: hz(s), at: i * 0.09, dur: i === 3 ? 0.4 : 0.16, gain: 0.12 });
      });
      break;
  }
}

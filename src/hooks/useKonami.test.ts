import { describe, expect, it } from "bun:test";
import { isTypingTarget, pushKey } from "./useKonami";

describe("pushKey", () => {
  it("keeps at most `size` characters", () => {
    let b = "";
    for (const k of "xyzrawr") b = pushKey(b, k, 4);
    expect(b).toBe("rawr");
    expect(b.length).toBe(4);
  });

  it("lower-cases so a held Shift still matches", () => {
    let b = "";
    for (const k of "RaWr") b = pushKey(b, k, 4);
    expect(b).toBe("rawr");
  });

  it("matches on a fresh start and again after a miss", () => {
    let b = "";
    for (const k of "rawq") b = pushKey(b, k, 4);
    expect(b).toBe("rawq");
    for (const k of "rawr") b = pushKey(b, k, 4);
    expect(b).toBe("rawr");
  });

  it("does not match a prefix of a longer run", () => {
    let b = "";
    for (const k of "rawra") b = pushKey(b, k, 4);
    expect(b).toBe("awra");
  });
});

describe("isTypingTarget", () => {
  it("skips the fields people type into", () => {
    expect(isTypingTarget({ tagName: "INPUT" })).toBe(true);
    expect(isTypingTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTypingTarget({ tagName: "SELECT" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  it("lets the page through", () => {
    expect(isTypingTarget({ tagName: "BODY" })).toBe(false);
    expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: false })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

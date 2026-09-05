import { describe, expect, it } from "bun:test";
import { ledgerLine, splitGrid } from "./EndScreen";

describe("ledgerLine", () => {
  it("reads count lines as count x per and flat lines as a signed bonus", () => {
    expect(
      ledgerLine([
        { label: "Matches", count: 4, per: 2, value: 8 },
        { label: "Clean board", value: 5 },
      ]),
    ).toBe("4 matches x 2, clean board +5");
  });

  it("drops a zero flat line and keeps a negative sign", () => {
    expect(
      ledgerLine([
        { label: "Solved", value: 12 },
        { label: "Hints", count: 0, per: -2, value: 0 },
        { label: "Under par", value: 0 },
        { label: "Hints", value: -2 },
      ]),
    ).toBe("solved +12, hints -2");
  });
});

describe("splitGrid", () => {
  it("keeps the squares and moves an overflow count to its own line", () => {
    const parts = splitGrid(["🟩🟩🟩 +11"]);
    expect(JSON.stringify(parts.squares)).toBe(JSON.stringify(["🟩🟩🟩"]));
    expect(parts.overflow).toBe("+11 more");
  });

  it("returns no overflow for rows that are squares only", () => {
    const parts = splitGrid(["🟩🟥⬛", "🟨🟨"]);
    expect(JSON.stringify(parts.squares)).toBe(JSON.stringify(["🟩🟥⬛", "🟨🟨"]));
    expect(parts.overflow).toBe(null);
  });
});

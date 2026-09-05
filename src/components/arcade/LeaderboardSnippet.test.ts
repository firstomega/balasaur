import { describe, expect, it } from "bun:test";
import { rowLabel, type SnippetRow } from "./LeaderboardSnippet";

const row = (name: string, handle?: string): SnippetRow => ({
  rank: 12,
  name,
  score: 8,
  durationMs: 142000,
  handle,
});

describe("rowLabel", () => {
  it("shows a named viewer row as the name with a you tag, never both words", () => {
    const l = rowLabel(row("Priya"), true);
    expect(l.name).toBe("Priya");
    expect(l.tag).toBe(true);
  });

  it("reads You alone for a viewer row named you, or unnamed", () => {
    expect(rowLabel(row("you"), true).name).toBe("You");
    expect(rowLabel(row("you"), true).tag).toBe(false);
    expect(rowLabel(row(""), true).name).toBe("You");
    expect(rowLabel(row(""), true).tag).toBe(false);
  });

  it("shows other rows by name, falling back to the handle", () => {
    expect(rowLabel(row("Dana K.", "danak"), false).name).toBe("Dana K.");
    expect(rowLabel(row("Dana K.", "danak"), false).tag).toBe(false);
    expect(rowLabel(row("", "danak"), false).name).toBe("danak");
  });
});

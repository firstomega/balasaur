import { describe, expect, it } from "bun:test";
import { gridCells } from "./ResultGrid";

const json = (v: unknown) => JSON.stringify(v);

describe("gridCells", () => {
  it("maps the four squares to tones in order", () => {
    expect(json(gridCells("🟩🟥⬛🟨"))).toBe(
      json([
        { kind: "square", tone: "green" },
        { kind: "square", tone: "red" },
        { kind: "square", tone: "black" },
        { kind: "square", tone: "yellow" },
      ]),
    );
  });

  it("keeps an overflow count as text after the squares", () => {
    const cells = gridCells("🟩🟩 +3");
    expect(cells.length).toBe(3);
    expect(cells[0].kind).toBe("square");
    expect(cells[1].kind).toBe("square");
    expect(json(cells[2])).toBe(json({ kind: "text", text: "+3" }));
  });

  it("gives an empty row no cells", () => {
    expect(gridCells("").length).toBe(0);
    expect(gridCells("   ").length).toBe(0);
  });
});

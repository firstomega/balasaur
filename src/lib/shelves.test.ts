import { describe, expect, it } from "bun:test";
import {
  createShelf,
  moveItem,
  moveShelf,
  nudgeItem,
  placeItem,
  removeItem,
  sanitize,
  shelvedIdSet,
  shelvesHolding,
  type Shelf,
} from "./shelves";

const mk = (id: string, items: string[]): Shelf => ({ id, name: id, items, ts: 1 });

describe("shelves", () => {
  it("creates with a trimmed name and deduped items", () => {
    const out = createShelf([], "  Loved  ", ["a", "a", "b"]);
    expect(out.length).toBe(1);
    expect(out[0].name).toBe("Loved");
    expect(out[0].items.join("|")).toBe(["a", "b"].join("|"));
  });

  it("refuses an empty name", () => {
    expect(createShelf([], "   ").length).toBe(0);
  });

  it("places once per shelf but allows the same title on several shelves", () => {
    let s = [mk("x", ["a"]), mk("y", [])];
    s = placeItem(s, "x", "a");
    s = placeItem(s, "y", "a", 0);
    expect(s[0].items.join("|")).toBe(["a"].join("|"));
    expect(s[1].items.join("|")).toBe(["a"].join("|"));
    expect(
      shelvesHolding(s, "a")
        .map((v) => v.id)
        .join("|"),
    ).toBe(["x", "y"].join("|"));
  });

  it("moveItem reorders in place and lands at the exact index across shelves", () => {
    let s = [mk("x", ["a", "b", "c"]), mk("y", ["d"])];
    s = moveItem(s, "x", "x", "c", 0);
    expect(s[0].items.join("|")).toBe(["c", "a", "b"].join("|"));
    s = moveItem(s, "x", "y", "a", 1);
    expect(s[0].items.join("|")).toBe(["c", "b"].join("|"));
    expect(s[1].items.join("|")).toBe(["d", "a"].join("|"));
  });

  it("moveItem into a shelf already holding the id is a no-op", () => {
    const s = [mk("x", ["a"]), mk("y", ["a", "b"])];
    const out = moveItem(s, "x", "y", "a", 0);
    expect(out[0].items.join("|")).toBe(["a"].join("|"));
    expect(out[1].items.join("|")).toBe(["a", "b"].join("|"));
  });

  it("nudge swaps neighbours and stops at the edges", () => {
    let s = [mk("x", ["a", "b"])];
    s = nudgeItem(s, "x", "a", 1);
    expect(s[0].items.join("|")).toBe(["b", "a"].join("|"));
    expect(nudgeItem(s, "x", "a", 1)[0].items.join("|")).toBe(["b", "a"].join("|"));
  });

  it("moveShelf reorders the case", () => {
    const s = [mk("x", []), mk("y", []), mk("z", [])];
    expect(
      moveShelf(s, "z", -1)
        .map((v) => v.id)
        .join("|"),
    ).toBe(["x", "z", "y"].join("|"));
    expect(
      moveShelf(s, "x", -1)
        .map((v) => v.id)
        .join("|"),
    ).toBe(["x", "y", "z"].join("|"));
  });

  it("sanitize survives junk and dedupes per shelf", () => {
    const out = sanitize([
      null,
      42,
      { id: "ok", name: "OK", items: ["a", "a", 7, "b"], ts: "nope" },
    ] as unknown[]);
    expect(out.length).toBe(1);
    expect(out[0].items.join("|")).toBe(["a", "b"].join("|"));
    expect(out[0].ts).toBe(0);
  });

  it("removeItem then shelvedIdSet reflects membership", () => {
    let s = [mk("x", ["a", "b"]), mk("y", ["b"])];
    s = removeItem(s, "x", "b");
    expect([...shelvedIdSet(s)].sort().join("|")).toBe(["a", "b"].join("|"));
    s = removeItem(s, "y", "b");
    expect([...shelvedIdSet(s)].sort().join("|")).toBe(["a"].join("|"));
  });
});

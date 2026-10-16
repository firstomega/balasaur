import { describe, expect, it } from "bun:test";
import { MAX_PAGE, canonicalPath, homeIsIndexable, pageNumber } from "./homePaging";

describe("home page trail", () => {
  it("offers only the unfiltered first page to Google", () => {
    expect(homeIsIndexable(undefined)).toBe(true);
    expect(homeIsIndexable({})).toBe(true);
    expect(homeIsIndexable({ page: "1" })).toBe(true);
    expect(homeIsIndexable({ page: "2" })).toBe(false);
    expect(homeIsIndexable({ page: String(MAX_PAGE) })).toBe(false);
  });

  it("keeps self-canonicals on the trail so the links stay followed", () => {
    expect(canonicalPath({ page: "3" })).toBe("/?page=3");
    expect(canonicalPath({})).toBe("/");
  });

  it("leaves filtered views to their canonical rather than adding a noindex", () => {
    // A filtered view already names "/" as canonical; noindex on top of that
    // would contradict it.
    const filtered = { genres: "Horror", page: "3" };
    expect(canonicalPath(filtered)).toBe("/");
    expect(homeIsIndexable(filtered)).toBe(true);
  });

  it("reads junk and out-of-range pages as page 1", () => {
    expect(pageNumber("abc")).toBe(1);
    expect(pageNumber(String(MAX_PAGE + 1))).toBe(1);
    expect(homeIsIndexable({ page: "9999" })).toBe(true);
    expect(canonicalPath({ page: "9999" })).toBe("/");
  });
});

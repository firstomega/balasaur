import { describe, expect, it } from "bun:test";
import { longDate } from "./mediaFormat";

describe("longDate", () => {
  it("writes a full ISO date the way a person does", () => {
    expect(longDate("1956-07-09")).toBe("July 9, 1956");
    expect(longDate("2010-07-15")).toBe("July 15, 2010");
  });

  it("prints only what a partial date carries", () => {
    expect(longDate("2026-11")).toBe("November 2026");
    expect(longDate("2026")).toBe("2026");
  });

  it("returns anything it cannot read unchanged", () => {
    expect(longDate("TBA")).toBe("TBA");
    expect(longDate("2026-13-01")).toBe("2026");
  });
});

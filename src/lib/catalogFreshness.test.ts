import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The nightly sync's freshness canary lives in a shell script so the workflow
// runs exactly what is tested here. These cases use the freshness values the
// sync endpoint really returned on the nights named, copied from the run logs.

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(HERE, "../../.github/scripts/catalog-freshness.sh");

// The script parses timestamps with GNU date, as the GitHub runner does.
const gnuDate = spawnSync("date", ["-u", "-d", "2026-11-01T00:00:00+00:00", "+%s"]).status === 0;

function sh(args: string[]) {
  const out = spawnSync("bash", [SCRIPT, ...args], { encoding: "utf8" });
  return { code: out.status, stdout: (out.stdout ?? "").trim() };
}

function run(lines: string[], nowIso: string, maxHours = 48) {
  const dir = mkdtempSync(join(tmpdir(), "freshness-"));
  const file = join(dir, "freshness.txt");
  writeFileSync(file, lines.join("\n") + "\n");
  const now = Math.floor(Date.parse(nowIso) / 1000);
  return sh([file, String(maxHours), String(now)]);
}

// Skipped where date has no -d (macOS); the runner and CI are GNU.
const suite = gnuDate ? describe : (_name: string, _fn: () => void) => {};

suite("catalog-freshness.sh", () => {
  it("is fresh when the last pass returned null but earlier passes did not (1 Nov)", () => {
    const r = run(
      [
        "2026-11-01T14:56:09.97+00:00",
        "2026-11-01T14:56:44.923+00:00",
        "2026-11-01T14:57:16.46+00:00",
        "2026-11-01T14:57:52.628+00:00",
        "2026-11-01T14:58:35.022+00:00",
        "2026-11-01T14:59:46.64+00:00",
        "null",
        "null",
        "null",
      ],
      "2026-11-01T15:02:42Z",
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("newest=2026-11-01T14:59:46.64+00:00 age_h=0 passes=6/9");
  });

  it("picks the newest value, not the last one in the file", () => {
    const r = run(
      [
        "2026-11-03T16:08:22.747+00:00",
        "2026-11-03T16:09:38.49+00:00",
        "2026-11-03T16:02:41.087+00:00",
      ],
      "2026-11-03T16:12:00Z",
    );
    expect(r.code).toBe(0);
    expect(r.stdout.startsWith("newest=2026-11-03T16:09:38.49+00:00 ")).toBe(true);
  });

  it("orders by time, not by string, across fractional-second widths", () => {
    // ".9" is later than ".85" though shorter; "16:00:01" with no fraction is
    // later than "16:00:00.999".
    const r = run(
      ["2026-11-05T16:00:00.999+00:00", "2026-11-05T16:00:01+00:00"],
      "2026-11-05T16:05:00Z",
    );
    expect(r.stdout.startsWith("newest=2026-11-05T16:00:01+00:00 ")).toBe(true);
  });

  it("fails with exit 1 when no pass returned a value", () => {
    const r = run(["null", "", "null"], "2026-11-02T18:20:00Z");
    expect(r.code).toBe(1);
    expect(r.stdout).toBe("newest= age_h= passes=0/3");
  });

  it("fails with exit 1 when the file is missing (grow step never wrote one)", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(sh(["/nonexistent/freshness.txt", "48", String(now)]).code).toBe(1);
  });

  it("fails with exit 2 when the newest write is older than the limit", () => {
    // Writes stopped landing: the newest fetched_at stays where it was.
    const r = run(["2026-11-01T14:59:46.64+00:00", "null"], "2026-11-04T16:00:00Z");
    expect(r.code).toBe(2);
    expect(r.stdout).toBe("newest=2026-11-01T14:59:46.64+00:00 age_h=73 passes=1/2");
  });

  it("skips a value date cannot parse instead of treating it as fresh", () => {
    const r = run(["not-a-date"], "2026-11-04T16:00:00Z");
    expect(r.code).toBe(1);
  });
});

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The module injects a CDN script and talks to window, so the behaviour worth
// guarding is not "does it call PostHog" (it cannot, headless) but the promises
// made in its own comments: consent-gated, anonymous, and no npm dependency.
const HERE = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(HERE, "posthog.ts"), "utf8");
const pkg = JSON.parse(readFileSync(join(HERE, "..", "..", "package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

describe("posthog wiring", () => {
  it("never fires without full cookie consent", () => {
    // Both entry points must check before doing anything. A regression here is
    // a privacy failure, not a bug.
    expect(src).toContain('if (getConsent() !== "all") return;');
  });

  it("loads from the CDN rather than the bundle", () => {
    // The house rules call the client bundle heavy and forbid adding
    // dependencies unasked; an unconsented visitor should download nothing.
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    expect(Object.keys(deps)).not.toContain("posthog-js");
    // Built from a constant, so assert the two halves rather than one literal.
    expect(src).toContain("https://us-assets.i.posthog.com");
    expect(src).toContain("/static/array.js");
  });

  it("stays anonymous: no identify call, no account identity leaves the site", () => {
    expect(src).not.toContain(".identify(");
    expect(src).toContain('person_profiles: "identified_only"');
  });

  it("masks typed input in session recordings", () => {
    // The search box would otherwise capture free text.
    expect(src).toContain("maskAllInputs: true");
  });

  it("can be stopped when consent is withdrawn", () => {
    expect(src).toContain("opt_out_capturing");
  });

  it("does not double-report the same path", () => {
    expect(src).toContain("if (path === lastTrackedPath) return;");
  });
});

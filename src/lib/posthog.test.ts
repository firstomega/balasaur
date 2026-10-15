import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPostHogPlaceholder } from "./posthog";

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

// PostHog's loader only takes over a placeholder it recognises. When the site
// built a plain object instead, the loader left it in place and the site's own
// replay pushed every call back onto the queue it was iterating: an endless
// loop that froze the tab and grew memory until a phone's browser killed it.
describe("createPostHogPlaceholder", () => {
  it("is the array PostHog's loader recognises, marked __SV", () => {
    const ph = createPostHogPlaceholder();
    expect(Array.isArray(ph)).toBe(true);
    expect(ph.__SV).toBe(1);
    expect(Array.isArray(ph._i)).toBe(true);
  });

  it("holds init calls in _i for the loader to initialise from", () => {
    const ph = createPostHogPlaceholder();
    ph.init("phc_test", { api_host: "https://example.test" });
    const pending = ph._i as unknown[][];
    expect(pending.length).toBe(1);
    expect(pending[0][0]).toBe("phc_test");
    expect(ph.length).toBe(0); // init is not an ordinary queued call
  });

  it("queues other calls on itself, for the loader to replay", () => {
    const ph = createPostHogPlaceholder();
    ph.capture("$pageview", { path: "/" });
    ph.opt_out_capturing();
    expect(ph.length).toBe(2);
    expect((ph[0] as unknown[])[0]).toBe("capture");
    expect((ph[1] as unknown[])[0]).toBe("opt_out_capturing");
  });
});

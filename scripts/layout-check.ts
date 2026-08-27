// Layout check: does any page scroll sideways?
//
// The bug this exists to catch shipped twice by hand: a top bar too wide for a
// phone, and a grid whose child ignored its container. Both compiled, both
// passed tests, and both were only visible in a rendered page at 390px. This
// boots the dev server, loads the routes that matter at three real widths, and
// fails when the document itself scrolls horizontally.
//
// Horizontal scroll INSIDE a rail is the design (ScrollRail). Horizontal scroll
// on the document is always a bug, so that is the only thing asserted. When it
// fails, the offending elements are named, because "the page scrolls" is not
// something a person can act on.
//
// Full-page screenshots of every route at every width are written to
// artifacts/layout/ and uploaded by CI whether or not the check passes. That is
// the cheap half of "judge the rendered page, not the component".
//
// Run: bun scripts/layout-check.ts   (needs `bun add --no-save playwright`)

import { chromium } from "playwright";
import { mkdir, rm } from "node:fs/promises";

const WIDTHS = [
  { w: 390, h: 844, label: "390" },
  { w: 768, h: 1024, label: "768" },
  { w: 1440, h: 900, label: "1440" },
];

const OUT_DIR = "artifacts/layout";
/** Sub-pixel layout rounding is not a bug. Anything wider is. */
const SLACK_PX = 1;
const SERVER_TIMEOUT_MS = 180_000;

interface Offender {
  selector: string;
  right: number;
  text: string;
}

interface Measurement {
  overflow: number;
  viewport: number;
  offenders: Offender[];
}

/** Boot `bun run dev` and wait until it prints a URL. */
async function startServer(): Promise<{ url: string; stop: () => void }> {
  // LAYOUT_DEV_HOST exists for sandboxes whose network stack has no IPv6: vite's
  // own host detection picks "::" there and the server dies with EAFNOSUPPORT
  // before printing a URL, so this gate could not run at all. Unset in CI, where
  // the default is correct.
  const devHost = process.env.LAYOUT_DEV_HOST;
  const devArgs = devHost
    ? ["bun", "run", "dev", "--host", devHost, "--port", "8080"]
    : ["bun", "run", "dev"];
  const proc = Bun.spawn(devArgs, {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, BROWSER: "none", CI: "1" },
  });
  const stop = () => {
    try {
      proc.kill();
    } catch {
      /* already gone */
    }
  };

  const urlRe = /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/?/;
  const decoder = new TextDecoder();
  const ansi = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
  let seen = "";

  const read = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      const text = decoder.decode(value).replace(ansi, "");
      seen += text;
      process.stdout.write(text);
    }
  };
  void read(proc.stdout as ReadableStream<Uint8Array>);
  void read(proc.stderr as ReadableStream<Uint8Array>);

  const deadline = Date.now() + SERVER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const m = seen.match(urlRe);
    if (m) {
      const url = m[0].replace(/\/$/, "");
      // The URL is printed before the server is listening, so poll it.
      for (let i = 0; i < 60; i++) {
        try {
          const res = await fetch(url, { redirect: "manual" });
          if (res.status < 500) return { url, stop };
        } catch {
          /* not up yet */
        }
        await Bun.sleep(1000);
      }
    }
    await Bun.sleep(500);
  }
  stop();
  throw new Error(`Dev server did not report a URL within ${SERVER_TIMEOUT_MS / 1000}s`);
}

/**
 * Measure document overflow and name the shallowest elements responsible.
 * Elements inside a scrollable ancestor are the design, not a defect, so they
 * are skipped.
 */
function measure(): Measurement {
  const vw = window.innerWidth;
  const overflow = document.documentElement.scrollWidth - vw;
  if (overflow <= 1) return { overflow, viewport: vw, offenders: [] };

  const scrollableAncestor = (el: Element): boolean => {
    let p = el.parentElement;
    while (p && p !== document.documentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === "auto" || ox === "scroll" || ox === "hidden") return true;
      p = p.parentElement;
    }
    return false;
  };

  const bad: Element[] = [];
  for (const el of Array.from(document.body.querySelectorAll("*"))) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right <= vw + 1 && r.left >= -1) continue;
    const cs = getComputedStyle(el);
    // Fixed elements are painted against the viewport and cannot extend the
    // scrollable area, so they are never the cause.
    if (cs.position === "fixed" || cs.visibility === "hidden") continue;
    if (scrollableAncestor(el)) continue;
    bad.push(el);
  }
  const shallowest = bad.filter((el) => !bad.some((o) => o !== el && o.contains(el)));

  const describe = (el: Element): string => {
    const id = el.id ? `#${el.id}` : "";
    const cls = Array.from(el.classList).slice(0, 3).join(".");
    return `${el.tagName.toLowerCase()}${id}${cls ? `.${cls}` : ""}`;
  };

  return {
    overflow,
    viewport: vw,
    offenders: shallowest.slice(0, 5).map((el) => ({
      selector: describe(el),
      right: Math.round(el.getBoundingClientRect().right),
      text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 48),
    })),
  };
}

async function main() {
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const { url, stop } = await startServer();
  console.log(`\nDev server up at ${url}\n`);

  // CHROMIUM_PATH exists for images that preinstall browsers at a build number
  // playwright does not expect: a bare launch() then looks for a chromium it
  // cannot download offline. Unset in CI, where `playwright install` provides
  // the matching build.
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  );
  const failures: string[] = [];
  const skipped: string[] = [];
  let checkedRoutes = 0;

  try {
    // Detail routes carry an id in the path, so pick real ones off the site
    // rather than pinning ids that go stale.
    const scout = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const firstHref = async (from: string, prefix: string): Promise<string | null> => {
      await scout.goto(`${url}${from}`, { waitUntil: "load", timeout: 60_000 });
      // Budgeted loaders stream the shell first and fill in data client-side,
      // and a cold dev server compiles on demand, so a link can legitimately
      // take a while to exist. Wait for it rather than for a fixed pause.
      const found = await scout
        .waitForSelector(`a[href^="${prefix}"]`, { timeout: 30_000 })
        .catch(() => null);
      if (found) return found.getAttribute("href");
      // Say what WAS there, so a miss in the log is diagnosable.
      const sample = await scout.evaluate(() =>
        Array.from(document.querySelectorAll("a[href]"), (a) => a.getAttribute("href"))
          .filter((h): h is string => !!h)
          .slice(0, 8),
      );
      console.log(`      ${from} rendered ${sample.length} link(s): ${sample.join(" ")}`);
      return null;
    };

    const routes = [
      "/",
      "/collections",
      "/methodology",
      "/about",
      "/contact",
      "/calendar",
      "/play",
      "/watched",
    ];
    for (const [from, prefix] of [
      ["/collections", "/best/"],
      ["/", "/movie/"],
      ["/", "/tv/"],
    ] as const) {
      const href = await firstHref(from, prefix);
      if (href) routes.push(href);
      else skipped.push(`no ${prefix}* link found on ${from}, that route was not checked`);
    }
    // Person pages hang off detail-page credits, so the crawl goes one hop
    // deeper: home -> a movie -> a person.
    const movieHref = routes.find((r) => r.startsWith("/movie/"));
    if (movieHref) {
      const personHref = await firstHref(movieHref, "/person/");
      if (personHref) routes.push(personHref);
      else skipped.push(`no /person/* link found on ${movieHref}, that route was not checked`);
    } else {
      skipped.push("no movie page reached, so no /person/* route was checked");
    }
    await scout.close();

    console.log(`Checking ${routes.length} routes at ${WIDTHS.length} widths\n`);

    for (const route of routes) {
      checkedRoutes++;
      for (const { w, h, label } of WIDTHS) {
        const page = await browser.newPage({
          viewport: { width: w, height: h },
          deviceScaleFactor: 1,
        });
        try {
          await page.goto(`${url}${route}`, { waitUntil: "load", timeout: 60_000 });
          await page.evaluate(() => document.fonts.ready).catch(() => {});
          await page.waitForTimeout(2500);

          const slug = route === "/" ? "home" : route.replace(/^\//, "").replace(/\//g, "-");
          await page.screenshot({ path: `${OUT_DIR}/${slug}-${label}.png`, fullPage: true });

          // A page with zero internal links did not actually render (an error
          // page or an empty shell has no nav). Without this, a broken page
          // passes the overflow check by being blank, which is a false green.
          const internalLinks = await page.evaluate(
            () => document.querySelectorAll('a[href^="/"]').length,
          );
          if (internalLinks === 0) {
            const msg = `FAIL  ${route} @ ${label}px  rendered with no internal links, treating as a render failure`;
            failures.push(msg);
            console.log(msg);
            continue;
          }

          const m = (await page.evaluate(measure)) as Measurement;
          if (m.overflow > SLACK_PX) {
            const lines = [
              `FAIL  ${route} @ ${label}px  document is ${m.overflow}px wider than the viewport`,
            ];
            for (const o of m.offenders) {
              lines.push(
                `        ${o.selector}  right=${o.right}px (viewport ${m.viewport})  ${o.text ? `"${o.text}"` : ""}`,
              );
            }
            if (m.offenders.length === 0) {
              lines.push(`        no single element found, suspect a margin or a transform`);
            }
            const msg = lines.join("\n");
            failures.push(msg);
            console.log(msg);
          } else {
            console.log(`ok    ${route} @ ${label}px`);
          }
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
    stop();
  }

  console.log("");
  for (const s of skipped) console.log(`skip  ${s}`);
  console.log(`\nScreenshots in ${OUT_DIR}/`);

  if (failures.length > 0) {
    console.log(`\n${failures.length} layout failure(s). Screenshots show the rendered page.`);
    process.exit(1);
  }

  // State coverage, never a bare pass. A green run that quietly checked five
  // routes instead of eight reads as "everything is fine" and is not.
  const planned = checkedRoutes + skipped.length;
  console.log(
    `\nNo page scrolls sideways. Checked ${checkedRoutes} of ${planned} routes at ${WIDTHS.length} widths.`,
  );
  if (skipped.length > 0) {
    console.log(
      `${skipped.length} route(s) skipped, so this run did NOT cover them. ` +
        `Catalog pages need a privileged database key: anon has no read grant on the media table, ` +
        `so without APP_SUPABASE_SERVICE_ROLE_KEY the data-driven pages render empty and no detail links exist to follow.`,
    );
  }
}

await main();

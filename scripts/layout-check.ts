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

import { chromium, type Page } from "playwright";
import { mkdir, rm, writeFile } from "node:fs/promises";

/** What a search result and a share card read from a page, taken from the
 *  server-rendered HTML (not the hydrated DOM), so it is what a crawler gets. */
interface HeadTags {
  route: string;
  title: string | null;
  description: string | null;
  ogUrl: string | null;
  canonical: string | null;
  websiteBlocks: number;
}

function attr(html: string, re: RegExp): string | null {
  const m = re.exec(html);
  return m ? m[1].replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'") : null;
}

async function readHead(url: string, route: string): Promise<HeadTags> {
  const html = await (await fetch(url)).text();
  return {
    route,
    title: attr(html, /<title>([^<]*)<\/title>/),
    description: attr(html, /<meta name="description" content="([^"]*)"/),
    ogUrl: attr(html, /<meta property="og:url" content="([^"]*)"/),
    canonical: attr(html, /<link rel="canonical" href="([^"]*)"/),
    websiteBlocks: (html.match(/"@type":"WebSite"/g) ?? []).length,
  };
}

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

/**
 * Navigate, surviving the one interruption a cold dev server causes by design.
 *
 * On its first page load Vite discovers the dependencies it has not bundled
 * yet, bundles them, and force-reloads the page. A navigation in flight at that
 * moment is cancelled and Playwright reports net::ERR_ABORTED. That is not a
 * page failing to load, it is the server settling, so it is retried; every
 * other error is real and is thrown. From 24 Sep this race was lost on every
 * CI run, killing the check on its first navigation before it measured a page.
 */
async function gotoSettled(page: Page, target: string): Promise<void> {
  const ATTEMPTS = 3;
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(target, { waitUntil: "load", timeout: 60_000 });
      return;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (attempt >= ATTEMPTS || !message.includes("ERR_ABORTED")) throw e;
      console.log(`      ${target}: navigation cancelled by a dev-server reload, retrying`);
      await page.waitForTimeout(2_000);
    }
  }
}

/**
 * Screens that only exist after a tap, which a page load never shows: the
 * phone menu open, and a signed-out save on a title page with its toast, then
 * where the toast's View button leads. Viewport-sized, named `state-*`. These
 * are pictures for a reviewer, not assertions: a step that cannot run (no
 * catalog key, so the title page is a not-found) is logged and skipped.
 */
async function captureStates(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  url: string,
): Promise<void> {
  console.log("\nCapturing tapped states\n");
  for (const { w, h, label } of [WIDTHS[0], WIDTHS[2]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    try {
      // The menu button exists below 1024px only.
      if (w < 1024) {
        await gotoSettled(page, `${url}/`);
        await page.waitForTimeout(2500);
        await page.getByRole("button", { name: "Menu" }).click();
        await page.waitForTimeout(600);
        await page.screenshot({ path: `${OUT_DIR}/state-menu-open-${label}.png` });
        console.log(`ok    menu open @ ${label}px`);
      }

      await gotoSettled(page, `${url}/movie/inception-27205`);
      await page.waitForTimeout(2500);
      const save = page.getByRole("button", { name: "Watchlist", exact: true });
      if ((await save.count()) === 0) {
        console.log(`skip  title-page save @ ${label}px: no Watchlist button rendered`);
        continue;
      }
      await save.first().click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT_DIR}/state-title-saved-${label}.png` });
      console.log(`ok    title-page save toast @ ${label}px`);

      const view = page.getByRole("button", { name: "View", exact: true });
      if ((await view.count()) === 0) {
        console.log(`skip  toast View @ ${label}px: no View button in the toast`);
        continue;
      }
      await view.first().click();
      await page.waitForURL(/\/lists$/, { timeout: 10_000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT_DIR}/state-title-saved-view-${label}.png` });
      console.log(`ok    toast View opens /lists @ ${label}px`);
    } catch (e) {
      const message = e instanceof Error ? e.message.split("\n")[0] : String(e);
      console.log(`skip  tapped states @ ${label}px: ${message}`);
    } finally {
      await page.close();
    }
  }
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
  const heads: HeadTags[] = [];
  let checkedRoutes = 0;

  try {
    // Fixed, real pages, so two runs screenshot the same thing and a change
    // can be compared before and after. "The first link found" changed from
    // run to run. Detail URLs are written in their canonical form (slug then
    // TMDB id) because the bare id answers with a redirect. Person pages are
    // canonical at the bare id.
    const routes = [
      "/",
      "/collections",
      "/methodology",
      "/about",
      "/contact",
      "/calendar",
      "/play",
      "/watched",
      "/movie/inception-27205",
      "/tv/breaking-bad-1396",
      // A title with no poster swatch (the paper band) and a long name on the
      // red band, the two worst real rows for the title-page hero.
      "/movie/x-760104",
      "/movie/doctor-strange-in-the-multiverse-of-madness-453395",
      "/person/31",
      "/best/best-action-movies-on-netflix",
      "/best/best-yuma-uchida-shows",
      "/lists",
      "/play/balasaurdle",
      "/taste",
      "/library",
      "/night",
      "/privacy",
      "/terms",
      // An invite link to a room this browser is not in, and the two pages
      // every mistyped one-segment address lands on.
      "/night/ZZZZZ",
      "/no-such-page",
      "/@nobody-here",
    ];

    console.log(`Checking ${routes.length} routes at ${WIDTHS.length} widths\n`);

    for (const route of routes) {
      checkedRoutes++;
      for (const { w, h, label } of WIDTHS) {
        const page = await browser.newPage({
          viewport: { width: w, height: h },
          deviceScaleFactor: 1,
        });
        try {
          await gotoSettled(page, `${url}${route}`);
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
    await captureStates(browser, url);
    // Head tags, read after every screenshot so these requests cannot change
    // when the cold dev server settles under the browser. Recorded, never
    // asserted: a failed read is noted in the log and the check carries on.
    // The four extra game pages share /play/balasaurdle's board, so they are
    // read here but not screenshotted.
    const headRoutes = [
      ...routes,
      "/play/emoji",
      "/play/quote-match",
      "/play/taglines",
      "/play/timeline",
    ];
    for (const route of headRoutes) {
      try {
        heads.push(await readHead(`${url}${route}`, route));
      } catch (e) {
        console.log(`      ${route}: could not read head tags (${String(e)})`);
      }
    }

    // llms.txt is plain text, so its first lines stand in for head tags.
    try {
      const llms = await (await fetch(`${url}/llms.txt`)).text();
      await writeFile(`${OUT_DIR}/llms.txt`, llms);
    } catch (e) {
      console.log(`      /llms.txt: could not read (${String(e)})`);
    }
  } finally {
    await browser.close();
    stop();
    await writeFile(`${OUT_DIR}/heads.json`, JSON.stringify(heads, null, 2) + "\n");
  }

  console.log(`\nScreenshots, heads.json and llms.txt in ${OUT_DIR}/`);

  if (failures.length > 0) {
    console.log(`\n${failures.length} layout failure(s). Screenshots show the rendered page.`);
    process.exit(1);
  }

  // State coverage, never a bare pass. Catalog pages need a privileged
  // database key: anon has no read grant on the media table, so without it
  // the title, person and list pages render their not-found state and pass
  // the overflow check by being nearly empty.
  console.log(
    `\nNo page scrolls sideways. Checked ${checkedRoutes} routes at ${WIDTHS.length} widths.`,
  );
  if (!process.env.APP_SUPABASE_SERVICE_ROLE_KEY) {
    console.log(
      "APP_SUPABASE_SERVICE_ROLE_KEY is not set, so the catalog pages rendered without data " +
        "and this run did NOT check them with real rows.",
    );
  }
}

await main();

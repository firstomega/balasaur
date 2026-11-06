import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useMatches,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import archivoFontUrl from "../fonts/archivo-latin-var.woff2?url";
import displayFontUrl from "../fonts/archivo-condensed-800-latin.woff2?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "@/hooks/useAuth";
import { Footer } from "@/components/balasaur/Footer";
import { TopBar } from "@/components/balasaur/TopBar";
import { CookieBanner } from "@/components/balasaur/CookieBanner";
import { AnalyticsManager } from "@/components/balasaur/AnalyticsManager";
import { Toaster } from "@/components/ui/sonner";
import { NotFoundPage } from "@/components/balasaur/NotFoundPage";
import { DinoRun } from "@/components/balasaur/DinoRun";
import {
  SITE_ORIGIN,
  SITE_NAME,
  SITE_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  jsonLdScript,
} from "@/lib/seo";

// The top bar belongs to the shell, not to each page. One route refuses it:
// /watched is a full-viewport rating deck that draws its own header with an
// Exit control, and a second nav row above it would put two ways out on the
// same screen. A route that supplies its own header says so here rather than
// the shell keeping a list of paths. The footer is not affected: it carries
// the TMDB and OMDb attribution, which every page owes.
declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    ownsHeader?: boolean;
  }
}

// An address deeper than one segment with nothing behind it. One-segment
// addresses reach the same page through the /$handle catch-all.
function NotFoundComponent() {
  return <NotFoundPage title="Page not found" />;
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <main id="main" className="mx-auto w-full max-w-content px-4 pb-16 pt-10 md:pt-16">
      <h1 className="font-display text-4xl font-extrabold leading-none tracking-tight text-text-bright">
        This page did not load
      </h1>
      {/* Raw error.message is intentionally not rendered: it can leak DB
          schema, API paths, or env var names. The full error is logged
          server-side via console.error and reportLovableError above. */}
      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="inline-flex cursor-pointer items-center rounded-full bg-text-bright px-4 py-2 text-base font-bold text-background hover:opacity-90"
        >
          Try again
        </button>
        <a
          href="/"
          className="inline-flex items-center rounded-full border-2 border-text-bright px-4 py-1.5 text-base font-bold text-text-bright hover:bg-text-bright hover:text-background"
        >
          Home
        </a>
      </div>
    </main>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      // The page ground is white. Without these the browser chrome on phones
      // and the form controls default to the system theme, which on a dark
      // phone puts a black address bar and dark inputs on a white page.
      { name: "theme-color", content: "white" },
      { name: "color-scheme", content: "light" },
      { title: "Balasaur" },
      {
        name: "description",
        content: SITE_DESCRIPTION,
      },
      { name: "author", content: "Balasaur" },
      { property: "og:title", content: "Balasaur" },
      {
        property: "og:description",
        content: SITE_DESCRIPTION,
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Balasaur" },
      {
        name: "twitter:description",
        content: SITE_DESCRIPTION,
      },
      { property: "og:image", content: DEFAULT_OG_IMAGE },
      { name: "twitter:image", content: DEFAULT_OG_IMAGE },
      { property: "og:site_name", content: SITE_NAME },
    ],
    scripts: [
      jsonLdScript({
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        url: SITE_ORIGIN,
      }),
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      // Brand mark in the tab and on home screens. Served from public/ so the
      // URLs are stable.
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      // Every poster/backdrop loads from TMDB's CDN — warming the connection
      // before the first <img> shaves the LCP handshake.
      { rel: "preconnect", href: "https://image.tmdb.org" },
      // Fonts are self-hosted (see styles.css). Preloading them here means the
      // real face is usually in place for first paint, so there is no swap and
      // no layout shift from it. Two preloads, not three: the body face and
      // the display face set the text that paints first. There is no third
      // face: numbers are set in the body face with tabular figures.
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: archivoFontUrl,
        crossOrigin: "anonymous",
      },
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: displayFontUrl,
        crossOrigin: "anonymous",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {/* Keyboard and screen-reader users skip the nav instead of tabbing
            through it on every page. Visible only when focused. */}
        <a
          href="#main"
          className="sr-only z-50 rounded-[5px] bg-primary px-3 py-2 text-[14px] font-bold tracking-[-0.01em] text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        >
          Skip to content
        </a>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const ownsHeader = useMatches({
    select: (matches) => matches.some((m) => m.staticData.ownsHeader === true),
  });

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AnalyticsManager />
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <div className="flex min-h-screen flex-col">
          {!ownsHeader && <TopBar />}
          <div className="flex-1">
            <Outlet />
          </div>
          <Footer />
        </div>
        <CookieBanner />
        <Toaster position="bottom-center" />
        {/* Renders null until someone types rawr. See DinoRun. */}
        <DinoRun />
      </AuthProvider>
    </QueryClientProvider>
  );
}

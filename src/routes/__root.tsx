import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "@/hooks/useAuth";
import { Footer } from "@/components/balasaur/Footer";
import { CookieBanner } from "@/components/balasaur/CookieBanner";
import { AnalyticsManager } from "@/components/balasaur/AnalyticsManager";
import { DinoMark } from "@/components/balasaur/DinoMark";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-[5px] border border-border bg-panel p-8 text-center">
        <DinoMark className="mx-auto h-10 w-10 text-primary" />
        <div className="mt-5 font-mono text-[64px] font-semibold leading-none tracking-tighter text-text-bright">
          404
        </div>
        <p className="mt-3 font-mono text-[10.5px] uppercase tracking-[0.18em] text-text-dim">
          Signal lost · route not found
        </p>
        <p className="mt-4 text-[13.5px] leading-relaxed text-text-muted">
          This title isn't in our database. The page you tried doesn't exist or moved.
        </p>
        <div className="mt-6 flex justify-center">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-[5px] border border-primary bg-primary px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Back to grid
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-[5px] border border-border bg-panel p-8 text-center">
        <DinoMark className="mx-auto h-10 w-10 text-primary" />
        <p className="mt-5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-text-dim">
          Process halted · error caught
        </p>
        <h1 className="mt-2 text-[20px] font-semibold tracking-tight text-text-bright">
          This page didn't load
        </h1>
        <p className="mt-3 text-[13.5px] leading-relaxed text-text-muted">
          Something went wrong on our end. You can try again or head back home.
        </p>
        {error?.message && (
          <pre className="mt-4 max-h-32 overflow-auto rounded-[4px] border border-border bg-background px-3 py-2 text-left font-mono text-[10.5px] text-text-dim">
            {error.message}
          </pre>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex cursor-pointer items-center justify-center rounded-[5px] border border-primary bg-primary px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-[5px] border border-border-strong bg-background px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-text-bright transition-colors hover:border-primary hover:text-primary"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Balasaur" },
      { name: "description", content: "Your personal entertainment database. Discover, track, and rate movies and TV all in one place." },
      { name: "author", content: "Balasaur" },
      { property: "og:title", content: "Balasaur" },
      { property: "og:description", content: "Your personal entertainment database. Discover, track, and rate movies and TV all in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Balasaur" },
      { name: "twitter:description", content: "Your personal entertainment database. Discover, track, and rate movies and TV all in one place." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/9ee233a8-7a22-41f0-ac0e-85e583add70d/id-preview-7121fac2--60ec2541-7775-4350-a822-2caaf26ce83a.lovable.app-1780089925441.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/9ee233a8-7a22-41f0-ac0e-85e583add70d/id-preview-7121fac2--60ec2541-7775-4350-a822-2caaf26ce83a.lovable.app-1780089925441.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap",
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
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AnalyticsManager />
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <div className="flex min-h-screen flex-col">
          <div className="flex-1">
            <Outlet />
          </div>
          <Footer />
        </div>
        <CookieBanner />
      </AuthProvider>
    </QueryClientProvider>
  );
}

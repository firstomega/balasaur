import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

/**
 * The page for an address with nothing behind it: a plain label, at most one
 * fact about what was looked up, and the way back. Every unknown one-segment
 * address (/foo, /@nobody) lands here through the /$handle catch-all, so a
 * mistyped link meets the same heading the rest of the site uses.
 */
export function NotFoundPage({ title, line }: { title: string; line?: ReactNode }) {
  return (
    <main id="main" className="mx-auto w-full max-w-grid px-4 pb-16 pt-10 md:pt-16">
      <h1 className="font-display text-4xl font-extrabold leading-none tracking-tight text-text-bright">
        {title}
      </h1>
      {line && <p className="mt-3 max-w-prose text-lg text-text-muted">{line}</p>}
      <Link
        to="/"
        className="mt-6 inline-flex items-center rounded-full bg-text-bright px-4 py-2 text-base font-bold text-background hover:opacity-90"
      >
        Home
      </Link>
    </main>
  );
}

import type { ReactNode } from "react";

// The one layout for the pages that are read top to bottom: about,
// methodology, contact, privacy and terms. Before this each of the five set
// its own heading sizes and padding, and the text ran about 105 characters a
// line across the 760px article column. Here the column is 28rem of 15px text
// on a phone and 32rem of 18px text from tablet up, which keeps a line near 65
// characters at both, and the headings are in the condensed display face like
// every other page.

/** Class for a link inside running text. */
export const READING_LINK = "font-semibold text-text-bright underline underline-offset-2";

export function ReadingPage({
  title,
  dek,
  children,
}: {
  title: ReactNode;
  /** One line under the title: the page's subject, or a legal page's date. */
  dek?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main
      id="main"
      className="mx-auto box-content max-w-md px-4 pb-16 pt-10 text-lg leading-relaxed text-text md:max-w-lg md:pt-16 md:text-xl md:leading-relaxed"
    >
      <header className="mb-10 md:mb-14">
        <h1 className="text-balance font-display text-4xl font-extrabold leading-none tracking-tight text-text-bright">
          {title}
        </h1>
        {dek && <div className="mt-3 text-text-muted">{dek}</div>}
      </header>
      <div className="space-y-10 md:space-y-12">{children}</div>
    </main>
  );
}

export function ReadingSection({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-2xl font-extrabold leading-none tracking-tight text-text-bright md:text-3xl">
        {title}
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

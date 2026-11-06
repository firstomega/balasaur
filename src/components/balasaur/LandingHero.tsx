import { SITE_PROOF, SITE_TAGLINE } from "@/lib/seo";

interface Props {
  onBrowse: () => void;
}

// The signed-out hero: the site's one tagline, its proof line, one button.
// Both sentences live in src/lib/seo.ts and are the same ones the footer, the
// share card and the meta description carry, so the hero has no copy of its
// own. No catalog count here: the grid's own counter is on this page, and a
// second figure would contradict it.
//
// Dropped from the Colour Shelf prototype on purpose: the tier legend and the
// score "anatomy" card. Both explained how the number is assembled; the score
// stickers on the tiles and cards below show the scale instead.
//
// "one number" is marked on a gold swatch with its ink: it is the phrase the
// stickers on every tile below make good on. If the tagline ever drops those
// words, the mark disappears and the heading reads the same.
const MARK = "one number";

function Tagline() {
  const at = SITE_TAGLINE.lastIndexOf(MARK);
  if (at < 0) return <>{SITE_TAGLINE}.</>;
  return (
    <>
      {SITE_TAGLINE.slice(0, at)}
      <mark className="rounded-lg bg-swatch-gold px-1.5 text-swatch-gold-ink box-decoration-clone">
        {MARK}
      </mark>
      {SITE_TAGLINE.slice(at + MARK.length)}.
    </>
  );
}

export function LandingHero({ onBrowse }: Props) {
  return (
    <section aria-labelledby="home-h1" className="pb-6 pt-2 md:pb-10 md:pt-6">
      <h1
        id="home-h1"
        className="max-w-4xl text-balance font-display text-4xl font-extrabold leading-[0.95] tracking-tight text-text-bright md:text-[64px]"
      >
        <Tagline />
      </h1>
      <p className="mt-3 max-w-xl text-lg text-text-muted md:mt-4 md:text-xl">{SITE_PROOF}</p>
      <button
        type="button"
        onClick={onBrowse}
        className="mt-4 cursor-pointer rounded-full bg-primary px-5 py-2.5 text-base font-bold text-primary-foreground transition-colors hover:bg-primary/85 md:mt-5"
      >
        Browse the catalog
      </button>
    </section>
  );
}

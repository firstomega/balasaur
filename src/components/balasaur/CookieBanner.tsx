import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { getConsent, setConsent } from "@/lib/consent";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // Client-only by design: the choice lives in localStorage, and the server
  // renders the same HTML for every visitor. The bar mounts in the first
  // effect after hydration, so its buttons are live React handlers from the
  // first frame they exist; there is no pre-hydration window where a tap
  // lands on dead markup.
  useEffect(() => {
    if (getConsent() === null) setVisible(true);
    const open = () => setVisible(true);
    window.addEventListener("balasaur:open-cookie-settings", open);
    return () => window.removeEventListener("balasaur:open-cookie-settings", open);
  }, []);

  // The bar is the last element in the document flow and sticks to the
  // bottom of the window until the page is scrolled to its end, where it
  // settles below the footer. Being in flow, it reserves its own height:
  // nothing on the page can sit underneath it, at any width, and a full-page
  // capture shows it at the end of the page rather than over a game board.
  // Its measured height is still published as --consent-h so a board that
  // pins its own controls to the window bottom can sit above it.
  useEffect(() => {
    const root = document.documentElement;
    const bar = barRef.current;
    if (!bar) {
      root.style.setProperty("--consent-h", "0px");
      return;
    }
    const publish = () => root.style.setProperty("--consent-h", `${bar.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.setProperty("--consent-h", "0px");
    };
  }, [visible]);

  if (!visible) return null;

  const choose = (choice: "all" | "required") => {
    setConsent(choice);
    setVisible(false);
  };

  return (
    <div
      ref={barRef}
      role="dialog"
      aria-label="Cookie consent"
      className="sticky bottom-0 z-50 border-t border-border bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-panel/85"
    >
      {/* Every line and every pixel of padding here is taken off the first
          screen of the page behind it. Three lines of copy left the primary
          action on a 390px phone showing as a 10px sliver above the bar, and
          at two rows of padding the bar covered a game board's bottom row.
          On a phone the copy and the two buttons share one tight band. */}
      <div className="mx-auto flex max-w-[1600px] flex-row flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3 py-1.5 md:px-4 md:py-2">
        <p className="min-w-0 flex-1 font-mono text-[11.5px] leading-snug text-text-muted md:text-[12px]">
          Cookies keep you signed in. With consent they also count page visits.{" "}
          <Link to="/privacy" className="text-text-bright underline-offset-2 hover:underline">
            Learn more
          </Link>
          .
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {/* The two choices are deliberately identical in weight, size and
              position. Refusing has to be exactly as easy as accepting: that
              is the requirement regulators actually enforce, and a filled
              button next to an outline one is the nudge they name. It is also
              what fails certification with the consent platform this banner
              will hand over to when ads go live, so a thumb on the scale here
              would cost the ad revenue it was meant to protect. */}
          <button
            type="button"
            onClick={() => choose("required")}
            className="rounded-[5px] border border-border-strong bg-background px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide text-text-bright hover:border-primary hover:text-primary md:px-3 md:py-1.5 md:text-[12px]"
          >
            Required only
          </button>
          <button
            type="button"
            onClick={() => choose("all")}
            className="rounded-[5px] border border-border-strong bg-background px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide text-text-bright hover:border-primary hover:text-primary md:px-3 md:py-1.5 md:text-[12px]"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}

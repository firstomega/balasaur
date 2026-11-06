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

  // Both choices are the same outlined pill, the one the header uses for Rate.
  // Refusing has to be exactly as easy as accepting: that is the requirement
  // regulators actually enforce, and a filled button next to an outlined one
  // is the nudge they name. It is also what fails certification with the
  // consent platform this banner will hand over to when ads go live.
  const choice =
    "cursor-pointer whitespace-nowrap rounded-full border-2 border-text-bright bg-background px-3 py-1 text-base font-bold text-text-bright transition-colors duration-fast hover:bg-text-bright hover:text-background";

  return (
    <div
      ref={barRef}
      role="dialog"
      aria-label="Cookie consent"
      className="sticky bottom-0 z-50 border-t-2 border-text-bright bg-background pb-[env(safe-area-inset-bottom)]"
    >
      {/* Every line and every pixel of padding here is taken off the first
          screen of the page behind it, so on a phone the copy and the two
          buttons share one tight band. Solid white, not frosted glass: a
          translucent bar was the last grey surface on the site, and headless
          capture drew it as an empty strip under the footer. */}
      <div className="mx-auto flex max-w-content flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2">
        <p className="min-w-0 flex-1 text-base leading-snug text-text-bright">
          Cookies keep you signed in. With consent they also count page visits.{" "}
          <Link to="/privacy" className="font-semibold underline underline-offset-2">
            Privacy policy
          </Link>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => choose("required")} className={choice}>
            Required only
          </button>
          <button type="button" onClick={() => choose("all")} className={choice}>
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}

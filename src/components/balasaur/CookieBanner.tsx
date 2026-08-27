import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { getConsent, setConsent } from "@/lib/consent";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (getConsent() === null) setVisible(true);
    const open = () => setVisible(true);
    window.addEventListener("balasaur:open-cookie-settings", open);
    return () => window.removeEventListener("balasaur:open-cookie-settings", open);
  }, []);

  // The bar is pinned to the bottom of the window, so anything in the last
  // band of the page sits underneath it. On a phone that was the entire
  // footer: About, Contact, Privacy, Terms and Cookie settings were all
  // untappable at the bottom of the scroll, including the Privacy page this
  // bar links to. Ending the document with the bar's own height means every
  // element can be scrolled clear of it. Measured rather than hardcoded
  // because the bar is one row on a desktop and two on a phone.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const reserve = () => {
      document.body.style.paddingBottom = `${bar.offsetHeight}px`;
    };
    reserve();
    const observer = new ResizeObserver(reserve);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      document.body.style.paddingBottom = "";
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
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-panel/95 backdrop-blur supports-[backdrop-filter]:bg-panel/85"
    >
      {/* Every line and every pixel of padding here is taken off the first
          screen of the page behind it. Three lines of copy left the primary
          action on a 390px phone showing as a 10px sliver above the bar. */}
      <div className="mx-auto flex max-w-[1600px] flex-col gap-2 px-4 py-2 md:flex-row md:items-center md:justify-between">
        <p className="font-mono text-[12px] leading-snug text-text-muted">
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
            className="rounded-[5px] border border-border-strong bg-background px-3 py-1.5 font-mono text-[12px] uppercase tracking-wide text-text-bright hover:border-primary hover:text-primary"
          >
            Required only
          </button>
          <button
            type="button"
            onClick={() => choose("all")}
            className="rounded-[5px] border border-border-strong bg-background px-3 py-1.5 font-mono text-[12px] uppercase tracking-wide text-text-bright hover:border-primary hover:text-primary"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}

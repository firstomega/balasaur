import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { getConsent, setConsent } from "@/lib/consent";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (getConsent() === null) setVisible(true);
    const open = () => setVisible(true);
    window.addEventListener("balasaur:open-cookie-settings", open);
    return () => window.removeEventListener("balasaur:open-cookie-settings", open);
  }, []);

  if (!visible) return null;

  const choose = (choice: "all" | "required") => {
    setConsent(choice);
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-panel/95 backdrop-blur supports-[backdrop-filter]:bg-panel/85"
    >
      <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <p className="font-mono text-[12px] leading-relaxed text-text-muted">
          Cookies keep you signed in. With your consent they also measure which pages get used,
          which is how Balasaur gets better.{" "}
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

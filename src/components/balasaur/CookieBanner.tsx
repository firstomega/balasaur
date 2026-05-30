import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { getConsent, setConsent } from "@/lib/consent";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (getConsent() === null) setVisible(true);
    const open = () => setVisible(true);
    window.addEventListener("balasaur:open-cookie-settings", open);
    return () =>
      window.removeEventListener("balasaur:open-cookie-settings", open);
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
          We use cookies to keep you signed in and, with your consent, to
          measure usage and improve Balasaur.{" "}
          <Link to="/privacy" className="text-text-bright underline-offset-2 hover:underline">
            Learn more
          </Link>
          .
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => choose("required")}
            className="rounded-[5px] border border-border bg-background px-3 py-1.5 font-mono text-[12px] uppercase tracking-wide text-text-bright hover:border-border-strong"
          >
            Required only
          </button>
          <button
            type="button"
            onClick={() => choose("all")}
            className="rounded-[5px] bg-primary px-3 py-1.5 font-mono text-[12px] font-medium uppercase tracking-wide text-primary-foreground hover:bg-primary/90"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
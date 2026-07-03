import { Share2 } from "lucide-react";
import { toast } from "sonner";

/** Share the given URL (defaults to the current page) via the native share sheet on
 *  mobile, falling back to copying the link on desktop. Links unfurl as rich cards
 *  (poster/title via the og: meta tags), so every share is a mini-ad. */
export function ShareButton({
  title,
  url,
  label,
}: {
  title?: string;
  url?: string;
  label?: string;
}) {
  const share = async () => {
    const shareUrl = url ?? window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: title ?? document.title, url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied", { duration: 1600 });
    } catch (e) {
      // AbortError = user closed the share sheet; anything else, try the clipboard.
      if (e instanceof Error && e.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Link copied", { duration: 1600 });
      } catch {
        toast.error("Couldn't copy the link");
      }
    }
  };

  return (
    <button
      type="button"
      onClick={share}
      aria-label="Share"
      title="Share"
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-[5px] border border-border bg-panel px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-wider text-text-muted transition-colors hover:border-border-strong hover:text-text-bright"
    >
      <Share2 className="h-3.5 w-3.5" />
      {label ?? "Share"}
    </button>
  );
}

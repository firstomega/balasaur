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
      className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border-2 border-text-bright bg-background px-3 text-base font-bold text-text-bright transition-colors duration-fast hover:bg-text-bright hover:text-background"
    >
      <Share2 className="h-3.5 w-3.5" />
      {label ?? "Share"}
    </button>
  );
}

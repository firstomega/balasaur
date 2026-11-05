import { useCallback } from "react";
import { toast } from "sonner";
import type { QuickAction } from "@/components/balasaur/MediaCard";
import type { MediaItem } from "@/types/media";
import type { RecordStatusFn, StatusMap } from "@/hooks/useUserStatus";
import {
  isNotInterested,
  primaryOf,
  recordForNotInterested,
  recordForWant,
  recordForWatched,
} from "@/lib/userStatus";

/**
 * What the "more" menu's three entries do: Watchlist and Seen toggle, Hide
 * toggles with an undo. Saving works signed out; useUserStatus keeps the pick
 * locally and moves it into the account on sign-in. The toast names the entry
 * the visitor chose, in the menu's own words.
 */
export function useQuickAction(statuses: StatusMap, recordStatus: RecordStatusFn) {
  return useCallback(
    (item: MediaItem, action: QuickAction) => {
      const rec = statuses[item.id];
      if (action === "notInterested") {
        if (isNotInterested(rec)) {
          recordStatus(item.id, null);
          toast(`Restored · ${item.title}`, { duration: 1400 });
        } else {
          recordStatus(item.id, recordForNotInterested(), item);
          toast(`Hidden · ${item.title}`, {
            duration: 3500,
            action: { label: "Undo", onClick: () => recordStatus(item.id, null) },
          });
        }
        return;
      }
      const current = primaryOf(rec);
      if (current === action) {
        recordStatus(item.id, null);
        toast(`Removed · ${item.title}`, { duration: 1400 });
      } else if (action === "want") {
        recordStatus(item.id, recordForWant(), item);
        toast.success(`Watchlist · ${item.title}`, { duration: 1400 });
      } else {
        recordStatus(item.id, recordForWatched(rec), item);
        toast.success(`Seen · ${item.title}`, { duration: 1400 });
      }
    },
    [statuses, recordStatus],
  );
}

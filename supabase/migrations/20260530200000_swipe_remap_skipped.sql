-- Swipe redesign: positivity model (Like / Watched / Didn't-watch-yet / Skip).
-- Nothing is ever a hard reject; only Skip resurfaces. The old negative verdicts
-- (sentiment='disliked', intent='not_interested') retire.

-- 1. Migrate existing rows BEFORE tightening constraints.
--    Old "Seen, didn't love" (disliked) → plain Watched (drop the negativity).
UPDATE public.user_media_status
  SET sentiment = NULL, rewatch_ok = NULL
  WHERE sentiment = 'disliked';

--    Old "Not for me" (unseen + not_interested) → Skip (soft, resurfaces).
UPDATE public.user_media_status
  SET status = 'skipped', intent = NULL, sentiment = NULL, rewatch_ok = NULL
  WHERE status = 'unseen' AND intent = 'not_interested';

-- 2. Allow the new 'skipped' status; keep sentiment/intent value-checks but the
--    retired values are no longer written by the app.
ALTER TABLE public.user_media_status
  DROP CONSTRAINT IF EXISTS user_media_status_status_check;
ALTER TABLE public.user_media_status
  ADD CONSTRAINT user_media_status_status_check
  CHECK (status IN ('seen', 'unseen', 'skipped'));

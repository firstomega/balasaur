ALTER TABLE public.media
  ADD COLUMN IF NOT EXISTS award_winner boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS award_nominee boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS award_wins integer,
  ADD COLUMN IF NOT EXISTS award_nominations integer;
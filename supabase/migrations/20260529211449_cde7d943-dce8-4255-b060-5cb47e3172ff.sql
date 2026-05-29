
CREATE TABLE public.user_media_status (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL,
  media_type TEXT NOT NULL,
  title TEXT NOT NULL,
  poster_url TEXT,
  year TEXT,
  status TEXT NOT NULL CHECK (status IN ('seen','unseen')),
  sentiment TEXT CHECK (sentiment IN ('liked','disliked')),
  intent TEXT CHECK (intent IN ('want','not_interested')),
  rewatch_ok BOOLEAN,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, media_id)
);

CREATE INDEX idx_user_media_status_user ON public.user_media_status(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_media_status TO authenticated;
GRANT ALL ON public.user_media_status TO service_role;

ALTER TABLE public.user_media_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own status"
  ON public.user_media_status FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own status"
  ON public.user_media_status FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own status"
  ON public.user_media_status FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own status"
  ON public.user_media_status FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

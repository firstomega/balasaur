-- Search Console reported 19 "Not found (404)" URLs. Seventeen are the
-- retired genre-by-decade shelves (best-1990s-thriller and siblings) from an
-- earlier collections version that Google discovered before they were
-- removed; three more are old spellings of shelves that still exist. A
-- retired slug redirects permanently (the route already consults this
-- table) instead of 404ing, so the crawl budget Google spent on them lands
-- on the shelf that replaced them. Applied to the live project first; this
-- file is the record.
insert into collection_redirects (from_slug, to_slug) values
  ('best-1950s-drama', 'best-drama-movies'),
  ('best-2020s-drama', 'best-drama-movies'),
  ('best-2020s-horror', 'best-horror-movies'),
  ('best-1970s-horror', 'best-horror-movies'),
  ('best-1960s-mystery', 'best-mystery-movies'),
  ('best-1980s-crime', 'best-crime-movies'),
  ('best-2010s-crime', 'best-crime-movies'),
  ('best-2020s-crime', 'best-crime-movies'),
  ('best-1990s-thriller', 'best-thriller-movies'),
  ('best-1980s-thriller', 'best-thriller-movies'),
  ('best-2010s-thriller', 'best-thriller-movies'),
  ('best-2020s-thriller', 'best-thriller-movies'),
  ('best-1990s-comedy', 'best-comedy-movies'),
  ('best-1980s-animation', 'best-animation-movies'),
  ('best-1960s-science-fiction', 'best-science-fiction-movies'),
  ('best-2020s-romance', 'best-romance-movies'),
  ('best-2010s-romance', 'best-romance-movies'),
  ('best-1990s-action', 'best-action-movies'),
  ('best-war', 'best-war-movies'),
  ('best-british-dramas', 'best-british-drama-movies'),
  ('best-family-on-netflix', 'best-family-movies-on-netflix')
on conflict (from_slug) do nothing;

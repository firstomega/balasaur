-- Collections eligibility now excludes the whole fan-service tier, not just
-- hard-adult. `suggestive` is a superset of `sensitive`, so one filter covers
-- both. Applied live on 2026-08-18 as a targeted rewrite of
-- rebuild_collections' single eligibility gate (verified: exactly one gate,
-- now `where suggestive = false`), followed by a rebuild_collections() run so
-- every published list reflects the new gate immediately.
do $$
declare
  def text;
  n int;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'rebuild_collections';

  n := (length(def) - length(replace(def, 'where sensitive = false', ''))) / length('where sensitive = false');
  if n <> 1 then
    raise exception 'expected exactly 1 eligibility gate, found %', n;
  end if;

  def := replace(def, 'where sensitive = false', 'where suggestive = false');
  execute def;
end $$;

select public.rebuild_collections();

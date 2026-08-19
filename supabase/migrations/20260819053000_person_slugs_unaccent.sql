-- Person slugs transliterate diacritics: best-bill-skarsgard-movies, not
-- best-bill-skarsg-rd-movies. Only the person block changes; every other
-- slug source is plain ASCII. Applied live 2026-08-19 and followed by a
-- rebuild; verified zero mangled person slugs remained. The live function
-- body hash after this change (comment-stripped md5 of prosrc):
-- 370f8a981aae2ef13e73f1b1371488bf.
create extension if not exists unaccent;

do $$
declare
  def text;
  n int;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'rebuild_collections';

  n := (length(def) - length(replace(def, 'slugify(x.name)', ''))) / length('slugify(x.name)');
  if n <> 2 then
    raise exception 'expected exactly 2 person-slug sites, found %', n;
  end if;

  def := replace(def, 'slugify(x.name)', 'slugify(unaccent(x.name))');
  execute def;
end $$;

select public.rebuild_collections();

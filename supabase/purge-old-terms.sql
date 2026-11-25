-- Clear program records from terms older than the ones you keep (default: the current term and the 3 before it,
-- the same 4 terms the Email list covers).  Run once a term, in Supabase > SQL Editor.
--
-- 1. Set the current term and how many terms to keep on the two lines marked  <-- CHANGE THIS
-- 2. Run it as is.  It only COUNTS what it would delete (see the "Messages"/Results tab).
-- 3. If the numbers look right, change  v_dry_run  to false and run it again.
--
-- Deleted:  mentorship pairings, mentor/mentee profiles, resume requests (with their comments),
--           mock-interview sign-ups (with their feedback), the ratings attached to those, and the
--           discount-code request log (names and emails) for those terms.
-- Kept:     members and their memberships, attendance, the directory, and payment records.
--           (Payment records have their own rules: see delete-member.sql.)

create or replace function pg_temp.term_order(t text) returns int language sql immutable as $$
  select case when t ~ '^(winter|spring|fall)-[0-9]{4}$'
    then split_part(t, '-', 2)::int * 3 + case split_part(t, '-', 1) when 'winter' then 0 when 'spring' then 1 else 2 end
  end
$$;

do $$
declare
  v_current text    := 'fall-2026';   -- <-- CHANGE THIS  (the current term, like fall-2026)
  v_keep    int     := 4;             -- <-- CHANGE THIS  (how many terms to keep, counting the current one)
  v_dry_run boolean := true;          -- true = only count; false = really delete
  v_cut     int;
  n_pairs int; n_prof int; n_res int; n_com int; n_mock int; n_rate int; n_code int;
begin
  if pg_temp.term_order(v_current) is null then raise exception 'v_current must look like fall-2026'; end if;
  v_cut := pg_temp.term_order(v_current) - v_keep + 1;      -- terms with a smaller number than this are old

  create temp table old_res  on commit drop as select id from public.docs
    where collection = 'resumeRequests'    and pg_temp.term_order(data ->> 'termId') < v_cut;
  create temp table old_mock on commit drop as select id from public.docs
    where collection = 'mockRegistrations' and pg_temp.term_order(data ->> 'termId') < v_cut;

  select count(*) into n_com  from public.docs where collection like 'resumeRequests/%/comments'
    and split_part(collection, '/', 2) in (select id from old_res);
  select count(*) into n_rate from public.docs where collection = 'ratings'
    and ((id like 'resume\_%' and substr(id, 8) in (select id from old_res))
      or (id like 'mock\_%'   and substr(id, 6) in (select id from old_mock)));
  select count(*) into n_pairs from public.docs where collection = 'pairings'      and pg_temp.term_order(data ->> 'termId') < v_cut;
  select count(*) into n_prof  from public.docs where collection = 'mentorProfiles' and pg_temp.term_order(data ->> 'termId') < v_cut;
  select count(*) into n_code from public.docs where collection = 'codeRequests' and pg_temp.term_order(data ->> 'termId') < v_cut;
  select count(*) into n_res from old_res;  select count(*) into n_mock from old_mock;

  raise notice 'Keeping % and newer.  Would delete: % pairings, % mentorship profiles, % resume requests (+% comments), % mock sign-ups, % ratings, % discount-code requests.',
    (select case v_cut % 3 when 0 then 'winter' when 1 then 'spring' else 'fall' end || '-' || (v_cut / 3)),
    n_pairs, n_prof, n_res, n_com, n_mock, n_rate, n_code;

  if not v_dry_run then
    delete from public.docs where collection like 'resumeRequests/%/comments' and split_part(collection, '/', 2) in (select id from old_res);
    delete from public.docs where collection = 'ratings'
      and ((id like 'resume\_%' and substr(id, 8) in (select id from old_res)) or (id like 'mock\_%' and substr(id, 6) in (select id from old_mock)));
    delete from public.docs where collection = 'resumeRequests'    and id in (select id from old_res);
    delete from public.docs where collection = 'mockRegistrations' and id in (select id from old_mock);
    delete from public.docs where collection = 'pairings'          and pg_temp.term_order(data ->> 'termId') < v_cut;
    delete from public.docs where collection = 'mentorProfiles'    and pg_temp.term_order(data ->> 'termId') < v_cut;
    delete from public.docs where collection = 'codeRequests' and pg_temp.term_order(data ->> 'termId') < v_cut;
    raise notice 'Done.';
  else
    raise notice 'Dry run: nothing was deleted. Set v_dry_run to false to delete.';
  end if;
end $$;

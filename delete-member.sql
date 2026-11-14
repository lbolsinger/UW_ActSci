-- Delete one person's data and login.  (Account deletion requests: see SUPABASE_SETUP.md, "Deleting someone's data".)
--
-- 1. Type the person's email on the line marked  <-- CHANGE THIS
-- 2. Run it in Supabase > SQL Editor.
--
-- Payment records (WUSA numbers and who verified them) are KEPT on purpose: check the university's and
-- the student federation's rules about how long payment records must be kept. To delete them too, remove
-- the "and collection <> 'payments'" part of the third delete below.
do $$
declare
  v_email text := 'student@uwaterloo.ca';   -- <-- CHANGE THIS
  v_uid   text;
begin
  select id::text into v_uid from auth.users where lower(email) = lower(v_email);
  if v_uid is null then raise exception 'No account found for %', v_email; end if;

  -- comments left on their resume requests, and ratings they gave
  delete from public.docs where collection like 'resumeRequests/%/comments'
    and split_part(collection, '/', 2) in
        (select id from public.docs where collection = 'resumeRequests' and data ->> 'uid' = v_uid);
  delete from public.docs where collection = 'ratings' and (
       (id like 'resume\_%' and substr(id, 8) in (select id from public.docs where collection = 'resumeRequests'    and data ->> 'uid' = v_uid))
    or (id like 'mock\_%'   and substr(id, 6) in (select id from public.docs where collection = 'mockRegistrations' and data ->> 'uid' = v_uid)));

  -- mentorship pairings, then fix every mentor's mentee count
  delete from public.docs where collection = 'pairings' and (data ->> 'mentorUid' = v_uid or data ->> 'menteeUid' = v_uid);

  -- everything else with their id on it: membership, attendance, directory, resume requests, mentor profile...
  delete from public.docs where data ->> 'uid' = v_uid and collection <> 'payments';
  delete from public.docs where collection in ('users', 'directory', 'deletionRequests') and id = v_uid;

  update public.docs m
     set data = jsonb_set(m.data, '{menteeCount}', to_jsonb((
           select count(*) from public.docs p
            where p.collection = 'pairings' and p.data ->> 'mentorUid' = m.data ->> 'uid' and p.data ->> 'termId' = m.data ->> 'termId')))
   where m.collection = 'mentorProfiles';

  delete from auth.users where id::text = v_uid;   -- removes their login
  raise notice 'Deleted data and login for %', v_email;
end $$;

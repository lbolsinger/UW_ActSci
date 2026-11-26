-- ============================================================================
-- UW ActSci Club: Supabase database setup
--
-- Paste this whole file into Supabase > SQL Editor > New query, and press Run.
-- It is safe to run again later (it replaces its own functions).
--
-- BEFORE YOU RUN IT: change the email address in app_admin_email() below to
-- the club's email account. It must be the same address as ADMIN_EMAIL in
-- js/portal/config.js.
--
-- Who is who:
--   member = signed in with an @uwaterloo.ca address
--   exec   = a member whose email has a row in the "execs" collection
--   admin  = the club account (app_admin_email). Can do everything an exec can.
--
-- How it works: every record lives in one table, "docs", as a collection name,
-- an id and a block of JSON (the same shape the old Firestore data had).
-- Reading goes through row-level security (the policy at the bottom of the
-- "reading" section). Writing is only possible through apply_ops(), which
-- checks every change against the rules in app_authorize() before saving it.
-- Nobody can write to the table directly.
-- ============================================================================

-- ------------------------------------------------------------------- settings
create or replace function public.app_admin_email() returns text
language sql immutable as $$ select 'lisa.bolsinger06@gmail.com'::text $$;

create or replace function public.app_member_ending() returns text
language sql immutable as $$ select '@uwaterloo.ca'::text $$;

-- ---------------------------------------------------------------------- table
create table if not exists public.docs (
  collection text        not null,
  id         text        not null,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);
create index if not exists docs_uid_idx   on public.docs ((data->>'uid'))     where data ? 'uid';
create index if not exists docs_term_idx  on public.docs (collection, (data->>'termId'));
create index if not exists docs_event_idx on public.docs ((data->>'eventId')) where data ? 'eventId';

alter table public.docs enable row level security;
revoke all on public.docs from anon, authenticated;
grant select on public.docs to authenticated;

-- ------------------------------------------------------------ who is signed in
create or replace function public.app_uid() returns text
language sql stable as $$ select auth.uid()::text $$;

create or replace function public.app_email() returns text
language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.app_is_admin() returns boolean
language sql stable as $$
  select app_uid() is not null and app_email() = lower(app_admin_email())
$$;

create or replace function public.app_is_member() returns boolean
language sql stable as $$
  select app_uid() is not null and right(app_email(), length(app_member_ending())) = app_member_ending()
$$;

-- These look at other rows, so they run with the owner's rights (otherwise the
-- security policy would end up asking itself the same question forever).
create or replace function public.app_is_exec() returns boolean
language sql stable security definer set search_path = public as $$
  select app_is_admin()
      or (app_is_member() and exists (select 1 from docs where collection = 'execs' and id = app_email()))
$$;

create or replace function public.app_has_membership(p_term text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from docs where collection = 'memberships' and id = app_uid() || '_' || p_term)
$$;

create or replace function public.app_paid_membership(p_term text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from docs
                 where collection = 'memberships' and id = app_uid() || '_' || p_term
                   and data -> 'paid' = 'true'::jsonb)
$$;

-- Who may sign in to events (check-in): paid members, plus members in their WUSA trial period.
-- The trial is for members who entered a WUSA confirmation number that is still waiting to be
-- verified. It ends at "verifyBy" (3 weeks after they entered it), and stops at once if the
-- membership is flagged. Programs and discount codes still need a fully paid membership.
create or replace function public.app_event_access(p_term text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from docs
                 where collection = 'memberships' and id = app_uid() || '_' || p_term
                   and (data -> 'paid' = 'true'::jsonb
                        or (data ->> 'payStatus' = 'confirming'
                            and coalesce(data ->> 'flagged', 'false') <> 'true'
                            and (data ->> 'verifyBy')::timestamptz > now())))
$$;

create or replace function public.app_is_paired(p_term text, p_other text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from docs where collection = 'pairings'
                 and id in (p_term || '_' || p_other || '_' || app_uid(), p_term || '_' || app_uid() || '_' || p_other))
$$;

-- Does the signed-in member own the thing a rating is about?  rating id = resume_<id> or mock_<id>
create or replace function public.app_owns_rated(p_rid text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_rid like 'resume\_%' then exists (select 1 from docs where collection = 'resumeRequests'
                                              and id = substr(p_rid, 8) and data ->> 'uid' = app_uid())
    when p_rid like 'mock\_%'   then exists (select 1 from docs where collection = 'mockRegistrations'
                                              and id = substr(p_rid, 6) and data ->> 'uid' = app_uid())
    else false end
$$;

-- Comments live under a resume request: collection = resumeRequests/<request id>/comments
create or replace function public.app_comment_owner_is_me(p_coll text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from docs where collection = 'resumeRequests'
                 and id = split_part(p_coll, '/', 2) and data ->> 'uid' = app_uid())
$$;

-- ------------------------------------------------------------------- reading
create or replace function public.app_can_read(p_coll text, p_id text, p_data jsonb) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  me text := app_uid();
begin
  if me is null then return false; end if;
  return coalesce(case
    when p_coll = 'execs'             then app_is_exec() or p_id = app_email()
    when p_coll = 'users'             then app_is_exec() or (app_is_member() and p_id = me)
    when p_coll = 'memberships'       then app_is_exec() or (app_is_member() and p_data ->> 'uid' = me)
    when p_coll = 'payments'          then app_is_exec()
    when p_coll = 'attendance'        then app_is_exec() or (app_is_member() and p_data ->> 'uid' = me)
    when p_coll = 'directory'         then app_is_member() or app_is_exec()
    when p_coll = 'eventRegistrations' then app_is_exec() or (app_is_member() and p_data ->> 'uid' = me)
    when p_coll = 'resumeRequests'    then app_is_exec() or (app_is_member() and p_data ->> 'uid' = me)
    when p_coll like 'resumeRequests/%/comments'
                                      then app_is_exec() or (app_is_member() and app_comment_owner_is_me(p_coll))
    when p_coll = 'mockSessions'      then app_is_member() or app_is_exec()
    when p_coll = 'mockRegistrations' then app_is_exec() or (app_is_member() and p_data ->> 'uid' = me)
    -- Ratings: only the club account sees them all. A member can read back the one they wrote.
    when p_coll = 'ratings'           then app_is_admin() or (app_is_member() and app_owns_rated(p_id))
    when p_coll = 'mentorProfiles'    then app_is_exec()
                                           or (app_is_member() and (p_data ->> 'uid' = me
                                               or app_is_paired(p_data ->> 'termId', p_data ->> 'uid')))
    when p_coll = 'pairings'          then app_is_exec()
                                           or (app_is_member() and (p_data ->> 'mentorUid' = me or p_data ->> 'menteeUid' = me))
    when p_coll = 'deletionRequests'  then app_is_admin()
    -- Discount codes live only here, never in the public repository. Only the club account can read
    -- them directly; members get one through request_discount_code(), which logs who asked.
    when p_coll = 'discountCodes'     then app_is_admin()
    when p_coll = 'codeRequests'      then app_is_exec()
    else false end, false);
end $$;

drop policy if exists docs_read on public.docs;
create policy docs_read on public.docs for select to authenticated
  using (app_can_read(collection, id, data));

-- ------------------------------------------------------------ small checkers
create or replace function public.app_short(v jsonb, n int) returns boolean
language sql immutable as $$ select coalesce(jsonb_typeof(v) = 'string' and char_length(v #>> '{}') <= n, false) $$;

create or replace function public.app_is_bool(v jsonb) returns boolean
language sql immutable as $$ select coalesce(jsonb_typeof(v) = 'boolean', false) $$;

create or replace function public.app_is_int(v jsonb) returns boolean
language sql immutable as $$
  select coalesce(jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric = trunc((v #>> '{}')::numeric), false)
$$;

create or replace function public.app_num(v jsonb) returns numeric
language sql immutable as $$ select case when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric end $$;

-- The names of the fields that differ between the old and new version of a record.
create or replace function public.app_changed_keys(p_old jsonb, p_new jsonb) returns text[]
language sql immutable as $$
  select coalesce(array_agg(k), '{}'::text[]) from (
    select key as k from jsonb_each(coalesce(p_new, '{}'::jsonb))
      where coalesce(p_old, '{}'::jsonb) -> key is distinct from value
    union
    select key from jsonb_each(coalesce(p_old, '{}'::jsonb))
      where not (coalesce(p_new, '{}'::jsonb) ? key)
  ) s
$$;

create or replace function public.app_valid_link(v jsonb) returns boolean
language sql immutable as $$
  select coalesce(jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^https?://' and char_length(v #>> '{}') <= 600, false)
$$;

-- Event sign-up helpers. An answer is a short piece of text or yes/no, and a few of them at most.
create or replace function public.app_valid_answers(a jsonb) returns boolean
language sql immutable as $$
  select coalesce(a is null or (
        jsonb_typeof(a) = 'object'
    and (select count(*) from jsonb_object_keys(a)) <= 15
    and not exists (select 1 from jsonb_each(a) e
                    where char_length(e.key) > 60
                       or not (jsonb_typeof(e.value) = 'boolean'
                               or (jsonb_typeof(e.value) = 'string' and char_length(e.value #>> '{}') <= 500)))), false)
$$;

-- A list of short strings (interests, skills): at most p_max items of at most p_len characters. Missing is fine.
create or replace function public.app_str_list(v jsonb, p_max int, p_len int) returns boolean
language sql immutable as $$
  select coalesce(v is null or (jsonb_typeof(v) = 'array' and jsonb_array_length(v) <= p_max
    and not exists (select 1 from jsonb_array_elements(v) e
                    where jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') > p_len)), false)
$$;

-- Co-op history: up to 10 entries of { date, company, role }. Missing is fine.
create or replace function public.app_valid_coops(v jsonb) returns boolean
language sql immutable as $$
  select coalesce(v is null or (jsonb_typeof(v) = 'array' and jsonb_array_length(v) <= 10
    and not exists (select 1 from jsonb_array_elements(v) e
                    where jsonb_typeof(e) <> 'object'
                       or not app_short(e -> 'date', 20)
                       or not app_short(e -> 'company', 100)
                       or not app_short(e -> 'role', 100))), false)
$$;

-- The optional profile fields shared by a user's record and their directory entry.
create or replace function public.app_valid_profile_extras(d jsonb) returns boolean
language sql immutable as $$
  select coalesce(
        app_str_list(d -> 'interests', 12, 40)
    and app_str_list(d -> 'programs', 8, 40)
    and app_str_list(d -> 'skills', 15, 40)
    and app_valid_coops(d -> 'coops')
    and (d -> 'coopCount' is null or app_is_int(d -> 'coopCount'))
    and app_short(coalesce(d -> 'otherInterest', '""'::jsonb), 100)
    and app_short(coalesce(d -> 'contactEmail', '""'::jsonb), 200)
    and app_short(coalesce(d -> 'website', '""'::jsonb), 300), false)
$$;

-- Is this timestamp (text) within two minutes of the server's clock? Stops anyone back-dating a sign-up to jump the queue.
create or replace function public.app_just_now(v jsonb) returns boolean
language plpgsql stable as $$
begin
  return abs(extract(epoch from (now() - (v #>> '{}')::timestamptz))) < 120;
exception when others then
  return false;
end $$;

create or replace function public.app_valid_user(p_id text, d jsonb) returns boolean
language sql stable as $$
  select coalesce(
        d ->> 'uid' = p_id
    and d ->> 'email' = app_email()
    and app_short(d -> 'name', 100) and char_length(d ->> 'name') > 0
    and app_short(d -> 'year', 40)
    and (d ->> 'workTerm') in ('study', 'coop')
    and app_short(coalesce(d -> 'dietary', '""'::jsonb), 300)
    and app_short(coalesce(d -> 'linkedin', '""'::jsonb), 300)
    and app_short(coalesce(d -> 'coopExperience', '""'::jsonb), 1000)
    and app_short(coalesce(d -> 'firstName', '""'::jsonb), 50)
    and app_short(coalesce(d -> 'lastName', '""'::jsonb), 50)
    and app_valid_profile_extras(d)
    and jsonb_typeof(coalesce(d -> 'exams', '[]'::jsonb)) = 'array'
    and app_is_bool(d -> 'directoryVisible') and app_is_bool(d -> 'emailOptIn'), false)
$$;

-- --------------------------------------------------------------- the write rules
-- p_op is 'create', 'update' or 'delete'. p_old is the record before (null on create),
-- p_new is the record after (null on delete). Raises "permission-denied" if not allowed.
create or replace function public.app_authorize(p_op text, p_coll text, p_id text, p_old jsonb, p_new jsonb)
returns void language plpgsql stable security definer set search_path = public as $$
declare
  me       text    := app_uid();
  em       text    := app_email();
  v_admin  boolean := app_is_admin();
  v_member boolean := app_is_member();
  v_exec   boolean := app_is_exec();
  ok       boolean := false;
  ch       text[];
  cap      numeric;
begin
  if me is null then
    raise exception 'permission-denied: not signed in' using errcode = '42501';
  end if;
  ch := app_changed_keys(p_old, p_new);

  if p_coll = 'execs' then                       -- only the club account adds or removes execs
    ok := v_admin;

  elsif p_coll = 'users' then
    if p_op = 'create' then
      ok := v_member and p_id = me and app_valid_user(p_id, p_new);
    elsif p_op = 'update' then
      ok := (v_member and p_id = me and app_valid_user(p_id, p_new))
         or (v_exec and ch <@ array['emailOptIn']);
    else
      ok := v_admin;
    end if;

  elsif p_coll = 'memberships' then              -- id = uid_termId; members can never set "paid"
    if p_op = 'create' then
      ok := v_exec or (v_member and p_new ->> 'uid' = me
                       and p_id = me || '_' || coalesce(p_new ->> 'termId', '')
                       and p_new ->> 'email' = em
                       and p_new -> 'paid' = 'false'::jsonb
                       and not (p_new ? 'paidAt')
                       -- payment progress is set by execs or by submit_wusa_payment(), never by the member
                       and not (p_new ?| array['payStatus', 'trialUsed', 'verifyBy', 'wusaSubmittedAt',
                                               'flagged', 'flagReason', 'flaggedAt']));
    elsif p_op = 'update' then
      ok := v_exec or (v_member and p_old ->> 'uid' = me and ch <@ array['year', 'workTerm', 'dietary', 'name']);
    else
      ok := v_admin;
    end if;

  elsif p_coll = 'payments' then                 -- execs only
    ok := v_exec;

  elsif p_coll = 'attendance' then               -- id = eventId_uid
    if p_op = 'create' then
      ok := v_exec or (v_member and p_new ->> 'uid' = me
                       and p_new ->> 'method' in ('self', 'qr')
                       and p_id = coalesce(p_new ->> 'eventId', '') || '_' || me
                       and p_new ->> 'email' = em
                       and app_event_access(p_new ->> 'termId'));
    else
      ok := v_exec;
    end if;

  elsif p_coll = 'directory' then
    if p_op in ('create', 'update') then
      ok := v_member and p_id = me and p_new ->> 'uid' = me
            and app_short(p_new -> 'name', 100)
            and app_short(coalesce(p_new -> 'linkedin', '""'::jsonb), 300)
            and app_short(coalesce(p_new -> 'coopExperience', '""'::jsonb), 1000)
            and app_valid_profile_extras(p_new)
            and (p_new -> 'isMentor' = 'false'::jsonb
                 or exists (select 1 from docs where collection = 'mentorProfiles'
                            and id = me || '_' || coalesce(p_new ->> 'termId', '')
                            and data ->> 'role' = 'mentor'));
    else
      ok := (v_member and p_id = me) or v_exec;
    end if;
    -- An exec may also switch off the Mentor badge (used when a payment is undone).
    if p_op = 'update' and v_exec and p_new -> 'isMentor' = 'false'::jsonb then ok := true; end if;

  -- Programs (resume critique, mock interviews, mentorship) are for members who have paid.
  elsif p_coll = 'resumeRequests' then
    if p_op = 'create' then
      ok := v_member and p_new ->> 'uid' = me and p_new ->> 'status' = 'new'
            and app_valid_link(p_new -> 'link')
            and app_paid_membership(p_new ->> 'termId')
            and not (p_new ? 'reviewerEmail');
    elsif p_op = 'update' then
      ok := v_exec or (v_member and p_old ->> 'uid' = me
            and ch <@ array['link', 'roles', 'companies', 'feedbackWanted', 'deadline', 'status']
            and app_valid_link(p_new -> 'link')
            and (p_new ->> 'status' = p_old ->> 'status'
                 or (p_old ->> 'status' = 'needs_link' and p_new ->> 'status' = 'new')));
    else
      ok := v_exec or (v_member and p_old ->> 'uid' = me);
    end if;

  elsif p_coll like 'resumeRequests/%/comments' then
    if p_op = 'create' then
      ok := v_exec and p_new ->> 'authorEmail' = em;
    else
      ok := v_admin or (v_exec and p_old ->> 'authorEmail' = em);
    end if;

  elsif p_coll = 'mockSessions' then
    ok := v_exec;

  elsif p_coll = 'mockRegistrations' then        -- id = sessionId_uid
    if p_op = 'create' then
      ok := v_member and p_new ->> 'uid' = me
            and p_id = coalesce(p_new ->> 'sessionId', '') || '_' || me
            and app_paid_membership(p_new ->> 'termId')
            and not (p_new ? 'feedback');
    elsif p_op = 'update' then
      ok := v_exec;
    else
      ok := v_exec or (v_member and p_old ->> 'uid' = me);
    end if;

  elsif p_coll = 'ratings' then                  -- members rate reviewers; only the club account reads them all
    if p_op in ('create', 'update') then
      ok := v_member and app_owns_rated(p_id)
            and (select coalesce(bool_and(k in ('kind', 'refId', 'reviewerEmail', 'reviewerName', 'stars', 'comment', 'updatedAt')), true)
                   from jsonb_object_keys(p_new) k)
            and app_is_int(p_new -> 'stars') and app_num(p_new -> 'stars') between 1 and 5
            and app_short(coalesce(p_new -> 'comment', '""'::jsonb), 500);
    else
      ok := v_admin;
    end if;

  elsif p_coll = 'mentorProfiles' then           -- id = uid_termId
    cap := app_num(p_new -> 'capacity');
    if p_op = 'create' then
      ok := v_member and p_new ->> 'uid' = me
            and p_id = me || '_' || coalesce(p_new ->> 'termId', '')
            and p_new ->> 'role' in ('mentor', 'mentee')
            and app_num(p_new -> 'menteeCount') = 0
            and cap between 1 and 3
            and app_paid_membership(p_new ->> 'termId');
    elsif p_op = 'update' then
      ok := (v_member and p_old ->> 'uid' = me
             and ch <@ array['name', 'year', 'workTerm', 'interests', 'coop', 'goals', 'linkedin', 'meet', 'availability', 'capacity']
             and cap between 1 and 3
             and cap >= app_num(p_old -> 'menteeCount'))
         or (v_exec and ch <@ array['menteeCount']);
    else
      ok := v_exec;
    end if;

  elsif p_coll = 'pairings' then                 -- id = termId_mentorUid_menteeUid; the count rule is checked in apply_ops
    if p_op = 'create' then
      ok := v_exec and p_id = coalesce(p_new ->> 'termId', '') || '_' || coalesce(p_new ->> 'mentorUid', '') || '_' || coalesce(p_new ->> 'menteeUid', '');
    elsif p_op = 'delete' then
      ok := v_exec;
    end if;

  elsif p_coll = 'eventRegistrations' then       -- id = eventId_uid. Any member can sign up; only execs can remove other people.
    if p_op = 'create' then
      ok := v_member and p_new ->> 'uid' = me
            and p_id = coalesce(p_new ->> 'eventId', '') || '_' || me
            and char_length(coalesce(p_new ->> 'eventId', '')) between 1 and 120
            and p_new ->> 'email' = em
            and app_short(p_new -> 'name', 100)
            and app_short(coalesce(p_new -> 'eventTitle', '""'::jsonb), 200)
            and app_has_membership(p_new ->> 'termId')
            and app_valid_answers(p_new -> 'answers')
            and app_just_now(p_new -> 'registeredAt');
    elsif p_op = 'update' then                   -- a member can change their answers, nothing else
      ok := v_member and p_old ->> 'uid' = me and ch <@ array['answers'] and app_valid_answers(p_new -> 'answers');
    else
      ok := (v_member and p_old ->> 'uid' = me) or v_exec;
    end if;

  elsif p_coll = 'deletionRequests' then
    if p_op = 'create' then
      ok := v_member and p_id = me and p_new ->> 'uid' = me;
    else
      ok := v_admin;
    end if;

  elsif p_coll = 'discountCodes' then            -- club account only; id is a short slug like "actex"
    if p_op in ('create', 'update') then
      ok := v_admin and p_id ~ '^[a-z0-9-]{1,40}$'
            and app_short(p_new -> 'label', 80) and char_length(p_new ->> 'label') > 0
            and app_short(p_new -> 'code', 100) and char_length(p_new ->> 'code') > 0
            and app_short(coalesce(p_new -> 'note', '""'::jsonb), 400)
            and app_is_bool(p_new -> 'active');
    else
      ok := v_admin;
    end if;

  elsif p_coll = 'codeRequests' then             -- written only by request_discount_code(); the club account may clear old ones
    ok := p_op = 'delete' and v_admin;
  end if;

  if not coalesce(ok, false) then
    raise exception 'permission-denied: % % on %', p_op, p_id, p_coll using errcode = '42501';
  end if;
end $$;

-- ------------------------------------------------------- special field values
-- The website sends {"__op":"now"}, {"__op":"delete"} or {"__op":"arrayUnion","values":[...]}
-- where Firestore used serverTimestamp(), deleteField() and arrayUnion().
create or replace function public.app_resolve(p_base jsonb, p_patch jsonb) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  r jsonb := coalesce(p_base, '{}'::jsonb);
  k text; v jsonb; cur jsonb;
begin
  for k, v in select key, value from jsonb_each(coalesce(p_patch, '{}'::jsonb)) loop
    if jsonb_typeof(v) = 'object' and v ? '__op' then
      if v ->> '__op' = 'now' then
        r := jsonb_set(r, array[k], to_jsonb(to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
      elsif v ->> '__op' = 'delete' then
        r := r - k;
      elsif v ->> '__op' = 'arrayUnion' then
        cur := case when jsonb_typeof(r -> k) = 'array' then r -> k else '[]'::jsonb end;
        r := jsonb_set(r, array[k], cur || coalesce(
               (select jsonb_agg(x) from jsonb_array_elements(coalesce(v -> 'values', '[]'::jsonb)) x
                 where not (cur @> jsonb_build_array(x))), '[]'::jsonb));
      else
        raise exception 'bad-request: unknown field operation %', v ->> '__op' using errcode = '22023';
      end if;
    else
      r := jsonb_set(r, array[k], v);
    end if;
  end loop;
  return r;
end $$;

-- ------------------------------------------------------------------- writing
-- ops is a list like [{"op":"set","collection":"users","id":"abc","data":{...},"merge":true}].
-- op is set, create, update or delete. Everything in one call succeeds or fails together,
-- and the checks run as the signed-in person.
create or replace function public.apply_ops(ops jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  o jsonb; coll text; did text; kind text;
  oldd jsonb; newd jsonb; v_found boolean;
  mentors text[] := '{}'; mid text; mrow docs%rowtype; n int;
begin
  if app_uid() is null then
    raise exception 'permission-denied: not signed in' using errcode = '42501';
  end if;
  if jsonb_typeof(ops) <> 'array' or jsonb_array_length(ops) > 50 then
    raise exception 'bad-request: ops must be a list of at most 50 changes' using errcode = '22023';
  end if;

  for o in select * from jsonb_array_elements(ops) loop
    coll := o ->> 'collection'; did := o ->> 'id'; kind := o ->> 'op';
    if coalesce(coll, '') = '' or coalesce(did, '') = '' or did like '%/%' then
      raise exception 'bad-request: missing collection or id' using errcode = '22023';
    end if;

    select d.data into oldd from docs d where d.collection = coll and d.id = did for update;
    v_found := oldd is not null;

    if kind = 'delete' then
      if v_found then
        perform app_authorize('delete', coll, did, oldd, null);
        delete from docs where collection = coll and id = did;
      end if;
      newd := null;

    elsif kind = 'update' then
      if not v_found then raise exception 'not-found: % % does not exist', coll, did using errcode = 'P0002'; end if;
      newd := app_resolve(oldd, o -> 'data');
      perform app_authorize('update', coll, did, oldd, newd);
      update docs set data = newd, updated_at = now() where collection = coll and id = did;

    elsif kind = 'create' then
      if v_found then raise exception 'already-exists: % % exists', coll, did using errcode = '23505'; end if;
      newd := app_resolve('{}'::jsonb, o -> 'data');
      perform app_authorize('create', coll, did, null, newd);
      insert into docs (collection, id, data) values (coll, did, newd);

    elsif kind = 'set' then
      if coalesce((o ->> 'merge')::boolean, false) and v_found then
        newd := app_resolve(oldd, o -> 'data');
      else
        newd := app_resolve('{}'::jsonb, o -> 'data');
      end if;
      if v_found then
        perform app_authorize('update', coll, did, oldd, newd);
        update docs set data = newd, updated_at = now() where collection = coll and id = did;
      else
        perform app_authorize('create', coll, did, null, newd);
        insert into docs (collection, id, data) values (coll, did, newd);
      end if;

    else
      raise exception 'bad-request: unknown op %', kind using errcode = '22023';
    end if;

    -- remember which mentors this batch touched, for the count check below
    if coll = 'mentorProfiles' then
      mentors := mentors || did;
    elsif coll = 'pairings' then
      mentors := mentors || ((coalesce(newd, oldd) ->> 'mentorUid') || '_' || (coalesce(newd, oldd) ->> 'termId'));
    end if;
  end loop;

  -- A mentor can never have more than 3 mentees, or more than the number they chose,
  -- and their count always matches the pairings that exist.
  for mid in select distinct m from unnest(mentors) m loop
    mrow := null;
    select * into mrow from docs where collection = 'mentorProfiles' and id = mid;
    if mrow.id is not null then
      select count(*) into n from docs
        where collection = 'pairings' and data ->> 'mentorUid' = mrow.data ->> 'uid' and data ->> 'termId' = mrow.data ->> 'termId';
      if app_num(mrow.data -> 'menteeCount') is distinct from n
         or n > 3 or n > coalesce(app_num(mrow.data -> 'capacity'), 0) then
        raise exception 'permission-denied: that mentor cannot take another mentee' using errcode = '42501';
      end if;
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------------- reading, from the website
-- Runs as the signed-in person, so the security policy decides which rows come back.
-- p_where is a list like [{"field":"uid","value":"abc"}] (all must match exactly).
create or replace function public.query_docs(p_collection text, p_where jsonb default '[]'::jsonb, p_id text default null)
returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'data', d.data)), '[]'::jsonb)
  from docs d
  where d.collection = p_collection
    and (p_id is null or d.id = p_id)
    and not exists (select 1 from jsonb_array_elements(coalesce(p_where, '[]'::jsonb)) f
                    where d.data ->> (f ->> 'field') is distinct from (f ->> 'value'))
$$;

-- Who is in line for each event, without names: just the time each person signed up, in order, and which one is yours.
-- The website uses it to work out "you're in" vs "you're #3 on the waitlist". Members can't read other people's sign-ups.
create or replace function public.event_queues(p_events text[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when app_uid() is null or not (app_is_member() or app_is_exec()) then '{}'::jsonb else
    coalesce((select jsonb_object_agg(e.eid, e.q) from (
      select ev as eid, coalesce((
        select jsonb_agg(jsonb_build_object('at', d.data ->> 'registeredAt', 'mine', d.data ->> 'uid' = app_uid())
                         order by d.data ->> 'registeredAt', d.id)
        from docs d where d.collection = 'eventRegistrations' and d.data ->> 'eventId' = ev), '[]'::jsonb) as q
      from unnest(p_events) ev) e), '{}'::jsonb) end
$$;

-- ------------------------------------------------------------ WUSA payments (member side)
-- A member enters the 6-digit WUSA confirmation number from their receipt. This does four things at once:
--   1. their membership becomes "awaiting confirmation" (the event trial period), and the trial is marked used;
--   2. the number is checked against every other number on file. If it was used before, BOTH accounts are
--      flagged (the flag suspends the trial; an exec reviews it);
--   3. verifyBy is set to three weeks from now. That is when an exec should check the payment with WUSA
--      (and when the trial ends if nobody has confirmed it);
--   4. the number is saved in the private payments record, which only execs can read.
-- It has to be a function rather than a normal write because members cannot read other people's payments
-- (so they could not check for duplicates) and must never be able to mark themselves paid.
create or replace function public.app_iso(t timestamptz) returns text
language sql immutable as $$ select to_char(t at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') $$;

create or replace function public.submit_wusa_payment(p_term text, p_number text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me   text := app_uid();
  mid  text;
  num  text := regexp_replace(coalesce(p_number, ''), '\s+', '', 'g');
  m    jsonb;
  dup  int;
  t0   timestamptz := clock_timestamp();
  stamp text := app_iso(t0);
  by_ms bigint := (extract(epoch from t0) * 1000)::bigint;
  due  text := app_iso(t0 + interval '14 days');
  r    record;
begin
  if me is null or not app_is_member() then
    raise exception 'permission-denied: members only' using errcode = '42501';
  end if;
  if num !~ '^\d{6}$' then
    raise exception 'bad-request: Enter the 6-digit WUSA confirmation number.' using errcode = '22023';
  end if;
  mid := me || '_' || coalesce(p_term, '');

  perform pg_advisory_xact_lock(hashtext('wusa:' || num));   -- two people entering the same number at once
  select data into m from docs where collection = 'memberships' and id = mid for update;
  if m is null then
    raise exception 'not-found: register for this term first' using errcode = 'P0002';
  end if;
  if m -> 'paid' = 'true'::jsonb then
    return jsonb_build_object('status', 'paid');
  end if;
  if coalesce(m ->> 'trialUsed', 'false') = 'true' then
    raise exception 'already-submitted: A confirmation number has already been entered. Email the club if it needs fixing.' using errcode = '23505';
  end if;

  select count(*) into dup from docs where collection = 'payments' and data ->> 'wusaNumber' = num and id <> mid;

  update docs set updated_at = now(), data = data || jsonb_build_object(
      'payStatus', 'confirming', 'trialUsed', true, 'wusaSubmittedAt', stamp, 'verifyBy', due)
        || case when dup > 0 then jsonb_build_object('flagged', true, 'flagReason', 'duplicate-wusa', 'flaggedAt', stamp)
                else '{}'::jsonb end
    where collection = 'memberships' and id = mid;

  insert into docs (collection, id, data) values ('payments', mid, jsonb_build_object(
      'uid', me, 'termId', p_term, 'method', 'wusa', 'wusaNumber', num, 'source', 'member', 'submittedAt', stamp,
      'history', jsonb_build_array(jsonb_build_object('action', 'wusa number entered by member', 'wusaNumber', num, 'by', m ->> 'name', 'byEmail', app_email(), 'at', by_ms))))
    on conflict (collection, id) do update set updated_at = now(), data =
      jsonb_set(docs.data || jsonb_build_object('method', 'wusa', 'wusaNumber', num, 'source', 'member', 'submittedAt', stamp),
                '{history}', coalesce(docs.data -> 'history', '[]'::jsonb)
                  || jsonb_build_array(jsonb_build_object('action', 'wusa number entered by member', 'wusaNumber', num, 'by', m ->> 'name', 'byEmail', app_email(), 'at', by_ms)));

  if dup > 0 then                                   -- flag the other account(s) too
    for r in select id from docs where collection = 'payments' and data ->> 'wusaNumber' = num and id <> mid loop
      update docs set updated_at = now(), data = data || jsonb_build_object('flagged', true, 'flagReason', 'duplicate-wusa', 'flaggedAt', stamp)
        where collection = 'memberships' and id = r.id;
      update docs set updated_at = now(), data = jsonb_set(data, '{history}', coalesce(data -> 'history', '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object('action', 'flagged: the same WUSA number was entered on another account', 'by', 'system', 'at', by_ms)))
        where collection = 'payments' and id = r.id;
    end loop;
    update docs set updated_at = now(), data = jsonb_set(data, '{history}', coalesce(data -> 'history', '[]'::jsonb)
        || jsonb_build_array(jsonb_build_object('action', 'flagged: this WUSA number is already on another account', 'by', 'system', 'at', by_ms)))
      where collection = 'payments' and id = mid;
  end if;

  return jsonb_build_object('status', case when dup > 0 then 'flagged' else 'confirming' end, 'verifyBy', due);
end $$;

-- ------------------------------------------------------------ discount codes (member side)
-- Codes are stored in the "discountCodes" collection, which only the club account can read.
-- A paid member sees the list of available codes (names only), and gets the code itself by pressing
-- Request. Every request is logged in "codeRequests" (who, which code, when, how many times).
create or replace function public.list_discount_codes(p_term text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when app_uid() is null or not app_is_member() or not app_paid_membership(p_term) then '[]'::jsonb else
    coalesce((select jsonb_agg(jsonb_build_object(
        'key', c.id, 'label', c.data ->> 'label', 'note', coalesce(c.data ->> 'note', ''),
        'requested', exists (select 1 from docs q where q.collection = 'codeRequests' and q.id = c.id || '_' || app_uid() || '_' || p_term))
      order by c.data ->> 'label')
      from docs c where c.collection = 'discountCodes' and c.data -> 'active' = 'true'::jsonb), '[]'::jsonb) end
$$;

create or replace function public.request_discount_code(p_key text, p_term text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me text := app_uid();
  c  jsonb;
  rid text := coalesce(p_key, '') || '_' || coalesce(me, '') || '_' || coalesce(p_term, '');
  u  jsonb;
  stamp text := app_iso(clock_timestamp());
begin
  if me is null or not app_is_member() or not app_paid_membership(p_term) then
    raise exception 'permission-denied: discount codes are for paid members' using errcode = '42501';
  end if;
  select data into c from docs where collection = 'discountCodes' and id = p_key and data -> 'active' = 'true'::jsonb;
  if c is null then
    raise exception 'not-found: that code is not available' using errcode = 'P0002';
  end if;
  select data into u from docs where collection = 'users' and id = me;
  insert into docs (collection, id, data) values ('codeRequests', rid, jsonb_build_object(
      'key', p_key, 'label', c ->> 'label', 'uid', me, 'email', app_email(), 'name', coalesce(u ->> 'name', app_email()),
      'termId', p_term, 'firstAt', stamp, 'lastAt', stamp, 'count', 1))
    on conflict (collection, id) do update set updated_at = now(), data =
      docs.data || jsonb_build_object('lastAt', stamp, 'count', coalesce((docs.data ->> 'count')::int, 0) + 1);
  return jsonb_build_object('label', c ->> 'label', 'code', c ->> 'code', 'note', coalesce(c ->> 'note', ''));
end $$;

revoke all on function public.submit_wusa_payment(text, text) from public, anon;
grant execute on function public.submit_wusa_payment(text, text) to authenticated;
revoke all on function public.list_discount_codes(text) from public, anon;
grant execute on function public.list_discount_codes(text) to authenticated;
revoke all on function public.request_discount_code(text, text) from public, anon;
grant execute on function public.request_discount_code(text, text) to authenticated;

revoke all on function public.apply_ops(jsonb) from public, anon;
revoke all on function public.query_docs(text, jsonb, text) from public, anon;
grant execute on function public.apply_ops(jsonb) to authenticated;
revoke all on function public.event_queues(text[]) from public, anon;
grant execute on function public.event_queues(text[]) to authenticated;
grant execute on function public.query_docs(text, jsonb, text) to authenticated;

-- ------------------------------------------------- optional but recommended: sign-up filter
-- Stops anyone without an @uwaterloo.ca address (or the club account) from creating an account,
-- so strangers can't use the sign-in form to send emails to other people.
-- After running this file, switch it on in the dashboard:
--   Authentication > Hooks > Before User Created > Postgres function > public.hook_before_user_created
create or replace function public.hook_before_user_created(event jsonb) returns jsonb
language plpgsql stable set search_path = public as $$
declare e text := lower(coalesce(event -> 'user' ->> 'email', ''));
begin
  if right(e, length(public.app_member_ending())) = public.app_member_ending() or e = lower(public.app_admin_email()) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'message', 'Please use your @uwaterloo.ca email address.', 'http_code', 400));
end $$;

grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from authenticated, anon, public;

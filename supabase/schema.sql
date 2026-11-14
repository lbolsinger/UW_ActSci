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
                       and not (p_new ? 'paidAt'));
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
                       and app_paid_membership(p_new ->> 'termId'));
    else
      ok := v_exec;
    end if;

  elsif p_coll = 'directory' then
    if p_op in ('create', 'update') then
      ok := v_member and p_id = me and p_new ->> 'uid' = me
            and app_short(p_new -> 'name', 100)
            and app_short(coalesce(p_new -> 'linkedin', '""'::jsonb), 300)
            and app_short(coalesce(p_new -> 'coopExperience', '""'::jsonb), 1000)
            and (p_new -> 'isMentor' = 'false'::jsonb
                 or exists (select 1 from docs where collection = 'mentorProfiles'
                            and id = me || '_' || coalesce(p_new ->> 'termId', '')
                            and data ->> 'role' = 'mentor'));
    else
      ok := (v_member and p_id = me) or v_exec;
    end if;

  elsif p_coll = 'resumeRequests' then
    if p_op = 'create' then
      ok := v_member and p_new ->> 'uid' = me and p_new ->> 'status' = 'new'
            and app_valid_link(p_new -> 'link')
            and app_has_membership(p_new ->> 'termId')
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
            and app_has_membership(p_new ->> 'termId')
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
            and app_has_membership(p_new ->> 'termId');
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

  elsif p_coll = 'deletionRequests' then
    if p_op = 'create' then
      ok := v_member and p_id = me and p_new ->> 'uid' = me;
    else
      ok := v_admin;
    end if;
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

revoke all on function public.apply_ops(jsonb) from public, anon;
revoke all on function public.query_docs(text, jsonb, text) from public, anon;
grant execute on function public.apply_ops(jsonb) to authenticated;
grant execute on function public.query_docs(text, jsonb, text) to authenticated;

-- ------------------------------------------------- optional but recommended: sign-up filter
-- Stops anyone without an @uwaterloo.ca address (or the club account) from creating an account,
-- so strangers can't use the sign-in form to send emails to other people.
-- After running this file, switch it on in the dashboard:
--   Authentication > Hooks > Before User Created > Postgres function > public.hook_before_user_created
create or replace function public.hook_before_user_created(event jsonb) returns jsonb
language plpgsql stable as $$
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

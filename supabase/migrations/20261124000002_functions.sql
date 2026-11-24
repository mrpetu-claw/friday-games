-- Friday Games — server functions
-- Public RPCs (callable by anon through supabase.rpc) are SECURITY DEFINER and
-- validate their inputs. Helpers live in game_private, which anon cannot use.
-- Errors are raised as `P0001` with a short machine-readable message
-- (e.g. 'not_authorized', 'name_taken') that the client maps to friendly text.

-- ============================================================ helpers
create or replace function game_private.new_token() returns text
language sql volatile as $$
  select encode(extensions.gen_random_bytes(24), 'hex')
$$;

create or replace function game_private.hash_token(p text) returns bytea
language sql immutable as $$
  select extensions.digest(coalesce(p, ''), 'sha256')
$$;

create or replace function game_private.new_public_code() returns text
language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I/L
  bytes bytea := extensions.gen_random_bytes(6);
  code text := '';
begin
  for i in 0..5 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return code;
end $$;

create or replace function game_private.client_ip() returns text
language sql stable as $$
  select coalesce(
    nullif(trim(split_part(
      (nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for'), ',', 1)), ''),
    'unknown')
$$;

-- Returns true when the caller has exceeded p_max hits in p_window for bucket.
create or replace function game_private.is_limited(p_bucket text, p_max int, p_window interval)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.rate_limits
    where key = p_bucket || ':' || game_private.client_ip()
      and window_start > now() - p_window
      and hits >= p_max)
$$;

create or replace function game_private.record_hit(p_bucket text, p_window interval)
returns void language plpgsql as $$
begin
  insert into public.rate_limits as r (key, window_start, hits)
  values (p_bucket || ':' || game_private.client_ip(), now(), 1)
  on conflict (key) do update set
    hits         = case when r.window_start <= now() - p_window then 1 else r.hits + 1 end,
    window_start = case when r.window_start <= now() - p_window then now() else r.window_start end;
end $$;

create or replace function game_private.fail(p_code text) returns void
language plpgsql as $$
begin
  raise exception '%', p_code using errcode = 'P0001';
end $$;

-- Notify subscribers that something changed. Payload carries no game data —
-- clients refetch through the RPCs, which apply all visibility rules.
create or replace function game_private.touch(p_session_id uuid) returns void
language plpgsql as $$
declare
  v_code text;
  v_version bigint;
begin
  update public.sessions set version = version + 1
   where id = p_session_id
   returning public_code, version into v_code, v_version;
  begin
    perform realtime.send(
      jsonb_build_object('version', v_version),
      'state_changed',
      'session:' || v_code,
      false);
  exception when others then
    -- Realtime unavailable: clients still converge through their polling fallback.
    null;
  end;
end $$;

-- Closes the session if its 60-minute window has passed. Returns the fresh row.
create or replace function game_private.apply_expiry(p_session public.sessions)
returns public.sessions language plpgsql as $$
declare
  s public.sessions := p_session;
begin
  if s.status <> 'ended' and s.expires_at is not null and s.expires_at <= now() then
    update public.rounds set status = 'closed', ended_at = s.expires_at
     where session_id = s.id and status = 'active';
    update public.sessions
       set status = 'ended', ended_at = s.expires_at, end_reason = 'time_limit'
     where id = s.id
     returning * into s;
    perform game_private.touch(s.id);
    select * into s from public.sessions where id = s.id;
  end if;
  return s;
end $$;

-- Authenticates the host and locks the session row (serialises all host
-- mutations of one session). Fails if the session is over unless p_allow_ended.
create or replace function game_private.auth_host(p_code text, p_credential text, p_allow_ended boolean default false)
returns public.sessions language plpgsql as $$
declare
  s public.sessions;
begin
  select * into s from public.sessions where public_code = upper(trim(p_code)) for update;
  if not found then perform game_private.fail('not_authorized'); end if;
  if not exists (
    select 1 from public.host_credentials
     where session_id = s.id and revoked_at is null
       and credential_hash = game_private.hash_token(p_credential)) then
    perform game_private.fail('not_authorized');
  end if;
  s := game_private.apply_expiry(s);
  if s.status = 'ended' and not p_allow_ended then
    perform game_private.fail('session_ended');
  end if;
  return s;
end $$;

create or replace function game_private.clean_name(p_name text) returns text
language plpgsql immutable as $$
declare
  n text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if length(n) < 1 or length(n) > 24 then perform game_private.fail('invalid_name'); end if;
  if n ~ '[<>{}\\[:cntrl:]]' then perform game_private.fail('invalid_name'); end if;
  return n;
end $$;

create or replace function game_private.name_free(p_session_id uuid, p_name text, p_except uuid default null)
returns void language plpgsql as $$
begin
  if exists (select 1 from public.players
              where session_id = p_session_id and status = 'active'
                and lower(display_name) = lower(p_name)
                and (p_except is null or id <> p_except)) then
    perform game_private.fail('name_taken');
  end if;
end $$;

create or replace function game_private.active_round(p_session public.sessions)
returns public.rounds language plpgsql as $$
declare r public.rounds;
begin
  select * into r from public.rounds where session_id = p_session.id and status = 'active';
  if not found then perform game_private.fail('no_active_mystery'); end if;
  return r;
end $$;

-- Validates the player a score is attributed to. Competitive mode requires a
-- player; cooperative mode allows null (= the team).
create or replace function game_private.check_scorer(p_session public.sessions, p_player_id uuid)
returns void language plpgsql as $$
begin
  if p_player_id is null then
    if p_session.mode = 'competitive' then perform game_private.fail('player_required'); end if;
    return;
  end if;
  if not exists (select 1 from public.players
                  where id = p_player_id and session_id = p_session.id
                    and status = 'active' and role = 'player') then
    perform game_private.fail('invalid_player');
  end if;
end $$;

-- Scoreboard + result. Shared by public and host state.
create or replace function game_private.scoreboard(p_session public.sessions)
returns jsonb language sql stable as $$
  with totals as (
    select p.id, p.display_name, p.role, p.join_method,
           (p.reconnect_token_hash is not null) as connected_identity,
           coalesce(sum(e.amount), 0)::int as score,
           count(*) filter (where e.reason = 'clue')::int
             - count(*) filter (where e.reason = 'reversal' and r.reason = 'clue')::int as clues
      from public.players p
      left join public.score_events e on e.player_id = p.id
      left join public.score_events r on r.id = e.reversed_event_id
     where p.session_id = p_session.id and p.status = 'active'
     group by p.id
  ), top as (
    select max(score) as best from totals where role = 'player'
  )
  select jsonb_build_object(
    'players', coalesce((
       select jsonb_agg(jsonb_build_object(
                'id', t.id, 'name', t.display_name, 'role', t.role,
                'join_method', t.join_method, 'linked', t.connected_identity,
                'score', t.score, 'clues', t.clues)
              order by t.role, t.score desc, lower(t.display_name))
         from totals t), '[]'::jsonb),
    'team_score', (select coalesce(sum(amount), 0)::int from public.score_events where session_id = p_session.id),
    'mysteries_played', (select count(*) from public.rounds where session_id = p_session.id),
    'mysteries_solved', (select count(*) from public.rounds where session_id = p_session.id and solved_at is not null),
    'winners', case
       when p_session.status = 'ended' and p_session.mode = 'competitive' then coalesce((
         select jsonb_agg(t.display_name order by lower(t.display_name))
           from totals t, top
          where t.role = 'player' and t.score = top.best and top.best > 0), '[]'::jsonb)
       else null end,
    'team_success', case
       when p_session.mode = 'cooperative' then
         (select coalesce(sum(amount), 0) from public.score_events where session_id = p_session.id)
           >= (p_session.settings ->> 'coop_target')::int
       else null end
  )
$$;

create or replace function game_private.session_json(s public.sessions) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'code', s.public_code, 'game', s.game, 'mode', s.mode, 'status', s.status,
    'created_at', s.created_at, 'started_at', s.started_at, 'expires_at', s.expires_at,
    'ended_at', s.ended_at, 'end_reason', s.end_reason, 'version', s.version,
    'server_now', now(),
    'settings', s.settings)
$$;

-- Public view of a round: only revealed clues, solution only after Reveal.
create or replace function game_private.public_round(p_round_id uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', r.id, 'seq', r.seq, 'status', r.status,
    'started_at', r.started_at, 'ended_at', r.ended_at,
    'solved', r.solved_at is not null,
    'solved_by', (select display_name from public.players where id = r.solved_by),
    'mystery', jsonb_build_object(
       'id', m.id, 'title', m.title, 'category', m.category,
       'difficulty', m.difficulty, 'prompt', m.public_prompt, 'image', m.image_path),
    'clue_count', (select count(*) from public.clues where mystery_id = m.id),
    'revealed_clues', coalesce((
       select jsonb_agg(jsonb_build_object(
                'id', c.id, 'text', c.text, 'points', c.points,
                'player', p.display_name, 'awarded_at', a.awarded_at)
              order by a.awarded_at)
         from public.clue_awards a
         join public.clues c on c.id = a.clue_id
         left join public.players p on p.id = a.player_id
        where a.round_id = r.id and a.revoked_at is null), '[]'::jsonb),
    'solution', case when r.revealed_at is not null then m.private_solution else null end)
  from public.rounds r join public.mysteries m on m.id = r.mystery_id
  where r.id = p_round_id
$$;

-- ============================================================ public RPCs

create or replace function public.create_session(p_mode text, p_coop_target int default 60)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
  v_cred text := game_private.new_token();
  v_id uuid;
begin
  if p_mode not in ('competitive', 'cooperative') then perform game_private.fail('invalid_mode'); end if;
  if p_coop_target is null or p_coop_target < 5 or p_coop_target > 500 then
    perform game_private.fail('invalid_target');
  end if;
  if game_private.is_limited('create', 20, interval '1 hour') then perform game_private.fail('rate_limited'); end if;
  perform game_private.record_hit('create', interval '1 hour');

  loop
    v_code := game_private.new_public_code();
    exit when not exists (select 1 from public.sessions where public_code = v_code);
  end loop;

  insert into public.sessions (public_code, mode, settings)
  values (v_code, p_mode, jsonb_build_object(
     'partial', 5, 'solve', 15, 'wrong_guess', -2,
     'coop_target', p_coop_target, 'duration_minutes', 60))
  returning id into v_id;

  insert into public.host_credentials (session_id, credential_hash)
  values (v_id, game_private.hash_token(v_cred));

  return jsonb_build_object('code', v_code, 'host_credential', v_cred);
end $$;

-- Read-only public state for a code. Unknown codes count towards a per-IP
-- failure limit so codes cannot be enumerated.
create or replace function public.get_public_state(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions;
begin
  if game_private.is_limited('lookup_fail', 30, interval '10 minutes') then
    perform game_private.fail('rate_limited');
  end if;
  select * into s from public.sessions where public_code = upper(trim(coalesce(p_code, '')));
  if not found then
    perform game_private.record_hit('lookup_fail', interval '10 minutes');
    return jsonb_build_object('error', 'not_found');
  end if;
  s := game_private.apply_expiry(s);
  return jsonb_build_object(
    'session', game_private.session_json(s),
    'round', case when s.current_round_id is null then null
                  else game_private.public_round(s.current_round_id) end,
    'board', game_private.scoreboard(s));
end $$;

create or replace function public.join_session(p_code text, p_name text, p_spectator boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions;
  v_name text;
  v_token text := game_private.new_token();
  v_id uuid;
begin
  if game_private.is_limited('lookup_fail', 30, interval '10 minutes')
     or game_private.is_limited('join', 60, interval '10 minutes') then
    perform game_private.fail('rate_limited');
  end if;
  select * into s from public.sessions where public_code = upper(trim(coalesce(p_code, ''))) for update;
  if not found then
    perform game_private.record_hit('lookup_fail', interval '10 minutes');
    return jsonb_build_object('error', 'not_found');
  end if;
  s := game_private.apply_expiry(s);
  if s.status = 'ended' then perform game_private.fail('session_ended'); end if;
  perform game_private.record_hit('join', interval '10 minutes');

  v_name := game_private.clean_name(p_name);
  perform game_private.name_free(s.id, v_name);

  insert into public.players (session_id, display_name, role, join_method, reconnect_token_hash)
  values (s.id, v_name, case when p_spectator then 'spectator' else 'player' end, 'web',
          game_private.hash_token(v_token))
  returning id into v_id;

  perform game_private.touch(s.id);
  return jsonb_build_object('player_id', v_id, 'player_token', v_token, 'name', v_name);
end $$;

-- Who am I? Works for a joined player's token and for a pending link claim.
create or replace function public.whoami(p_code text, p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions;
  p public.players;
  lr public.link_requests;
begin
  select * into s from public.sessions where public_code = upper(trim(coalesce(p_code, '')));
  if not found then return jsonb_build_object('status', 'unknown'); end if;

  select * into p from public.players
   where session_id = s.id and status = 'active'
     and reconnect_token_hash = game_private.hash_token(p_token);
  if found then
    return jsonb_build_object('status', 'player', 'player_id', p.id, 'name', p.display_name, 'role', p.role);
  end if;

  select * into lr from public.link_requests
   where session_id = s.id and claim_token_hash = game_private.hash_token(p_token);
  if found then
    return jsonb_build_object('status', case lr.status when 'approved' then 'removed' else lr.status end);
  end if;
  return jsonb_build_object('status', 'unknown');
end $$;

-- A manually added player enters the one-time code the host gave them.
-- This only creates a request; the host must approve it (anti-impersonation).
create or replace function public.request_link(p_code text, p_link_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions;
  lc public.link_codes;
  v_claim text := game_private.new_token();
  v_req uuid;
begin
  if game_private.is_limited('link_fail', 10, interval '15 minutes') then
    perform game_private.fail('rate_limited');
  end if;
  select * into s from public.sessions where public_code = upper(trim(coalesce(p_code, ''))) for update;
  if found then s := game_private.apply_expiry(s); end if;
  if not found or s.status = 'ended' then
    perform game_private.record_hit('link_fail', interval '15 minutes');
    return jsonb_build_object('error', 'invalid_code');
  end if;

  select c.* into lc from public.link_codes c
    join public.players p on p.id = c.player_id
   where p.session_id = s.id and p.status = 'active'
     and c.code_hash = game_private.hash_token(trim(p_link_code))
     and c.used_at is null and c.expires_at > now();
  if not found then
    perform game_private.record_hit('link_fail', interval '15 minutes');
    return jsonb_build_object('error', 'invalid_code');
  end if;

  update public.link_codes set used_at = now() where id = lc.id;
  insert into public.link_requests (session_id, player_id, claim_token_hash)
  values (s.id, lc.player_id, game_private.hash_token(v_claim))
  returning id into v_req;

  perform game_private.touch(s.id);
  return jsonb_build_object('claim_token', v_claim,
    'name', (select display_name from public.players where id = lc.player_id));
end $$;

-- ============================================================ host RPCs

create or replace function public.host_get_state(p_code text, p_credential text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions := game_private.auth_host(p_code, p_credential, true);
  r public.rounds;
begin
  if s.current_round_id is not null then
    select * into r from public.rounds where id = s.current_round_id;
  end if;
  return jsonb_build_object(
    'session', game_private.session_json(s),
    'board', game_private.scoreboard(s),
    'round', case when r.id is null then null else
      game_private.public_round(r.id) || jsonb_build_object(
        'solution', m.private_solution,
        'revealed', r.revealed_at is not null,
        'clues', (select jsonb_agg(jsonb_build_object(
                     'id', c.id, 'text', c.text, 'points', c.points, 'sort_order', c.sort_order,
                     'award', (select jsonb_build_object('id', a.id, 'player_id', a.player_id,
                                       'player', p.display_name, 'awarded_at', a.awarded_at)
                                 from public.clue_awards a
                                 left join public.players p on p.id = a.player_id
                                where a.round_id = r.id and a.clue_id = c.id and a.revoked_at is null))
                   order by c.sort_order)
                  from public.clues c where c.mystery_id = r.mystery_id))
      end,
    'catalog', (select jsonb_agg(jsonb_build_object(
                  'id', mm.id, 'title', mm.title, 'category', mm.category, 'difficulty', mm.difficulty,
                  'played', exists (select 1 from public.rounds rr where rr.session_id = s.id and rr.mystery_id = mm.id))
                order by mm.id)
                from public.mysteries mm where mm.active),
    'link_requests', coalesce((
       select jsonb_agg(jsonb_build_object('id', lr.id, 'player_id', lr.player_id,
                'player', p.display_name, 'created_at', lr.created_at) order by lr.created_at)
         from public.link_requests lr join public.players p on p.id = lr.player_id
        where lr.session_id = s.id and lr.status = 'pending' and p.status = 'active'), '[]'::jsonb),
    'events', coalesce((
       select jsonb_agg(ev order by (ev ->> 'created_at') desc) from (
         select jsonb_build_object(
                  'id', e.id, 'reason', e.reason, 'amount', e.amount,
                  'player', p.display_name, 'round_seq', rr.seq,
                  'clue', c.text, 'created_at', e.created_at,
                  'reversed', exists (select 1 from public.score_events x where x.reversed_event_id = e.id),
                  'reverses', e.reversed_event_id) as ev
           from public.score_events e
           left join public.players p on p.id = e.player_id
           left join public.rounds rr on rr.id = e.round_id
           left join public.clues c on c.id = e.clue_id
          where e.session_id = s.id
          order by e.created_at desc limit 60) q), '[]'::jsonb))
  from (select 1) dummy
  left join public.mysteries m on m.id = r.mystery_id;
end $$;

create or replace function public.host_add_player(p_code text, p_credential text, p_name text, p_spectator boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions := game_private.auth_host(p_code, p_credential);
  v_name text := game_private.clean_name(p_name);
  v_id uuid;
begin
  perform game_private.name_free(s.id, v_name);
  insert into public.players (session_id, display_name, role, join_method)
  values (s.id, v_name, case when p_spectator then 'spectator' else 'player' end, 'manual')
  returning id into v_id;
  perform game_private.touch(s.id);
  return jsonb_build_object('player_id', v_id);
end $$;

create or replace function public.host_rename_player(p_code text, p_credential text, p_player_id uuid, p_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions := game_private.auth_host(p_code, p_credential);
  v_name text := game_private.clean_name(p_name);
begin
  perform game_private.name_free(s.id, v_name, p_player_id);
  update public.players set display_name = v_name
   where id = p_player_id and session_id = s.id and status = 'active';
  if not found then perform game_private.fail('invalid_player'); end if;
  perform game_private.touch(s.id);
end $$;

create or replace function public.host_set_role(p_code text, p_credential text, p_player_id uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.sessions := game_private.auth_host(p_code, p_credential);
begin
  if p_role not in ('player', 'spectator') then perform game_private.fail('invalid_role'); end if;
  update public.players set role = p_role
   where id = p_player_id and session_id = s.id and status = 'active';
  if not found then perform game_private.fail('invalid_player'); end if;
  perform game_private.touch(s.id);
end $$;

-- Removing keeps the audit trail; the player disappears from the board and
-- their token stops working.
create or replace function public.host_remove_player(p_code text, p_credential text, p_player_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.sessions := game_private.auth_host(p_code, p_credential);
begin
  update public.players set status = 'removed', reconnect_token_hash = null
   where id = p_player_id and session_id = s.id and status = 'active';
  if not found then perform game_private.fail('invalid_player'); end if;
  update public.link_requests set status = 'rejected', decided_at = now()
   where player_id = p_player_id and status = 'pending';
  perform game_private.touch(s.id);
end $$;

-- One-time 6-digit code for a manually added player, valid 15 minutes.
create or replace function public.host_create_link_code(p_code text, p_credential text, p_player_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions := game_private.auth_host(p_code, p_credential);
  v_code text := lpad(((('x' || encode(extensions.gen_random_bytes(3), 'hex'))::bit(24)::int % 1000000))::text, 6, '0');
  v_exp timestamptz := now() + interval '15 minutes';
begin
  if not exists (select 1 from public.players
                  where id = p_player_id and session_id = s.id and status = 'active'
                    and join_method = 'manual') then
    perform game_private.fail('invalid_player');
  end if;
  update public.link_codes set used_at = now() where player_id = p_player_id and used_at is null;
  insert into public.link_codes (player_id, code_hash, expires_at)
  values (p_player_id, game_private.hash_token(v_code), v_exp);
  return jsonb_build_object('link_code', v_code, 'expires_at', v_exp);
end $$;

create or replace function public.host_resolve_link(p_code text, p_credential text, p_request_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions := game_private.auth_host(p_code, p_credential);
  lr public.link_requests;
begin
  select * into lr from public.link_requests
   where id = p_request_id and session_id = s.id and status = 'pending' for update;
  if not found then perform game_private.fail('invalid_request'); end if;

  if p_approve then
    update public.players
       set reconnect_token_hash = lr.claim_token_hash, linked_at = now()
     where id = lr.player_id and status = 'active';
    update public.link_requests set status = 'approved', decided_at = now() where id = lr.id;
    -- Any other pending claim for the same player is rejected
    update public.link_requests set status = 'rejected', decided_at = now()
     where player_id = lr.player_id and status = 'pending' and id <> lr.id;
  else
    update public.link_requests set status = 'rejected', decided_at = now() where id = lr.id;
  end if;
  perform game_private.touch(s.id);
end $$;

create or replace function public.host_start_mystery(p_code text, p_credential text, p_mystery_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions := game_private.auth_host(p_code, p_credential);
  v_round uuid;
begin
  if not exists (select 1 from public.mysteries where id = p_mystery_id and active) then
    perform game_private.fail('invalid_mystery');
  end if;
  -- Starting a new mystery closes the current one
  update public.rounds set status = 'closed', ended_at = now()
   where session_id = s.id and status = 'active';

  insert into public.rounds (session_id, mystery_id, seq)
  values (s.id, p_mystery_id,
          coalesce((select max(seq) from public.rounds where session_id = s.id), 0) + 1)
  returning id into v_round;

  update public.sessions set
     current_round_id = v_round,
     status = 'active',
     started_at = coalesce(started_at, now()),
     expires_at = coalesce(expires_at, now() + make_interval(mins => (settings ->> 'duration_minutes')::int))
   where id = s.id;
  perform game_private.touch(s.id);
end $$;

-- Award a clue. Points come from the clue definition, never from the client.
create or replace function public.host_award_clue(p_code text, p_credential text, p_clue_id uuid, p_player_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions := game_private.auth_host(p_code, p_credential);
  r public.rounds := game_private.active_round(s);
  c public.clues;
  v_event uuid;
begin
  select * into c from public.clues where id = p_clue_id and mystery_id = r.mystery_id;
  if not found then perform game_private.fail('invalid_clue'); end if;
  perform game_private.check_scorer(s, p_player_id);
  if exists (select 1 from public.clue_awards where round_id = r.id and clue_id = c.id and revoked_at is null) then
    perform game_private.fail('clue_already_awarded');
  end if;

  insert into public.score_events (session_id, round_id, player_id, amount, reason, clue_id)
  values (s.id, r.id, p_player_id, c.points, 'clue', c.id)
  returning id into v_event;
  begin
    insert into public.clue_awards (round_id, clue_id, player_id, score_event_id)
    values (r.id, c.id, p_player_id, v_event);
  exception when unique_violation then
    perform game_private.fail('clue_already_awarded');
  end;
  perform game_private.touch(s.id);
end $$;

-- Un-ticking a clue reverses the points of the player who originally got them.
create or replace function public.host_revoke_clue(p_code text, p_credential text, p_clue_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions := game_private.auth_host(p_code, p_credential);
  r public.rounds := game_private.active_round(s);
  a public.clue_awards;
  e public.score_events;
begin
  select * into a from public.clue_awards
   where round_id = r.id and clue_id = p_clue_id and revoked_at is null for update;
  if not found then perform game_private.fail('clue_not_awarded'); end if;
  select * into e from public.score_events where id = a.score_event_id;

  update public.clue_awards set revoked_at = now() where id = a.id;
  insert into public.score_events (session_id, round_id, player_id, amount, reason, clue_id, reversed_event_id)
  values (s.id, r.id, e.player_id, -e.amount, 'reversal', e.clue_id, e.id);
  perform game_private.touch(s.id);
end $$;

-- partial (+5), solve (+15), wrong_guess (−2, applied only when the host chooses)
create or replace function public.host_award_bonus(p_code text, p_credential text, p_kind text, p_player_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions := game_private.auth_host(p_code, p_credential);
  r public.rounds := game_private.active_round(s);
begin
  if p_kind not in ('partial', 'solve', 'wrong_guess') then perform game_private.fail('invalid_kind'); end if;
  perform game_private.check_scorer(s, p_player_id);
  if p_kind = 'solve' then
    if r.solved_at is not null then perform game_private.fail('already_solved'); end if;
    update public.rounds set solved_at = now(), solved_by = p_player_id where id = r.id;
  end if;
  insert into public.score_events (session_id, round_id, player_id, amount, reason)
  values (s.id, r.id, p_player_id, (s.settings ->> p_kind)::int, p_kind);
  perform game_private.touch(s.id);
end $$;

-- Undo a bonus/penalty. Clue awards are undone with host_revoke_clue instead.
create or replace function public.host_reverse_event(p_code text, p_credential text, p_event_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions := game_private.auth_host(p_code, p_credential);
  e public.score_events;
begin
  select * into e from public.score_events where id = p_event_id and session_id = s.id;
  if not found or e.reason not in ('partial', 'solve', 'wrong_guess') then
    perform game_private.fail('invalid_event');
  end if;
  if exists (select 1 from public.score_events where reversed_event_id = e.id) then
    perform game_private.fail('already_reversed');
  end if;
  insert into public.score_events (session_id, round_id, player_id, amount, reason, reversed_event_id)
  values (s.id, e.round_id, e.player_id, -e.amount, 'reversal', e.id);
  if e.reason = 'solve' then
    update public.rounds set solved_at = null, solved_by = null where id = e.round_id;
  end if;
  perform game_private.touch(s.id);
end $$;

create or replace function public.host_reveal_solution(p_code text, p_credential text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions := game_private.auth_host(p_code, p_credential);
  r public.rounds;
begin
  select * into r from public.rounds where id = s.current_round_id;
  if not found then perform game_private.fail('no_active_mystery'); end if;
  update public.rounds set revealed_at = coalesce(revealed_at, now()) where id = r.id;
  perform game_private.touch(s.id);
end $$;

create or replace function public.host_close_mystery(p_code text, p_credential text)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.sessions := game_private.auth_host(p_code, p_credential);
begin
  update public.rounds set status = 'closed', ended_at = now()
   where session_id = s.id and status = 'active';
  if not found then perform game_private.fail('no_active_mystery'); end if;
  perform game_private.touch(s.id);
end $$;

create or replace function public.host_end_session(p_code text, p_credential text)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.sessions := game_private.auth_host(p_code, p_credential);
begin
  update public.rounds set status = 'closed', ended_at = now()
   where session_id = s.id and status = 'active';
  update public.sessions set status = 'ended', ended_at = now(), end_reason = 'host' where id = s.id;
  perform game_private.touch(s.id);
end $$;

-- Housekeeping: delete sessions older than 7 days and stale rate-limit rows.
-- Schedule with pg_cron (see README) or run by hand.
create or replace function game_private.cleanup() returns void
language sql security definer set search_path = '' as $$
  delete from public.sessions where created_at < now() - interval '7 days';
  delete from public.rate_limits where window_start < now() - interval '1 day';
$$;

-- ============================================================ grants
-- New functions are executable by PUBLIC by default: revoke, then grant the
-- public API explicitly.
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema game_private from public, anon, authenticated;

grant execute on function
  public.create_session(text, int),
  public.get_public_state(text),
  public.join_session(text, text, boolean),
  public.whoami(text, text),
  public.request_link(text, text),
  public.host_get_state(text, text),
  public.host_add_player(text, text, text, boolean),
  public.host_rename_player(text, text, uuid, text),
  public.host_set_role(text, text, uuid, text),
  public.host_remove_player(text, text, uuid),
  public.host_create_link_code(text, text, uuid),
  public.host_resolve_link(text, text, uuid, boolean),
  public.host_start_mystery(text, text, text),
  public.host_award_clue(text, text, uuid, uuid),
  public.host_revoke_clue(text, text, uuid),
  public.host_award_bonus(text, text, text, uuid),
  public.host_reverse_event(text, text, uuid),
  public.host_reveal_solution(text, text),
  public.host_close_mystery(text, text),
  public.host_end_session(text, text)
to anon, authenticated;

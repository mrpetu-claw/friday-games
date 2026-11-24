-- Acceptance tests for the server layer. Run against a fresh database that has
-- the migrations applied (see supabase/tests/run.sh). Every check raises on
-- failure; the script ends by printing ALL ACCEPTANCE TESTS PASSED.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create temp table t (k text primary key, v text);
grant all on t to anon;

-- ------------------------------------------------------------- as anon
set role anon;

-- Direct table access is denied (RLS + no grants)
do $$ begin
  begin perform 1 from public.mysteries limit 1; raise exception 'FAIL: anon read mysteries';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.clues limit 1; raise exception 'FAIL: anon read clues';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.host_credentials limit 1; raise exception 'FAIL: anon read credentials';
  exception when insufficient_privilege then null; end;
end $$;

-- Helpers are not callable
do $$ begin
  begin perform game_private.cleanup(); raise exception 'FAIL: anon called private helper';
  exception when insufficient_privilege then null; end;
end $$;

-- A) Create a session without an account
do $$ declare r jsonb := public.create_session('competitive');
begin
  if length(r->>'code') <> 6 or length(r->>'host_credential') < 40 then raise exception 'FAIL A %', r; end if;
  insert into t values ('code', r->>'code'), ('cred', r->>'host_credential');
end $$;

-- Wrong credential is rejected
do $$ begin
  begin perform public.host_get_state((select v from t where k='code'), 'nope');
        raise exception 'FAIL: wrong credential accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;

-- Unknown code
do $$ begin
  if public.get_public_state('ZZZZZZ')->>'error' <> 'not_found' then raise exception 'FAIL unknown code'; end if;
end $$;

-- C) Join with a name; duplicate names (case-insensitive) rejected
do $$ declare c text := (select v from t where k='code'); a jsonb; b jsonb; s jsonb;
begin
  a := public.join_session(c, '  Ana  ');
  b := public.join_session(lower(c), 'Ben');
  insert into t values ('ana', a->>'player_id'), ('ana_tok', a->>'player_token'), ('ben', b->>'player_id');
  begin perform public.join_session(c, 'ANA'); raise exception 'FAIL duplicate name';
  exception when raise_exception then if sqlerrm <> 'name_taken' then raise; end if; end;
  begin perform public.join_session(c, '<script>'); raise exception 'FAIL bad name';
  exception when raise_exception then if sqlerrm <> 'invalid_name' then raise; end if; end;
  s := public.host_get_state(c, (select v from t where k='cred'));
  if jsonb_array_length(s->'board'->'players') <> 2 then raise exception 'FAIL C players %', s->'board'; end if;
  if public.whoami(c, a->>'player_token')->>'name' <> 'Ana' then raise exception 'FAIL whoami'; end if;
end $$;

-- D) Manually added player, spectator
do $$ declare c text := (select v from t where k='code'); cr text := (select v from t where k='cred'); r jsonb;
begin
  r := public.host_add_player(c, cr, 'Carla');
  insert into t values ('carla', r->>'player_id');
  r := public.host_add_player(c, cr, 'Viewer', true);
  insert into t values ('viewer', r->>'player_id');
end $$;

-- Timer does not start in the lobby
do $$ begin
  if public.get_public_state((select v from t where k='code'))->'session'->>'expires_at' is not null then
    raise exception 'FAIL timer started early'; end if;
end $$;

-- E) Start a mystery, award a clue → points + public clue
do $$ declare c text := (select v from t where k='code'); cr text := (select v from t where k='cred');
  h jsonb; p jsonb; clue jsonb;
begin
  perform public.host_start_mystery(c, cr, 'MS-001');
  p := public.get_public_state(c);
  if p->'session'->>'expires_at' is null then raise exception 'FAIL timer not started'; end if;
  if p->'round'->>'solution' is not null then raise exception 'FAIL solution leaked'; end if;
  if jsonb_array_length(p->'round'->'revealed_clues') <> 0 then raise exception 'FAIL clues leaked'; end if;
  if p::text like '%squirrel%' or p::text like '%extractor%' then raise exception 'FAIL secret text in public payload'; end if;

  h := public.host_get_state(c, cr);
  clue := h->'round'->'clues'->0;           -- 3 points
  insert into t values ('clue1', clue->>'id'), ('clue2', h->'round'->'clues'->1->>'id');
  perform public.host_award_clue(c, cr, (clue->>'id')::uuid, (select v from t where k='ana')::uuid);

  p := public.get_public_state(c);
  if jsonb_array_length(p->'round'->'revealed_clues') <> 1 then raise exception 'FAIL E clue not public'; end if;
  if (select (x->>'score')::int from jsonb_array_elements(p->'board'->'players') x where x->>'name'='Ana') <> 3 then
    raise exception 'FAIL E score %', p->'board'; end if;

  -- each clue only once
  begin perform public.host_award_clue(c, cr, (clue->>'id')::uuid, (select v from t where k='ben')::uuid);
        raise exception 'FAIL double award';
  exception when raise_exception then if sqlerrm <> 'clue_already_awarded' then raise; end if; end;

  -- spectators cannot receive points; competitive requires a player
  begin perform public.host_award_clue(c, cr, (select v from t where k='clue2')::uuid, (select v from t where k='viewer')::uuid);
        raise exception 'FAIL spectator scored';
  exception when raise_exception then if sqlerrm <> 'invalid_player' then raise; end if; end;
  begin perform public.host_award_clue(c, cr, (select v from t where k='clue2')::uuid, null);
        raise exception 'FAIL null player in competitive';
  exception when raise_exception then if sqlerrm <> 'player_required' then raise; end if; end;

  -- a clue from another mystery is refused
  begin perform public.host_award_clue(c, cr, gen_random_uuid(), (select v from t where k='ben')::uuid);
        raise exception 'FAIL foreign clue';
  exception when raise_exception then if sqlerrm <> 'invalid_clue' then raise; end if; end;
end $$;

-- F) Un-tick reverses exactly the original player, then it can go to someone else
do $$ declare c text := (select v from t where k='code'); cr text := (select v from t where k='cred'); p jsonb;
begin
  perform public.host_revoke_clue(c, cr, (select v from t where k='clue1')::uuid);
  perform public.host_award_clue(c, cr, (select v from t where k='clue1')::uuid, (select v from t where k='ben')::uuid);
  p := public.get_public_state(c);
  if (select (x->>'score')::int from jsonb_array_elements(p->'board'->'players') x where x->>'name'='Ana') <> 0
  or (select (x->>'score')::int from jsonb_array_elements(p->'board'->'players') x where x->>'name'='Ben') <> 3 then
    raise exception 'FAIL F %', p->'board'; end if;
  if (select (x->>'clues')::int from jsonb_array_elements(p->'board'->'players') x where x->>'name'='Ben') <> 1 then
    raise exception 'FAIL F clue count'; end if;
end $$;

-- Bonuses: wrong guess (host decides), solve, reveal; reversing a penalty
do $$ declare c text := (select v from t where k='code'); cr text := (select v from t where k='cred');
  p jsonb; h jsonb; ev uuid;
begin
  perform public.host_award_bonus(c, cr, 'wrong_guess', (select v from t where k='carla')::uuid);
  h := public.host_get_state(c, cr);
  ev := (h->'events'->0->>'id')::uuid;
  perform public.host_reverse_event(c, cr, ev);
  begin perform public.host_reverse_event(c, cr, ev); raise exception 'FAIL double reverse';
  exception when raise_exception then if sqlerrm <> 'already_reversed' then raise; end if; end;

  perform public.host_award_bonus(c, cr, 'solve', (select v from t where k='ana')::uuid);
  begin perform public.host_award_bonus(c, cr, 'solve', (select v from t where k='ben')::uuid);
        raise exception 'FAIL double solve';
  exception when raise_exception then if sqlerrm <> 'already_solved' then raise; end if; end;

  p := public.get_public_state(c);
  if p->'round'->>'solution' is not null then raise exception 'FAIL solution before reveal'; end if;
  perform public.host_reveal_solution(c, cr);
  p := public.get_public_state(c);
  if p->'round'->>'solution' not like '%squirrel%' then raise exception 'FAIL reveal'; end if;
  if (select (x->>'score')::int from jsonb_array_elements(p->'board'->'players') x where x->>'name'='Carla') <> 0 then
    raise exception 'FAIL penalty reversal'; end if;
end $$;

-- G) Scores persist across mysteries; new mystery hides its own secrets
do $$ declare c text := (select v from t where k='code'); cr text := (select v from t where k='cred'); p jsonb;
begin
  perform public.host_close_mystery(c, cr);
  perform public.host_start_mystery(c, cr, 'MS-002');
  p := public.get_public_state(c);
  if (p->'round'->>'seq')::int <> 2 then raise exception 'FAIL G seq'; end if;
  if p->'round'->>'solution' is not null then raise exception 'FAIL G solution'; end if;
  if (select (x->>'score')::int from jsonb_array_elements(p->'board'->'players') x where x->>'name'='Ana') <> 15 then
    raise exception 'FAIL G persist %', p->'board'; end if;
end $$;

-- Manual player identity link: code → request → host approval
do $$ declare c text := (select v from t where k='code'); cr text := (select v from t where k='cred');
  lc jsonb; rq jsonb; h jsonb;
begin
  begin perform public.host_create_link_code(c, cr, (select v from t where k='ana')::uuid);
        raise exception 'FAIL link code for web player';
  exception when raise_exception then if sqlerrm <> 'invalid_player' then raise; end if; end;

  lc := public.host_create_link_code(c, cr, (select v from t where k='carla')::uuid);
  if public.request_link(c, '000000x')->>'error' <> 'invalid_code' then raise exception 'FAIL bad link code'; end if;
  rq := public.request_link(c, lc->>'link_code');
  if rq->>'name' <> 'Carla' then raise exception 'FAIL link name %', rq; end if;
  if public.whoami(c, rq->>'claim_token')->>'status' <> 'pending' then raise exception 'FAIL pending'; end if;
  -- code is single-use
  if public.request_link(c, lc->>'link_code')->>'error' <> 'invalid_code' then raise exception 'FAIL reuse'; end if;

  h := public.host_get_state(c, cr);
  perform public.host_resolve_link(c, cr, (h->'link_requests'->0->>'id')::uuid, true);
  if public.whoami(c, rq->>'claim_token')->>'name' <> 'Carla' then raise exception 'FAIL link approve'; end if;
end $$;

-- Rename / remove
do $$ declare c text := (select v from t where k='code'); cr text := (select v from t where k='cred');
begin
  begin perform public.host_rename_player(c, cr, (select v from t where k='ben')::uuid, 'ana');
        raise exception 'FAIL rename dup';
  exception when raise_exception then if sqlerrm <> 'name_taken' then raise; end if; end;
  perform public.host_rename_player(c, cr, (select v from t where k='ben')::uuid, 'Benji');
  perform public.host_remove_player(c, cr, (select v from t where k='viewer')::uuid);
  -- the removed name is free again
  perform public.host_add_player(c, cr, 'viewer');
end $$;

-- H) Manual end: results, and no further changes
do $$ declare c text := (select v from t where k='code'); cr text := (select v from t where k='cred'); p jsonb;
begin
  perform public.host_end_session(c, cr);
  p := public.get_public_state(c);
  if p->'session'->>'status' <> 'ended' or p->'session'->>'end_reason' <> 'host' then raise exception 'FAIL H status'; end if;
  if p->'board'->'winners' <> '["Ana"]'::jsonb then raise exception 'FAIL H winners %', p->'board'->'winners'; end if;
  begin perform public.host_add_player(c, cr, 'Late'); raise exception 'FAIL change after end';
  exception when raise_exception then if sqlerrm <> 'session_ended' then raise; end if; end;
  begin perform public.join_session(c, 'Late'); raise exception 'FAIL join after end';
  exception when raise_exception then if sqlerrm <> 'session_ended' then raise; end if; end;
  -- host can still read final state
  perform public.host_get_state(c, cr);
end $$;

-- Ties → shared victory; cooperative null scorer
do $$ declare r jsonb; c text; cr text; h jsonb; a jsonb; b jsonb; p jsonb;
begin
  r := public.create_session('competitive'); c := r->>'code'; cr := r->>'host_credential';
  a := public.join_session(c, 'Xavi'); b := public.join_session(c, 'Yara');
  perform public.host_start_mystery(c, cr, 'MS-003');
  h := public.host_get_state(c, cr);
  -- clue 1 and clue 2 are both worth 3
  perform public.host_award_clue(c, cr, (h->'round'->'clues'->0->>'id')::uuid, (a->>'player_id')::uuid);
  perform public.host_award_clue(c, cr, (h->'round'->'clues'->1->>'id')::uuid, (b->>'player_id')::uuid);
  perform public.host_end_session(c, cr);
  p := public.get_public_state(c);
  if p->'board'->'winners' <> '["Xavi", "Yara"]'::jsonb then raise exception 'FAIL tie %', p->'board'->'winners'; end if;

  r := public.create_session('cooperative', 10); c := r->>'code'; cr := r->>'host_credential';
  perform public.host_start_mystery(c, cr, 'MS-004');
  h := public.host_get_state(c, cr);
  perform public.host_award_clue(c, cr, (h->'round'->'clues'->0->>'id')::uuid, null);
  perform public.host_award_bonus(c, cr, 'solve', null);
  p := public.get_public_state(c);
  if (p->'board'->>'team_score')::int <> 18 or (p->'board'->>'team_success')::boolean is not true then
    raise exception 'FAIL coop %', p->'board'; end if;
  insert into t values ('coop', c), ('coop_cred', cr);
end $$;

reset role;

-- H) 60-minute limit: simulate the clock passing
update public.sessions set expires_at = now() - interval '1 second'
 where public_code = (select v from t where k='coop');

set role anon;
do $$ declare c text := (select v from t where k='coop'); p jsonb;
begin
  p := public.get_public_state(c);
  if p->'session'->>'status' <> 'ended' or p->'session'->>'end_reason' <> 'time_limit' then
    raise exception 'FAIL time limit %', p->'session'; end if;
  if (p->'board'->>'team_score')::int <> 18 then raise exception 'FAIL results kept'; end if;
  begin perform public.host_award_bonus(c, (select v from t where k='coop_cred'), 'partial', null);
        raise exception 'FAIL change after expiry';
  exception when raise_exception then if sqlerrm <> 'session_ended' then raise; end if; end;
end $$;

-- Rate limiting on code guessing
do $$ declare i int;
begin
  for i in 1..40 loop
    begin perform public.get_public_state('NOPE' || i);
    exception when raise_exception then
      if sqlerrm = 'rate_limited' and i >= 25 then return; end if; raise;
    end;
  end loop;
  raise exception 'FAIL no rate limit';
end $$;
reset role;

-- Realtime broadcasts carry no game data
do $$ begin
  if exists (select 1 from realtime.sent where payload ?| array['solution','clues','round','board']) then
    raise exception 'FAIL broadcast payload carries data'; end if;
  if not exists (select 1 from realtime.sent where event = 'state_changed' and not private) then
    raise exception 'FAIL no broadcast'; end if;
end $$;

-- Story Editor
select game_private.set_admin_key('test-admin-key-0123456789');
set role anon;
do $$ declare r jsonb; m jsonb; first_clue text; begin
  begin perform public.admin_list_mysteries('wrong'); raise exception 'FAIL admin with wrong key';
  exception when raise_exception then if sqlerrm <> 'not_admin' then raise; end if; end;
  if jsonb_array_length(public.admin_list_mysteries('test-admin-key-0123456789')) < 6 then raise exception 'FAIL admin list'; end if;

  -- create
  m := public.admin_save_mystery('test-admin-key-0123456789', jsonb_build_object(
    'title', 'The Test Case', 'category', 'Office', 'difficulty', 'Easy',
    'prompt', 'Something odd happened in the office kitchen this morning.',
    'solution', 'Someone left the fridge door open overnight.',
    'clues', jsonb_build_array(
       jsonb_build_object('text', 'It involves the fridge.', 'points', 3),
       jsonb_build_object('text', 'It happened overnight.', 'points', 2),
       jsonb_build_object('text', 'Nobody did it on purpose.', 'points', 2))));
  if m->>'id' <> 'MS-007' or jsonb_array_length(m->'clues') <> 3 then raise exception 'FAIL create %', m; end if;
  first_clue := m->'clues'->0->>'id';

  -- edit: reorder, change points, drop one clue, add one
  m := public.admin_save_mystery('test-admin-key-0123456789', jsonb_build_object(
    'id', 'MS-007', 'title', 'The Test Case', 'category', 'Office', 'difficulty', 'Medium',
    'prompt', 'Something odd happened in the office kitchen this morning.',
    'solution', 'Someone left the fridge door open overnight.', 'active', false,
    'clues', jsonb_build_array(
       jsonb_build_object('text', 'Nobody did it on purpose.', 'points', 2),
       jsonb_build_object('id', first_clue, 'text', 'It involves the fridge.', 'points', 5),
       jsonb_build_object('text', 'The door was left open.', 'points', 3))));
  if m->'clues'->1->>'id' <> first_clue or (m->'clues'->1->>'points')::int <> 5
     or m->>'difficulty' <> 'Medium' or (m->>'active')::boolean then raise exception 'FAIL edit %', m; end if;

  -- validation
  begin perform public.admin_save_mystery('test-admin-key-0123456789', jsonb_build_object(
      'title', 'x', 'category', 'y', 'difficulty', 'Easy', 'prompt', 'too short', 'solution', 'too short',
      'clues', '[]'::jsonb)); raise exception 'FAIL validation';
  exception when raise_exception then if sqlerrm not like 'invalid_%' then raise; end if; end;

  -- image round trip
  r := public.admin_upload_image('test-admin-key-0123456789', 'MS-007', 'image/png', encode('fakepng'::bytea, 'base64'));
  if r->>'image' not like 'db:MS-007:%' then raise exception 'FAIL image path'; end if;
  if decode(public.get_mystery_image('MS-007')->>'data', 'base64') <> 'fakepng'::bytea then raise exception 'FAIL image data'; end if;

  -- archived mysteries can't be started
  r := public.create_session('competitive');
  begin perform public.host_start_mystery(r->>'code', r->>'host_credential', 'MS-007'); raise exception 'FAIL archived started';
  exception when raise_exception then if sqlerrm <> 'invalid_mystery' then raise; end if; end;

  -- played mysteries can't be deleted; unplayed can
  begin perform public.admin_delete_mystery('test-admin-key-0123456789', 'MS-001'); raise exception 'FAIL deleted played';
  exception when raise_exception then if sqlerrm <> 'mystery_used' then raise; end if; end;
  perform public.admin_delete_mystery('test-admin-key-0123456789', 'MS-007');
end $$;
reset role;

-- Housekeeping: a finished session with players, awards and reversals deletes cleanly
update public.sessions set created_at = now() - interval '8 days' where public_code = (select v from t where k='code');
select game_private.cleanup();
do $$ begin
  if exists (select 1 from public.sessions where public_code = (select v from t where k='code')) then
    raise exception 'FAIL cleanup did not delete old session'; end if;
end $$;

select 'ALL ACCEPTANCE TESTS PASSED' as result;

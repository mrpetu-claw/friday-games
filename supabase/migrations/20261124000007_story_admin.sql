-- Story Editor: admin-managed mysteries, clues and images.
-- Admin access uses a single admin key (stored as a SHA-256 hash). Set or
-- rotate it from the Supabase SQL Editor:
--   select game_private.set_admin_key('your-long-random-key');

create table public.admin_credentials (
  id         int primary key default 1 check (id = 1),
  key_hash   bytea not null,
  created_at timestamptz not null default now()
);

create table public.mystery_images (
  mystery_id text primary key references public.mysteries(id) on delete cascade,
  mime       text not null check (mime in ('image/webp', 'image/jpeg', 'image/png')),
  data       bytea not null,
  updated_at timestamptz not null default now()
);

alter table public.mysteries add column if not exists updated_at timestamptz not null default now();

alter table public.admin_credentials enable row level security;
alter table public.mystery_images    enable row level security;
revoke all on public.admin_credentials, public.mystery_images from anon, authenticated;

create or replace function game_private.set_admin_key(p_key text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if length(coalesce(p_key, '')) < 16 then perform game_private.fail('key_too_short'); end if;
  insert into public.admin_credentials (id, key_hash) values (1, game_private.hash_token(p_key))
  on conflict (id) do update set key_hash = excluded.key_hash, created_at = now();
end $$;

create or replace function game_private.auth_admin(p_key text) returns void
language plpgsql as $$
begin
  if not exists (select 1 from public.admin_credentials
                  where id = 1 and key_hash = game_private.hash_token(p_key)) then
    perform game_private.fail('not_admin');
  end if;
end $$;

create or replace function game_private.mystery_admin_json(m public.mysteries) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', m.id, 'title', m.title, 'category', m.category, 'difficulty', m.difficulty,
    'prompt', m.public_prompt, 'solution', m.private_solution, 'image', m.image_path,
    'active', m.active, 'updated_at', m.updated_at,
    'times_played', (select count(*) from public.rounds r where r.mystery_id = m.id),
    'in_play', exists (select 1 from public.rounds r where r.mystery_id = m.id and r.status = 'active'),
    'clues', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'text', c.text, 'points', c.points)
                                        order by c.sort_order)
                         from public.clues c where c.mystery_id = m.id), '[]'::jsonb))
$$;

-- ---------------------------------------------------------------- admin RPCs
create or replace function public.admin_list_mysteries(p_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform game_private.auth_admin(p_key);
  return coalesce((select jsonb_agg(game_private.mystery_admin_json(m) order by m.id)
                     from public.mysteries m), '[]'::jsonb);
end $$;

-- Creates (no id) or updates a mystery and its clues in one transaction.
-- p_mystery: {id?, title, category, difficulty, prompt, solution, active,
--             clues: [{id?, text, points}, ...]}  (clue order = array order)
create or replace function public.admin_save_mystery(p_key text, p_mystery jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id text := nullif(trim(p_mystery ->> 'id'), '');
  v_title text := trim(coalesce(p_mystery ->> 'title', ''));
  v_category text := trim(coalesce(p_mystery ->> 'category', ''));
  v_difficulty text := p_mystery ->> 'difficulty';
  v_prompt text := trim(coalesce(p_mystery ->> 'prompt', ''));
  v_solution text := trim(coalesce(p_mystery ->> 'solution', ''));
  v_active boolean := coalesce((p_mystery ->> 'active')::boolean, true);
  v_clues jsonb := coalesce(p_mystery -> 'clues', '[]'::jsonb);
  v_keep uuid[] := '{}';
  c jsonb;
  i int := 0;
  v_clue_id uuid;
  m public.mysteries;
begin
  perform game_private.auth_admin(p_key);

  if length(v_title) not between 1 and 80 then perform game_private.fail('invalid_title'); end if;
  if length(v_category) not between 1 and 40 then perform game_private.fail('invalid_category'); end if;
  if v_difficulty not in ('Easy', 'Medium', 'Hard') then perform game_private.fail('invalid_difficulty'); end if;
  if length(v_prompt) not between 20 and 1200 then perform game_private.fail('invalid_prompt'); end if;
  if length(v_solution) not between 20 and 2000 then perform game_private.fail('invalid_solution'); end if;
  if jsonb_typeof(v_clues) <> 'array' or jsonb_array_length(v_clues) not between 3 and 8 then
    perform game_private.fail('invalid_clue_count');
  end if;
  for c in select * from jsonb_array_elements(v_clues) loop
    if length(trim(coalesce(c ->> 'text', ''))) not between 3 and 240 then perform game_private.fail('invalid_clue_text'); end if;
    if coalesce((c ->> 'points')::int, 0) not between 1 and 10 then perform game_private.fail('invalid_clue_points'); end if;
  end loop;

  if v_id is null then
    -- next free id: MS-007, MS-008, ...
    select 'MS-' || lpad((coalesce(max(substring(id from 4)::int), 0) + 1)::text, 3, '0') into v_id
      from public.mysteries where id ~ '^MS-[0-9]+$';
    insert into public.mysteries (id, title, category, difficulty, public_prompt, image_path, private_solution, active)
    values (v_id, v_title, v_category, v_difficulty, v_prompt, '', v_solution, v_active);
  else
    if exists (select 1 from public.rounds where mystery_id = v_id and status = 'active') then
      perform game_private.fail('mystery_in_play');
    end if;
    update public.mysteries set title = v_title, category = v_category, difficulty = v_difficulty,
           public_prompt = v_prompt, private_solution = v_solution, active = v_active, updated_at = now()
     where id = v_id;
    if not found then perform game_private.fail('invalid_mystery'); end if;
  end if;

  -- Move existing clues out of the way so the new order can't collide
  update public.clues set sort_order = -sort_order - 1000 where mystery_id = v_id;

  for c in select * from jsonb_array_elements(v_clues) loop
    i := i + 1;
    v_clue_id := null;
    if nullif(c ->> 'id', '') is not null then
      update public.clues set text = trim(c ->> 'text'), points = (c ->> 'points')::int, sort_order = i
       where id = (c ->> 'id')::uuid and mystery_id = v_id
       returning id into v_clue_id;
    end if;
    if v_clue_id is null then
      insert into public.clues (mystery_id, sort_order, points, text)
      values (v_id, i, (c ->> 'points')::int, trim(c ->> 'text'))
      returning id into v_clue_id;
    end if;
    v_keep := v_keep || v_clue_id;
  end loop;

  delete from public.clues where mystery_id = v_id and not (id = any (v_keep));

  select * into m from public.mysteries where id = v_id;
  return game_private.mystery_admin_json(m);
end $$;

-- Image as base64 (the editor resizes and converts it to WebP first). Max 1.5 MB.
create or replace function public.admin_upload_image(p_key text, p_mystery_id text, p_mime text, p_base64 text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_data bytea;
  v_path text;
begin
  perform game_private.auth_admin(p_key);
  if p_mime not in ('image/webp', 'image/jpeg', 'image/png') then perform game_private.fail('invalid_image'); end if;
  begin
    v_data := decode(p_base64, 'base64');
  exception when others then
    perform game_private.fail('invalid_image');
  end;
  if octet_length(v_data) > 1572864 then perform game_private.fail('image_too_large'); end if;
  if not exists (select 1 from public.mysteries where id = p_mystery_id) then perform game_private.fail('invalid_mystery'); end if;

  insert into public.mystery_images (mystery_id, mime, data, updated_at)
  values (p_mystery_id, p_mime, v_data, now())
  on conflict (mystery_id) do update set mime = excluded.mime, data = excluded.data, updated_at = now();

  -- "db:<id>:<version>" tells the app to load the picture through get_mystery_image
  v_path := 'db:' || p_mystery_id || ':' || floor(extract(epoch from now()))::bigint;
  update public.mysteries set image_path = v_path, updated_at = now() where id = p_mystery_id;
  return jsonb_build_object('image', v_path);
end $$;

-- Only mysteries that were never played can be deleted; otherwise archive them.
create or replace function public.admin_delete_mystery(p_key text, p_mystery_id text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform game_private.auth_admin(p_key);
  if exists (select 1 from public.rounds where mystery_id = p_mystery_id) then
    perform game_private.fail('mystery_used');
  end if;
  delete from public.mysteries where id = p_mystery_id;
end $$;

-- Pictures are not secret (they never show the solution), so anyone can load them.
create or replace function public.get_mystery_image(p_mystery_id text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('mime', mime, 'data', encode(data, 'base64'))
    from public.mystery_images where mystery_id = p_mystery_id
$$;

revoke all on function
  public.admin_list_mysteries(text), public.admin_save_mystery(text, jsonb),
  public.admin_upload_image(text, text, text, text), public.admin_delete_mystery(text, text),
  public.get_mystery_image(text)
from public;
revoke all on all functions in schema game_private from public, anon, authenticated;
grant execute on function
  public.admin_list_mysteries(text), public.admin_save_mystery(text, jsonb),
  public.admin_upload_image(text, text, text, text), public.admin_delete_mystery(text, text),
  public.get_mystery_image(text)
to anon, authenticated;

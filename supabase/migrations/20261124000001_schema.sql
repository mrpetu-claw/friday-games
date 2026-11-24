-- Friday Games — schema
-- All tables live in `public` with RLS enabled and NO policies: the anon and
-- authenticated roles cannot read or write any table directly. Every read and
-- write goes through SECURITY DEFINER functions (see 0002_functions.sql) that
-- validate the public code / host credential and return only what the caller
-- is allowed to see.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists game_private;
revoke all on schema game_private from public;

-- ---------------------------------------------------------------- sessions
create table public.sessions (
  id               uuid primary key default gen_random_uuid(),
  public_code      text not null unique,
  game             text not null default 'mystery_stories',
  mode             text not null check (mode in ('competitive', 'cooperative')),
  status           text not null default 'lobby' check (status in ('lobby', 'active', 'ended')),
  settings         jsonb not null,
  created_at       timestamptz not null default now(),
  started_at       timestamptz,           -- first Start Mystery (decision: timer starts here)
  expires_at       timestamptz,           -- started_at + duration
  ended_at         timestamptz,
  end_reason       text check (end_reason in ('host', 'time_limit')),
  current_round_id uuid,
  version          bigint not null default 0   -- bumped on every change; clients refetch when it moves
);

create table public.host_credentials (
  session_id      uuid primary key references public.sessions(id) on delete cascade,
  credential_hash bytea not null,
  created_at      timestamptz not null default now(),
  revoked_at      timestamptz
);

-- ---------------------------------------------------------------- players
create table public.players (
  id                   uuid primary key default gen_random_uuid(),
  session_id           uuid not null references public.sessions(id) on delete cascade,
  display_name         text not null,
  role                 text not null default 'player' check (role in ('player', 'spectator')),
  join_method          text not null check (join_method in ('web', 'manual')),
  reconnect_token_hash bytea,
  status               text not null default 'active' check (status in ('active', 'removed')),
  created_at           timestamptz not null default now(),
  linked_at            timestamptz
);
-- Unique, case-insensitive names among active players of a session
create unique index players_unique_name
  on public.players (session_id, lower(display_name)) where status = 'active';
create index players_session on public.players (session_id);

-- One-time codes the host gives a manually added player so they can claim
-- their identity later. Claiming creates a link request the host must approve.
create table public.link_codes (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references public.players(id) on delete cascade,
  code_hash  bytea not null,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index link_codes_player on public.link_codes (player_id);

create table public.link_requests (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references public.sessions(id) on delete cascade,
  player_id        uuid not null references public.players(id) on delete cascade,
  claim_token_hash bytea not null unique,
  status           text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at       timestamptz not null default now(),
  decided_at       timestamptz
);

-- ---------------------------------------------------------------- content
create table public.mysteries (
  id               text primary key,               -- e.g. MS-001
  title            text not null,
  category         text not null,
  difficulty       text not null check (difficulty in ('Easy', 'Medium', 'Hard')),
  public_prompt    text not null,
  image_path       text not null,                  -- relative to the web app's base URL
  private_solution text not null,
  active           boolean not null default true
);

create table public.clues (
  id         uuid primary key default gen_random_uuid(),
  mystery_id text not null references public.mysteries(id) on delete cascade,
  text       text not null,
  points     int  not null check (points between 0 and 50),
  sort_order int  not null,
  unique (mystery_id, sort_order)
);

-- ---------------------------------------------------------------- play
create table public.rounds (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.sessions(id) on delete cascade,
  mystery_id   text not null references public.mysteries(id),
  seq          int  not null,
  status       text not null default 'active' check (status in ('active', 'closed')),
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  solved_at    timestamptz,
  solved_by    uuid references public.players(id),
  revealed_at  timestamptz,
  unique (session_id, seq)
);
-- At most one active round per session
create unique index rounds_one_active on public.rounds (session_id) where status = 'active';

alter table public.sessions
  add constraint sessions_current_round_fk
  foreign key (current_round_id) references public.rounds(id) on delete set null;

create table public.score_events (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.sessions(id) on delete cascade,
  round_id          uuid references public.rounds(id) on delete cascade,
  player_id         uuid references public.players(id),   -- null = team (cooperative)
  amount            int  not null,
  reason            text not null check (reason in ('clue', 'partial', 'solve', 'wrong_guess', 'reversal')),
  clue_id           uuid references public.clues(id),
  reversed_event_id uuid references public.score_events(id),
  created_at        timestamptz not null default now()
);
create index score_events_session on public.score_events (session_id);
-- An event can be reversed only once
create unique index score_events_reverse_once
  on public.score_events (reversed_event_id) where reversed_event_id is not null;

create table public.clue_awards (
  id             uuid primary key default gen_random_uuid(),
  round_id       uuid not null references public.rounds(id) on delete cascade,
  clue_id        uuid not null references public.clues(id),
  player_id      uuid references public.players(id),       -- null allowed in cooperative mode
  score_event_id uuid not null references public.score_events(id),
  awarded_at     timestamptz not null default now(),
  revoked_at     timestamptz
);
-- Each clue awarded at most once per round (while not revoked)
create unique index clue_awards_once
  on public.clue_awards (round_id, clue_id) where revoked_at is null;

-- ---------------------------------------------------------------- rate limiting
create table public.rate_limits (
  key          text primary key,
  window_start timestamptz not null,
  hits         int not null
);

-- ---------------------------------------------------------------- lock down
alter table public.sessions         enable row level security;
alter table public.host_credentials enable row level security;
alter table public.players          enable row level security;
alter table public.link_codes       enable row level security;
alter table public.link_requests    enable row level security;
alter table public.mysteries        enable row level security;
alter table public.clues            enable row level security;
alter table public.rounds           enable row level security;
alter table public.score_events     enable row level security;
alter table public.clue_awards      enable row level security;
alter table public.rate_limits      enable row level security;

-- No policies are created on purpose. Belt and braces: also revoke grants.
revoke all on all tables in schema public from anon, authenticated;

-- Deleting a session (manual or game_private.cleanup) must remove everything
-- that belongs to it. Some foreign keys pointed at players / clues / events
-- without ON DELETE rules, which blocked the delete.

alter table public.clue_awards
  drop constraint clue_awards_player_id_fkey,
  add  constraint clue_awards_player_id_fkey foreign key (player_id) references public.players(id) on delete cascade,
  drop constraint clue_awards_score_event_id_fkey,
  add  constraint clue_awards_score_event_id_fkey foreign key (score_event_id) references public.score_events(id) on delete cascade,
  drop constraint clue_awards_clue_id_fkey,
  add  constraint clue_awards_clue_id_fkey foreign key (clue_id) references public.clues(id) on delete cascade;

alter table public.score_events
  drop constraint score_events_player_id_fkey,
  add  constraint score_events_player_id_fkey foreign key (player_id) references public.players(id) on delete cascade,
  drop constraint score_events_reversed_event_id_fkey,
  add  constraint score_events_reversed_event_id_fkey foreign key (reversed_event_id) references public.score_events(id) on delete cascade,
  drop constraint score_events_clue_id_fkey,
  add  constraint score_events_clue_id_fkey foreign key (clue_id) references public.clues(id) on delete set null;

alter table public.rounds
  drop constraint rounds_solved_by_fkey,
  add  constraint rounds_solved_by_fkey foreign key (solved_by) references public.players(id) on delete set null;

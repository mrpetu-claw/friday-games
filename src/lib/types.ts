// Contracts returned by the Supabase RPCs (see supabase/migrations/*_functions.sql).

export type Mode = 'competitive' | 'cooperative'
export type SessionStatus = 'lobby' | 'active' | 'ended'

export interface SessionInfo {
  code: string
  game: string
  mode: Mode
  status: SessionStatus
  created_at: string
  started_at: string | null
  expires_at: string | null
  ended_at: string | null
  end_reason: 'host' | 'time_limit' | null
  version: number
  server_now: string
  settings: {
    partial: number
    solve: number
    wrong_guess: number
    coop_target: number
    duration_minutes: number
  }
}

export interface BoardPlayer {
  id: string
  name: string
  role: 'player' | 'spectator'
  join_method: 'web' | 'manual'
  linked: boolean
  score: number
  clues: number
}

export interface Board {
  players: BoardPlayer[]
  team_score: number
  mysteries_played: number
  mysteries_solved: number
  winners: string[] | null
  team_success: boolean | null
}

export interface RevealedClue {
  id: string
  text: string
  points: number
  player: string | null
  awarded_at: string
}

export interface PublicRound {
  id: string
  seq: number
  status: 'active' | 'closed'
  started_at: string
  ended_at: string | null
  solved: boolean
  solved_by: string | null
  mystery: {
    id: string
    title: string
    category: string
    difficulty: 'Easy' | 'Medium' | 'Hard'
    prompt: string
    image: string
  }
  clue_count: number
  revealed_clues: RevealedClue[]
  solution: string | null
}

export interface PublicState {
  session: SessionInfo
  round: PublicRound | null
  board: Board
}

export interface HostClue {
  id: string
  text: string
  points: number
  sort_order: number
  award: { id: string; player_id: string | null; player: string | null; awarded_at: string } | null
}

export interface HostRound extends PublicRound {
  solution: string
  revealed: boolean
  clues: HostClue[]
}

export interface CatalogEntry {
  id: string
  title: string
  category: string
  difficulty: string
  played: boolean
}

export interface ScoreEvent {
  id: string
  reason: 'clue' | 'partial' | 'solve' | 'wrong_guess' | 'reversal'
  amount: number
  player: string | null
  round_seq: number | null
  clue: string | null
  created_at: string
  reversed: boolean
  reverses: string | null
}

export interface LinkRequest {
  id: string
  player_id: string
  player: string
  created_at: string
}

export interface HostState {
  session: SessionInfo
  board: Board
  round: HostRound | null
  catalog: CatalogEntry[]
  link_requests: LinkRequest[]
  events: ScoreEvent[]
}

export type WhoAmI =
  | { status: 'player'; player_id: string; name: string; role: 'player' | 'spectator' }
  | { status: 'pending' | 'rejected' | 'removed' | 'unknown' }

export interface AdminClue {
  id?: string
  text: string
  points: number
}

export interface AdminMystery {
  id?: string
  title: string
  category: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  prompt: string
  solution: string
  image?: string
  active: boolean
  updated_at?: string
  times_played?: number
  in_play?: boolean
  clues: AdminClue[]
}

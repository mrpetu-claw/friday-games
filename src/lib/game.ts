// Pure helpers shared by the views (unit-tested in game.test.ts).
import type { Board, BoardPlayer, SessionInfo } from './types'

/** Players only (no spectators), highest score first, ties sharing a rank. */
export function rankPlayers(players: BoardPlayer[]): (BoardPlayer & { rank: number })[] {
  const sorted = players
    .filter((p) => p.role === 'player')
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  let rank = 0
  let prev: number | null = null
  return sorted.map((p, i) => {
    if (p.score !== prev) rank = i + 1
    prev = p.score
    return { ...p, rank }
  })
}

/** Milliseconds the client clock is behind the server clock. */
export function clockOffset(session: SessionInfo, clientNow = Date.now()): number {
  return new Date(session.server_now).getTime() - clientNow
}

/** Remaining ms of the session, or null if the timer has not started. */
export function remainingMs(session: SessionInfo, offset: number, clientNow = Date.now()): number | null {
  if (!session.expires_at) return null
  if (session.status === 'ended') return 0
  const left = new Date(session.expires_at).getTime() - (clientNow + offset)
  return Math.min(session.settings.duration_minutes * 60_000, Math.max(0, left))
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function resultHeadline(session: SessionInfo, board: Board): string {
  if (session.mode === 'cooperative') {
    return board.team_success
      ? `Team goal reached: ${board.team_score} / ${session.settings.coop_target} points!`
      : `Team scored ${board.team_score} of ${session.settings.coop_target} points.`
  }
  const winners = board.winners ?? []
  if (winners.length === 0) return 'No points were scored — everybody’s still a suspect.'
  if (winners.length === 1) return `${winners[0]} wins!`
  return `Shared victory: ${winners.slice(0, -1).join(', ')} and ${winners[winners.length - 1]}!`
}

export function normaliseCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}

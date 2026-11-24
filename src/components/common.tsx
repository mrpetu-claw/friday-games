import { useState, type ReactNode } from 'react'
import { clockOffset, formatClock, rankPlayers, remainingMs } from '../lib/game'
import type { Board, SessionInfo } from '../lib/types'
import { useNow, type Connection } from '../lib/useLiveState'

export function Timer({ session }: { session: SessionInfo }) {
  const now = useNow()
  const [offset] = useState(() => clockOffset(session))
  const ms = remainingMs(session, offset, now)
  if (ms === null) return <span className="timer muted" aria-label="Timer not started">60:00</span>
  const low = ms < 5 * 60 * 1000
  return (
    <span className={`timer ${low ? 'timer-low' : ''}`} role="timer" aria-label={`${formatClock(ms)} remaining`}>
      {formatClock(ms)}
    </span>
  )
}

export function ConnectionBadge({ connection }: { connection: Connection }) {
  if (connection === 'live') return <span className="badge badge-live" title="Live updates on">● Live</span>
  return (
    <span className="badge badge-warn" title="Trying to reconnect; updates may be delayed">
      ● {connection === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
    </span>
  )
}

export function Scoreboard({
  session,
  board,
  highlightId,
}: {
  session: SessionInfo
  board: Board
  highlightId?: string | null
}) {
  if (session.mode === 'cooperative') {
    const target = session.settings.coop_target
    const pct = Math.min(100, Math.round((board.team_score / target) * 100))
    const players = board.players.filter((p) => p.role === 'player')
    return (
      <section className="card" aria-labelledby="team-heading">
        <h2 id="team-heading">Team score</h2>
        <div className="team-score">
          <strong>{board.team_score}</strong> <span className="muted">/ {target} goal</span>
        </div>
        <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${pct}%` }} />
        </div>
        <p className="muted small">
          {board.mysteries_solved} solved · {players.length} detective{players.length === 1 ? '' : 's'}
          {players.length > 0 && `: ${players.map((p) => p.name).join(', ')}`}
        </p>
      </section>
    )
  }
  const ranked = rankPlayers(board.players)
  return (
    <section className="card" aria-labelledby="board-heading">
      <h2 id="board-heading">Scoreboard</h2>
      {ranked.length === 0 ? (
        <p className="muted">Waiting for detectives to join…</p>
      ) : (
        <ol className="board">
          {ranked.map((p) => (
            <li key={p.id} className={p.id === highlightId ? 'me' : ''}>
              <span className="rank">{p.rank}</span>
              <span className="name">
                {p.name}
                {p.id === highlightId && <span className="you"> (you)</span>}
              </span>
              <span className="clues muted small" title="Clues found">
                🔍 {p.clues}
              </span>
              <span className="score">{p.score}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

export function Shell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className={`shell ${wide ? 'shell-wide' : ''}`}>
      <header className="topbar">
        <a href="#/" className="brand">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={28} height={28} /> Friday Games
        </a>
      </header>
      <main>{children}</main>
    </div>
  )
}

export function ErrorNote({ message }: { message: string | null | undefined }) {
  if (!message) return null
  return (
    <p className="error" role="alert">
      {message}
    </p>
  )
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <p className="muted" aria-live="polite">
      {label}
    </p>
  )
}

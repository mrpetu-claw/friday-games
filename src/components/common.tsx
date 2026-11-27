import { Crown, Timer as TimerIcon, Wifi, WifiOff } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { GameError } from '../lib/api'
import { clockOffset, formatClock, rankPlayers, remainingMs } from '../lib/game'
import type { Board, SessionInfo } from '../lib/types'
import { useNow, type Connection } from '../lib/useLiveState'

export function Timer({ session }: { session: SessionInfo }) {
  const now = useNow()
  const [offset] = useState(() => clockOffset(session))
  const ms = remainingMs(session, offset, now)
  if (session.status === 'ended') return <span className="timer muted">Ended</span>
  if (ms === null)
    return (
      <span className="timer muted" aria-label="Timer not started">
        <TimerIcon size={18} aria-hidden="true" /> 60:00
      </span>
    )
  const low = ms < 5 * 60 * 1000
  return (
    <span className={`timer ${low ? 'timer-low' : ''}`} role="timer" aria-label={`${formatClock(ms)} remaining`}>
      <TimerIcon size={18} aria-hidden="true" /> {formatClock(ms)}
    </span>
  )
}

export function ConnectionBadge({ connection }: { connection: Connection }) {
  if (connection === 'live')
    return (
      <span className="badge badge-live" title="Live updates on">
        <Wifi size={14} aria-hidden="true" /> Live
      </span>
    )
  return (
    <span className="badge badge-warn" title="Trying to reconnect; updates may be delayed">
      <WifiOff size={14} aria-hidden="true" /> {connection === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
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
      <section className="board-panel" aria-labelledby="team-heading">
        <h2 id="team-heading">Team score</h2>
        <p className="team-score">
          <strong>{board.team_score}</strong>
          <span>of {target} points</span>
        </p>
        <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to the team goal">
          <div style={{ transform: `scaleX(${pct / 100})` }} />
        </div>
        <p className="board-foot">
          {board.mysteries_solved} solved so far.
          {players.length > 0 && <> Detectives: {players.map((p) => p.name).join(', ')}.</>}
        </p>
      </section>
    )
  }
  const ranked = rankPlayers(board.players)
  const best = Math.max(1, ...ranked.map((p) => p.score))
  return (
    <section className="board-panel" aria-labelledby="board-heading">
      <h2 id="board-heading">Scoreboard</h2>
      {ranked.length === 0 ? (
        <p className="board-foot">Waiting for detectives to join.</p>
      ) : (
        <ol className="board">
          {ranked.map((p) => (
            <li key={p.id} className={p.id === highlightId ? 'me' : ''}>
              <span className="rank">{p.rank === 1 && p.score > 0 ? <Crown size={18} aria-label="1st" /> : p.rank}</span>
              <span className="name">
                {p.name}
                {p.id === highlightId && <span className="you"> (you)</span>}
              </span>
              <span className="score">{p.score}</span>
              <span className="bar" aria-hidden="true">
                <span style={{ transform: `scaleX(${Math.max(0, p.score / best)})` }} />
              </span>
              <span className="clues-found">
                {p.clues} {p.clues === 1 ? 'clue' : 'clues'}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

export function Shell({ children, wide, home = '#/' }: { children: ReactNode; wide?: boolean; home?: string }) {
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className={`page ${wide ? 'page-wide' : ''}`}>
          <a href={home} className="brand">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={28} height={28} /> Friday Games
          </a>
        </div>
      </header>
      <main id="main" tabIndex={-1} className={`page ${wide ? 'page-wide' : ''}`}>
        {children}
      </main>
    </div>
  )
}

/**
 * Error message: what happened and what to do. Unknown/technical errors also get
 * a "Copy error details" button for support instead of raw codes in the UI.
 */
export function ErrorNote({ error, message }: { error?: GameError | null; message?: string | null }) {
  const [copied, setCopied] = useState(false)
  const [shown, setShown] = useState<string | null>(null)
  const text = error?.message ?? message
  if (!text) return null
  const technical = error && !error.known
  return (
    <div className="error" role="alert">
      <p>{text}</p>
      {technical && (
        <button
          type="button"
          className="btn btn-small"
          onClick={async () => {
            const details = `Friday Games error: ${error.code}\nPage: ${window.location.href}\nTime: ${new Date().toISOString()}`
            try {
              await navigator.clipboard.writeText(details)
              setCopied(true)
            } catch {
              setShown(details)
            }
          }}
        >
          {copied ? 'Copied' : 'Copy error details'}
        </button>
      )}
      {shown && <textarea readOnly rows={3} value={shown} aria-label="Error details" ref={(el) => el?.select()} />}
    </div>
  )
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <p className="muted" aria-live="polite">
      {label}
    </p>
  )
}

/** Skeleton in the shape of the case sheet + scoreboard, for loads that take a moment. */
export function PageSkeleton() {
  return (
    <div className="play-grid skeleton" aria-busy="true" aria-label="Loading the game">
      <div className="sheet">
        <div className="sk sk-art" />
        <div className="sk sk-line w-40" />
        <div className="sk sk-title" />
        <div className="sk sk-line" />
        <div className="sk sk-line w-80" />
        <div className="sk sk-line w-60" />
      </div>
      <div className="board-panel">
        <div className="sk sk-dark sk-line w-60" />
        <div className="sk sk-dark sk-line" />
        <div className="sk sk-dark sk-line w-80" />
      </div>
    </div>
  )
}

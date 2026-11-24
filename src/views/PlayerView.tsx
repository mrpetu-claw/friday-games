import { useEffect, useState } from 'react'
import { ConnectionBadge, ErrorNote, Loading, Scoreboard, Shell, Timer } from '../components/common'
import { getPublicState, whoami } from '../lib/api'
import { resultHeadline } from '../lib/game'
import { routeUrl } from '../lib/router'
import { MysteryImage } from '../components/MysteryImage'
import { playerToken } from '../lib/storage'
import { useLiveState } from '../lib/useLiveState'

// Public screen: safe to share in Teams. It only ever receives the public
// payload — no solution until Reveal, no unrevealed clues, no keys.
export default function PlayerView({ code }: { code: string }) {
  const { data, error, connection } = useLiveState(code, () => getPublicState(code))
  const [me, setMe] = useState<{ id: string; name: string } | null>(null)
  const version = data?.session.version

  useEffect(() => {
    const token = playerToken.get(code)
    if (!token) return
    whoami(code, token)
      .then((w) => setMe(w.status === 'player' ? { id: w.player_id, name: w.name } : null))
      .catch(() => undefined)
  }, [code, version])

  if (!data) {
    return (
      <Shell wide>
        {error?.code === 'not_found' ? (
          <section className="card narrow">
            <h1>Game not found</h1>
            <p>
              There’s no game with code <strong>{code}</strong>. It may have finished and been cleaned up. Ask the host for
              the current link.
            </p>
            <a className="btn btn-primary" href="#/">
              Go to the home page
            </a>
          </section>
        ) : error ? (
          <ErrorNote message={error.message} />
        ) : (
          <Loading label="Opening the case file…" />
        )}
      </Shell>
    )
  }

  const { session, round, board } = data
  const joinLink = routeUrl(`/join/${session.code}`)

  return (
    <Shell wide>
      <div className="statusbar">
        <span className="code-chip" aria-label={`Game code ${session.code}`}>
          Code <strong>{session.code}</strong>
        </span>
        <span className="muted small">{session.mode === 'competitive' ? 'Competitive' : 'Cooperative'}</span>
        {me && <span className="badge">Playing as {me.name}</span>}
        <span className="spacer" />
        <ConnectionBadge connection={connection} />
        <Timer session={session} />
      </div>

      {session.status === 'ended' && (
        <section className="card result" aria-live="polite">
          <p className="eyebrow">{session.end_reason === 'time_limit' ? 'Time’s up' : 'Case closed'}</p>
          <h1>{resultHeadline(session, board)}</h1>
          <p className="muted">
            {board.mysteries_solved} of {board.mysteries_played} mysteries solved.
          </p>
        </section>
      )}

      <div className="play-grid">
        <div>
          {!round ? (
            <section className="card lobby">
              <h1>Waiting for the first mystery…</h1>
              <p>
                Join from your phone or laptop at <span className="mono">{joinLink}</span> with code{' '}
                <strong className="mono">{session.code}</strong>.
              </p>
            </section>
          ) : (
            <article className="card mystery" aria-live="polite">
              <MysteryImage path={round.mystery.image} className="mystery-art" />
              <div className="mystery-meta">
                <span className="pill">Mystery {round.seq}</span>
                <span className="pill">{round.mystery.category}</span>
                <span className={`pill diff-${round.mystery.difficulty.toLowerCase()}`}>{round.mystery.difficulty}</span>
                {round.solved && <span className="pill pill-good">Solved{round.solved_by ? ` by ${round.solved_by}` : ''}</span>}
                {round.status === 'closed' && !round.solved && <span className="pill">Closed</span>}
              </div>
              <h1>{round.mystery.title}</h1>
              <p className="prompt">{round.mystery.prompt}</p>

              <h2>
                Clues found{' '}
                <span className="muted small">
                  {round.revealed_clues.length} of {round.clue_count}
                </span>
              </h2>
              {round.revealed_clues.length === 0 ? (
                <p className="muted">None yet. Ask the host yes/no questions!</p>
              ) : (
                <ol className="clues">
                  {round.revealed_clues.map((c) => (
                    <li key={c.id} className="clue-in">
                      <span>{c.text}</span>
                      <span className="muted small">
                        {c.player ? `${c.player} · ` : ''}+{c.points}
                      </span>
                    </li>
                  ))}
                </ol>
              )}

              {round.solution && (
                <section className="solution">
                  <h2>The solution</h2>
                  <p>{round.solution}</p>
                </section>
              )}
            </article>
          )}
        </div>
        <aside>
          <Scoreboard session={session} board={board} highlightId={me?.id} />
          {session.status !== 'ended' && !me && (
            <p className="small muted center">
              Not playing yet? <a href={`#/join/${session.code}`}>Join this game</a>
            </p>
          )}
        </aside>
      </div>
    </Shell>
  )
}

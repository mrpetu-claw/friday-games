import { useEffect, useState } from 'react'
import { ConnectionBadge, ErrorNote, Loading, Scoreboard, Shell, Timer } from '../components/common'
import { MysteryImage } from '../components/MysteryImage'
import { getPublicState, whoami } from '../lib/api'
import { resultHeadline } from '../lib/game'
import { routeUrl } from '../lib/router'
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
          <section className="sheet narrow">
            <h1>Game not found</h1>
            <p>
              There’s no game with code <strong>{code}</strong>. It may have finished and been cleaned up. Ask the host for
              the current link.
            </p>
            <a className="btn btn-primary" href="#/">
              Enter another code
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
  const hidden = round ? Math.max(0, round.clue_count - round.revealed_clues.length) : 0

  return (
    <Shell wide>
      <div className="statusbar">
        <span className="code-chip" aria-label={`Game code ${session.code}`}>
          <span className="code-chip-label">Code</span>
          <strong>{session.code}</strong>
        </span>
        <span className="muted">{session.mode === 'competitive' ? 'Competitive' : 'Cooperative'}</span>
        {me && <span className="badge badge-me">Playing as {me.name}</span>}
        <span className="spacer" />
        <ConnectionBadge connection={connection} />
        <Timer session={session} />
      </div>

      {session.status === 'ended' && (
        <section className="result" aria-live="polite">
          <p className="stamp">{session.end_reason === 'time_limit' ? 'Time’s up' : 'Case closed'}</p>
          <h1>{resultHeadline(session, board)}</h1>
          <p>
            {board.mysteries_solved} of {board.mysteries_played} mysteries solved.
          </p>
        </section>
      )}

      <div className="play-grid">
        {!round ? (
          <section className="sheet lobby">
            <h1>Waiting for the first mystery</h1>
            <p className="lead">Join on your phone or laptop with this code:</p>
            <p className="lobby-code" aria-label={`Code ${session.code}`}>
              {session.code.split('').map((ch, i) => (
                <span key={i}>{ch}</span>
              ))}
            </p>
            <p className="muted small break">{joinLink}</p>
          </section>
        ) : (
          <article className="sheet mystery" aria-live="polite">
            <MysteryImage path={round.mystery.image} className="mystery-art" />
            <div className="mystery-meta">
              <span className="pill">Mystery {round.seq}</span>
              <span className="pill">{round.mystery.category}</span>
              <span className={`pill diff-${round.mystery.difficulty.toLowerCase()}`}>{round.mystery.difficulty}</span>
              {round.solved && <span className="pill pill-good">Solved{round.solved_by ? ` by ${round.solved_by}` : ''}</span>}
              {round.status === 'closed' && !round.solved && <span className="pill">Closed</span>}
            </div>
            <h1 className="mystery-title">{round.mystery.title}</h1>
            <p className="prompt">{round.mystery.prompt}</p>

            <div className="notebook">
              <h2>
                Clues <span className="count">{round.revealed_clues.length}/{round.clue_count}</span>
              </h2>
              <ol className="clues">
                {round.revealed_clues.map((c) => (
                  <li key={c.id}>
                    <span className="clue-text">
                      <mark>{c.text}</mark>
                    </span>
                    <span className="clue-by">
                      {c.player ?? 'Team'} +{c.points}
                    </span>
                  </li>
                ))}
                {Array.from({ length: hidden }).map((_, i) => (
                  <li key={`hidden-${i}`} className="clue-hidden" aria-label="Clue not found yet">
                    <span className="clue-text">Not found yet</span>
                  </li>
                ))}
              </ol>
              {round.revealed_clues.length === 0 && (
                <p className="muted small">Ask the host yes/no questions to uncover the clues.</p>
              )}
            </div>

            {round.solution && (
              <section className="solution">
                <h2>What really happened</h2>
                <p>{round.solution}</p>
              </section>
            )}
          </article>
        )}
        <aside>
          <Scoreboard session={session} board={board} highlightId={me?.id} />
          {session.status !== 'ended' && !me && (
            <p className="small muted center aside-note">
              Not playing yet? <a href={`#/join/${session.code}`}>Join this game</a>
            </p>
          )}
        </aside>
      </div>
    </Shell>
  )
}

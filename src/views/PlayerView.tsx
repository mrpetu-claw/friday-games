import { CheckCircle2, Crown, Eye, Search, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ConnectionBadge, ErrorNote, PageSkeleton, Scoreboard, Shell, Timer } from '../components/common'
import { MysteryImage } from '../components/MysteryImage'
import { getPublicState, whoami } from '../lib/api'
import { rankPlayers, resultHeadline } from '../lib/game'
import { routeUrl } from '../lib/router'
import { playerToken } from '../lib/storage'
import type { Board, SessionInfo } from '../lib/types'
import { useLiveState } from '../lib/useLiveState'

// Public screen, shown on the shared Teams screen. Page pattern: Detail.
// It only ever receives the public payload: no solution until Reveal, no
// unrevealed clues, no keys.
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
            <h1>No game with code {code}</h1>
            <p>It may have finished and been cleaned up. Ask the host for the current link.</p>
            <a className="btn btn-primary" href="#/">
              Enter a different code
            </a>
          </section>
        ) : error ? (
          <ErrorNote error={error} />
        ) : (
          <PageSkeleton />
        )}
      </Shell>
    )
  }

  const { session, round, board } = data
  const hidden = round ? Math.max(0, round.clue_count - round.revealed_clues.length) : 0

  return (
    <Shell wide>
      <div className="statusbar">
        <span className="code-chip" aria-label={`Game code ${session.code}`}>
          <span className="code-chip-label">Code</span>
          <strong>{session.code}</strong>
        </span>
        <span className="muted hide-narrow">{session.mode === 'competitive' ? 'Competitive' : 'Cooperative'}</span>
        {me && <span className="badge badge-me">Playing as {me.name}</span>}
        <span className="spacer" />
        <ConnectionBadge connection={connection} />
        <Timer session={session} />
      </div>

      {session.status === 'ended' && <Results session={session} board={board} />}

      {!round ? (
        session.status !== 'ended' && <Lobby session={session} board={board} />
      ) : (
        <div className="play-grid">
          <article className="case" aria-live="polite">
            <header className="case-hero">
              <MysteryImage path={round.mystery.image} className="case-hero-art" />
              <div className="case-hero-text">
                <p className="meta meta-on-dark">
                  <span>Mystery {round.seq}</span>
                  <span>{round.mystery.category}</span>
                  <span className={`diff diff-${round.mystery.difficulty.toLowerCase()}`}>{round.mystery.difficulty}</span>
                </p>
                <h1 className="case-title">{round.mystery.title}</h1>
              </div>
              {round.solved && (
                <span className="case-stamp" role="status">
                  Solved{round.solved_by ? ` by ${round.solved_by}` : ''}
                </span>
              )}
            </header>

            <div className="case-body">
              <p className="prompt">{round.mystery.prompt}</p>

              <div className="notebook">
                <h2>
                  <Search size={20} aria-hidden="true" /> Clues found{' '}
                  <span className="count">
                    {round.revealed_clues.length} of {round.clue_count}
                  </span>
                </h2>
                <div className="clue-meter" aria-hidden="true">
                  {Array.from({ length: round.clue_count }).map((_, i) => (
                    <span key={i} className={i < round.revealed_clues.length ? 'on' : ''} />
                  ))}
                </div>
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
                  <p className="muted">Ask the host yes-or-no questions to uncover the first clue.</p>
                )}
              </div>

              {round.solution && (
                <section className="solution">
                  <h2>
                    <Eye size={20} aria-hidden="true" /> What really happened
                  </h2>
                  <p>{round.solution}</p>
                </section>
              )}
            </div>
          </article>
          <aside>
            <Scoreboard session={session} board={board} highlightId={me?.id} />
            {session.status !== 'ended' && !me && (
              <a className="btn btn-block join-cta" href={`#/join/${session.code}`}>
                <UserPlus size={18} aria-hidden="true" /> Join this game
              </a>
            )}
          </aside>
        </div>
      )}
    </Shell>
  )
}

/** Before the first mystery: the shared screen's waiting room. */
function Lobby({ session, board }: { session: SessionInfo; board: Board }) {
  const players = board.players.filter((p) => p.role === 'player')
  return (
    <section className="lobby">
      <div className="lobby-main">
        <p className="lobby-kicker">The case opens soon</p>
        <h1 className="lobby-title">Join with this code</h1>
        <p className="lobby-code" aria-label={`Code ${session.code}`}>
          {session.code.split('').map((ch, i) => (
            <span key={i}>{ch}</span>
          ))}
        </p>
        <p className="lobby-url">
          Open <strong>{routeUrl('/').replace(/^https?:\/\//, '').replace(/#\/$/, '')}</strong> on your phone or laptop, or use the
          link in the Teams chat.
        </p>
      </div>
      <div className="lobby-roster">
        <h2>
          {players.length === 0
            ? 'Waiting for detectives'
            : `${players.length} detective${players.length === 1 ? '' : 's'} ready`}
        </h2>
        {players.length === 0 ? (
          <p className="muted">Names appear here as people join.</p>
        ) : (
          <ul className="roster">
            {players.map((p) => (
              <li key={p.id}>
                <span className="avatar" aria-hidden="true">
                  {p.name.slice(0, 1).toUpperCase()}
                </span>
                {p.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

/** End of the game: podium for competitive, team result for cooperative. */
function Results({ session, board }: { session: SessionInfo; board: Board }) {
  const ranked = rankPlayers(board.players)
  const top = ranked.slice(0, 3)
  // Podium order on screen: 2nd, 1st, 3rd
  const podium = [top[1], top[0], top[2]].filter(Boolean)
  return (
    <section className="result" aria-live="polite">
      <p className="stamp">{session.end_reason === 'time_limit' ? 'Time’s up' : 'Case closed'}</p>
      <h1>{resultHeadline(session, board)}</h1>
      {session.mode === 'competitive' && top.length > 0 && top[0].score > 0 && (
        <ol className="podium" aria-label="Top players">
          {podium.map((p) => (
            <li key={p.id} className={`podium-${p.rank}`}>
              {p.rank === 1 && <Crown className="podium-crown" size={32} aria-hidden="true" />}
              <span className="podium-name">{p.name}</span>
              <span className="podium-score">{p.score}</span>
              <span className="podium-block">
                <span className="sr-only">Place </span>
                {p.rank}
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="muted">
        <CheckCircle2 size={16} aria-hidden="true" /> {board.mysteries_solved} of {board.mysteries_played} mysteries solved
      </p>
    </section>
  )
}

import { ArrowRight, Highlighter, MessageCircleQuestion, Trophy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { CodeInput } from '../components/CodeInput'
import { ErrorNote, Shell } from '../components/common'
import { GAMES } from '../games/registry'
import { createSession, GameError, getPublicState } from '../lib/api'
import { go } from '../lib/router'
import { hostCredential, playerToken, recentHostedCodes } from '../lib/storage'
import type { Mode } from '../lib/types'

/** #/ — what players get: just enter the code. Page pattern: Form (with a hero). */
export function PlayerHome() {
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const message = 'Enter the 6-character code from the Teams chat.'
  const art = (n: string) => `${import.meta.env.BASE_URL}mysteries/${n}.webp`
  return (
    <Shell wide>
      <div className="landing">
        <section className="landing-copy">
          <h1 className="landing-title">
            Crack the case.
            <br />
            Together.
          </h1>
          <p className="lead">
            Short, strange mysteries for your Friday call. Ask the host yes-or-no questions, uncover the clues and be the
            first to explain what really happened.
          </p>

          <form
            className="landing-form sheet"
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              if (code.length !== 6) {
                setCodeError(message)
                document.getElementById('game-code')?.focus()
                return
              }
              // Already joined this game from this browser? Go straight back in.
              go(playerToken.get(code) ? `/play/${code}` : `/join/${code}`)
            }}
          >
            <CodeInput
              value={code}
              autoFocus
              label="Game code from the Teams chat"
              error={codeError ?? undefined}
              onChange={(v) => {
                setCode(v)
                setCodeError(null)
              }}
              onBlur={() => setCodeError(code.length > 0 && code.length < 6 ? message : null)}
            />
            <button type="submit" className="btn btn-primary btn-large btn-block">
              Join game <ArrowRight size={20} aria-hidden="true" />
            </button>
          </form>

          <ol className="how-to">
            <li>
              <MessageCircleQuestion size={20} aria-hidden="true" />
              <span>
                <strong>Ask</strong> yes-or-no questions
              </span>
            </li>
            <li>
              <Highlighter size={20} aria-hidden="true" />
              <span>
                <strong>Uncover</strong> clues for points
              </span>
            </li>
            <li>
              <Trophy size={20} aria-hidden="true" />
              <span>
                <strong>Solve</strong> it for the big bonus
              </span>
            </li>
          </ol>
        </section>

        <div className="case-stack" aria-hidden="true">
          <figure className="case-photo case-photo-1">
            <img src={art('ms-006')} alt="" width={800} height={450} />
            <figcaption>The Desert Ship</figcaption>
          </figure>
          <figure className="case-photo case-photo-2">
            <img src={art('ms-001')} alt="" width={800} height={450} />
            <figcaption>The Bakery Alarm</figcaption>
          </figure>
          <figure className="case-photo case-photo-3">
            <img src={art('ms-003')} alt="" width={800} height={450} />
            <figcaption>The Dark Lighthouse</figcaption>
          </figure>
          <span className="case-tag">Case file</span>
        </div>
      </div>
    </Shell>
  )
}

/** #/host — the organiser's page: create a game, reopen open games, edit stories. */
export function HostHome() {
  const [game, setGame] = useState('mystery_stories')
  const [mode, setMode] = useState<Mode>('competitive')
  const [target, setTarget] = useState(60)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<GameError | null>(null)
  const [recent, setRecent] = useState<string[]>([])

  // Show only hosted games that still exist and are not finished
  useEffect(() => {
    let cancelled = false
    Promise.all(
      recentHostedCodes().map(async (c) => {
        try {
          const st = await getPublicState(c)
          return st.session.status === 'ended' ? null : c
        } catch (e) {
          if (e instanceof GameError && e.code === 'not_found') hostCredential.forget(c)
          return null
        }
      }),
    ).then((codes) => {
      if (!cancelled) setRecent(codes.filter((c): c is string => Boolean(c)))
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const r = await createSession(mode, target)
      hostCredential.set(r.code, r.host_credential)
      go(`/host/${r.code}`)
    } catch (e) {
      setError(e instanceof GameError ? e : new GameError('unknown'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell wide home="#/host">
      <div className="host-home">
        <section className="sheet">
          <h1>Host a game</h1>
          <p className="lead">Pick a game and a mode. You’ll get a code to share in the Teams chat.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void create()
            }}
          >
            <fieldset>
              <legend>Game</legend>
              <div className="game-tiles">
                {GAMES.map((g) => (
                  <label key={g.id} className={`game-tile ${!g.available ? 'is-soon' : ''} ${game === g.id ? 'is-on' : ''}`}>
                    <input
                      type="radio"
                      name="game"
                      value={g.id}
                      checked={game === g.id}
                      disabled={!g.available}
                      onChange={() => setGame(g.id)}
                    />
                    {g.available ? (
                      <img src={`${import.meta.env.BASE_URL}mysteries/ms-001.webp`} alt="" className="game-tile-art" />
                    ) : (
                      <span className="game-tile-art img-placeholder" aria-hidden="true" />
                    )}
                    <span className="game-tile-body">
                      <strong>{g.name}</strong>
                      <span>{g.tagline}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Mode</legend>
              <div className="mode-tiles">
                <label className={`mode-tile ${mode === 'competitive' ? 'is-on' : ''}`}>
                  <input type="radio" name="mode" checked={mode === 'competitive'} onChange={() => setMode('competitive')} />
                  <strong>Competitive</strong>
                  <span>Everyone scores for themselves. Highest score wins; ties share the win.</span>
                </label>
                <label className={`mode-tile ${mode === 'cooperative' ? 'is-on' : ''}`}>
                  <input type="radio" name="mode" checked={mode === 'cooperative'} onChange={() => setMode('cooperative')} />
                  <strong>Cooperative</strong>
                  <span>One shared team score, playing against a points goal.</span>
                </label>
              </div>
              {mode === 'cooperative' && (
                <label className="field goal-field">
                  Team goal in points
                  <input type="number" min={5} max={500} value={target} onChange={(e) => setTarget(Number(e.target.value))} />
                </label>
              )}
            </fieldset>
            <ErrorNote error={error} />
            <button type="submit" className="btn btn-primary btn-large" disabled={busy}>
              {busy ? 'Creating…' : 'Create game'}
            </button>
            <p className="muted small create-note">The 60-minute timer starts when you start the first mystery, not now.</p>
          </form>
        </section>

        <aside>
          <section className="board-panel">
            <h2>Your open games</h2>
            {recent.length === 0 ? (
              <p className="board-foot">None right now. Games you create in this browser stay here until they end, so you can get back to them after a refresh.</p>
            ) : (
              <ul className="open-games">
                {recent.map((c) => (
                  <li key={c}>
                    <span className="open-code">{c}</span>
                    <a className="btn btn-small btn-light" href={`#/host/${c}`}>
                      Resume game
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="sheet side-sheet">
            <h2>Stories</h2>
            <p className="muted">Add or edit mysteries, clues and pictures in the Story Editor.</p>
            <a className="btn" href="#/admin">
              Open Story Editor
            </a>
          </section>
        </aside>
      </div>
    </Shell>
  )
}

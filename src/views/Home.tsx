import { ArrowRight, BarChart3, Clock, MessageCircleQuestion, Puzzle, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { CodeInput } from '../components/CodeInput'
import { ErrorNote, Shell } from '../components/common'
import { GAMES } from '../games/registry'
import { createSession, GameError, getPublicState } from '../lib/api'
import { go } from '../lib/router'
import { hostCredential, playerToken, recentHostedCodes } from '../lib/storage'
import type { Mode } from '../lib/types'

const FEATURED = [
  { img: 'ms-003', title: 'The Dark Lighthouse', teaser: 'A keeper switches off his light on the stormiest night of the year, and is called a hero.', difficulty: 'Hard', time: '~15 min' },
  { img: 'ms-004', title: 'The Empty Box', teaser: 'A jeweller pays £500 to receive a perfectly empty box, and calls it money well spent.', difficulty: 'Medium', time: '~10 min' },
  { img: 'ms-006', title: 'The Desert Ship', teaser: 'A full-sized sailing ship stands in a desert town square. Nobody carried it there.', difficulty: 'Hard', time: '~15 min' },
]

/** #/ — what players get. Page pattern: marketing landing with the join form in the hero. */
export function PlayerHome() {
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const message = 'Enter the 6-character code from the Teams chat.'
  const art = (n: string) => `${import.meta.env.BASE_URL}mysteries/${n}.webp`

  const hero = (
    <section className="hero-noir" style={{ ['--hero-img' as string]: `url(${new URL(art('ms-004'), window.location.href).href})` }}>
      <div className="page page-wide hero-inner">
        <p className="kicker">A team mystery game for Friday calls</p>
        <h1 className="hero-title">Solve the Case</h1>
        <p className="hero-sub">
          Ask the host yes-or-no questions, uncover the clues and piece together the truth. Can your team crack it before
          the clock runs out?
        </p>
        <form
          className="hero-join"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            if (code.length !== 6) {
              setCodeError(message)
              document.getElementById('game-code')?.focus()
              return
            }
            go(playerToken.get(code) ? `/play/${code}` : `/join/${code}`)
          }}
        >
          <CodeInput
            value={code}
            autoFocus
            label="Enter the game code from the Teams chat"
            error={codeError ?? undefined}
            onChange={(v) => {
              setCode(v)
              setCodeError(null)
            }}
            onBlur={() => setCodeError(code.length > 0 && code.length < 6 ? message : null)}
          />
          <button type="submit" className="btn btn-primary btn-large btn-block">
            Join the case <ArrowRight size={20} aria-hidden="true" />
          </button>
        </form>
      </div>
    </section>
  )

  return (
    <Shell wide hero={hero}>
      <ul className="features">
        <li>
          <MessageCircleQuestion size={40} strokeWidth={1.5} aria-hidden="true" />
          <div>
            <h2>Ask questions</h2>
            <p>Only yes or no. Every answer narrows it down.</p>
          </div>
        </li>
        <li>
          <Search size={40} strokeWidth={1.5} aria-hidden="true" />
          <div>
            <h2>Find clues</h2>
            <p>Uncover the key facts and score points for each one.</p>
          </div>
        </li>
        <li>
          <Puzzle size={40} strokeWidth={1.5} aria-hidden="true" />
          <div>
            <h2>Solve the mystery</h2>
            <p>Put the pieces together and reveal what really happened.</p>
          </div>
        </li>
      </ul>

      <section className="featured">
        <h2 className="featured-title">Case files</h2>
        <div className="case-cards">
          {FEATURED.map((c) => (
            <article key={c.title} className="case-card">
              <img src={art(c.img)} alt="" width={800} height={450} loading="lazy" />
              <div className="case-card-body">
                <h3>{c.title}</h3>
                <p>{c.teaser}</p>
                <p className="case-card-meta">
                  <span>
                    <BarChart3 size={16} aria-hidden="true" /> {c.difficulty}
                  </span>
                  <span>
                    <Clock size={16} aria-hidden="true" /> {c.time}
                  </span>
                </p>
              </div>
            </article>
          ))}
        </div>
        <p className="featured-note">Your host picks the cases. Bring a sharp mind and a good question.</p>
      </section>
    </Shell>
  )
}

/** #/how — rules for players. Page pattern: Detail. */
export function HowToPlay() {
  return (
    <Shell>
      <section className="sheet how">
        <p className="kicker">How to play</p>
        <h1>Four steps to crack a case</h1>
        <ol className="steps">
          <li>
            <h2>Join with the code</h2>
            <p>Your host shares a 6-character code in the Teams chat. Enter it with your name. No account needed.</p>
          </li>
          <li>
            <h2>Read the case</h2>
            <p>A strange situation appears on the shared screen. Something doesn’t add up.</p>
          </li>
          <li>
            <h2>Ask yes-or-no questions</h2>
            <p>The host only answers yes, no or irrelevant. When you uncover a key fact, it lights up as a clue and you score points.</p>
          </li>
          <li>
            <h2>Solve it</h2>
            <p>Think you know what happened? Say it. A full solution scores the big bonus; a wrong guess may cost you.</p>
          </li>
        </ol>
        <a className="btn btn-primary btn-large" href="#/">
          Join a game <ArrowRight size={20} aria-hidden="true" />
        </a>
      </section>
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

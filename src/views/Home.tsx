import { useEffect, useState } from 'react'
import { CodeInput } from '../components/CodeInput'
import { ErrorNote, Shell } from '../components/common'
import { GAMES } from '../games/registry'
import { createSession, GameError, getPublicState } from '../lib/api'
import { go } from '../lib/router'
import { hostCredential, playerToken, recentHostedCodes } from '../lib/storage'
import type { Mode } from '../lib/types'

/** #/ — what players get: just enter the code. */
export function PlayerHome() {
  const [code, setCode] = useState('')
  return (
    <Shell>
      <section className="sheet narrow join-sheet">
        <h1>Join the game</h1>
        <p className="lead">Enter the code your host shared in the Teams chat.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (code.length !== 6) return
            // Already joined this game from this browser? Go straight back in.
            go(playerToken.get(code) ? `/play/${code}` : `/join/${code}`)
          }}
        >
          <CodeInput value={code} onChange={setCode} autoFocus />
          <button type="submit" className="btn btn-primary" disabled={code.length !== 6}>
            Join game
          </button>
        </form>
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
  const [error, setError] = useState<string | null>(null)
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
      setError(e instanceof GameError ? e.message : 'Could not create the game.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell home="#/host">
      <section className="hero">
        <h1>Host a game</h1>
        <p className="lead">You run the game, answer questions and award clues.</p>
      </section>

      <div className="grid-2">
        <section className="card">
          <h2>New game</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void create()
            }}
          >
            <fieldset>
              <legend>Game</legend>
              {GAMES.map((g) => (
                <label key={g.id} className={`option ${!g.available ? 'disabled' : ''}`}>
                  <input
                    type="radio"
                    name="game"
                    value={g.id}
                    checked={game === g.id}
                    disabled={!g.available}
                    onChange={() => setGame(g.id)}
                  />
                  <span>
                    <strong>{g.name}</strong> <span className="muted small">{g.tagline}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>Mode</legend>
              <label className="option">
                <input type="radio" name="mode" checked={mode === 'competitive'} onChange={() => setMode('competitive')} />
                <span>
                  <strong>Competitive</strong> <span className="muted small">Individual scores, winner at the end</span>
                </span>
              </label>
              <label className="option">
                <input type="radio" name="mode" checked={mode === 'cooperative'} onChange={() => setMode('cooperative')} />
                <span>
                  <strong>Cooperative</strong> <span className="muted small">One team score against a goal</span>
                </span>
              </label>
              {mode === 'cooperative' && (
                <label className="field">
                  Team goal (points)
                  <input type="number" min={5} max={500} value={target} onChange={(e) => setTarget(Number(e.target.value))} />
                </label>
              )}
            </fieldset>
            <ErrorNote message={error} />
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Creating…' : 'Create game'}
            </button>
          </form>
        </section>

        <div>
          <section className="card">
            <h2>Your open games</h2>
            {recent.length === 0 ? (
              <p className="muted small">None right now. Games you create in this browser appear here until they end.</p>
            ) : (
              <p>
                {recent.map((c) => (
                  <a key={c} href={`#/host/${c}`} className="btn code-link">
                    {c}
                  </a>
                ))}
              </p>
            )}
          </section>
          <section className="card">
            <h2>Stories</h2>
            <p className="muted small">Add or edit mysteries, clues and pictures.</p>
            <a className="btn" href="#/admin">
              Open Story Editor
            </a>
          </section>
        </div>
      </div>
    </Shell>
  )
}

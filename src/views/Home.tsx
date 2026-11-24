import { useEffect, useState } from 'react'
import { ErrorNote, Shell } from '../components/common'
import { GAMES } from '../games/registry'
import { createSession, GameError, getPublicState } from '../lib/api'
import { normaliseCode } from '../lib/game'
import { go } from '../lib/router'
import { hostCredential, recentHostedCodes } from '../lib/storage'
import type { Mode } from '../lib/types'

export default function Home() {
  const [creating, setCreating] = useState(false)
  const [game, setGame] = useState('mystery_stories')
  const [mode, setMode] = useState<Mode>('competitive')
  const [target, setTarget] = useState(60)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState('')
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
    <Shell>
      <section className="hero">
        <h1>Friday Games</h1>
        <p className="lead">Team mysteries for your Teams call. No sign-up needed.</p>
      </section>

      <div className="grid-2">
        <section className="card">
          <h2>Host a game</h2>
          {!creating ? (
            <>
              <p className="muted">You run the game, answer questions and award clues.</p>
              <button className="btn btn-primary" onClick={() => setCreating(true)}>
                Create game
              </button>
            </>
          ) : (
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
                    <input
                      type="number"
                      min={5}
                      max={500}
                      value={target}
                      onChange={(e) => setTarget(Number(e.target.value))}
                    />
                  </label>
                )}
              </fieldset>
              <ErrorNote message={error} />
              <div className="row">
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? 'Creating…' : 'Create game'}
                </button>
                <button type="button" className="btn" onClick={() => setCreating(false)}>
                  Cancel
                </button>
              </div>
            </form>
          )}
          {recent.length > 0 && (
            <p className="small muted recent">
              Your open games:{' '}
              {recent.map((c) => (
                <a key={c} href={`#/host/${c}`} className="code-link">
                  {c}
                </a>
              ))}
            </p>
          )}
        </section>

        <section className="card">
          <h2>Join a game</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (code.length === 6) go(`/join/${code}`)
            }}
          >
            <label className="field">
              Game code
              <input
                className="code-input"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                placeholder="e.g. K7MQ2D"
                value={code}
                onChange={(e) => setCode(normaliseCode(e.target.value))}
              />
            </label>
            <button type="submit" className="btn btn-primary" disabled={code.length !== 6}>
              Continue
            </button>
          </form>
        </section>
      </div>
      <p className="center small muted">
        <a href="#/admin">Manage stories</a>
      </p>
    </Shell>
  )
}

import { useEffect, useState } from 'react'
import { ErrorNote, Loading, Shell } from '../components/common'
import { GameError, getPublicState, joinSession, requestLink, whoami } from '../lib/api'
import { normaliseCode } from '../lib/game'
import { go } from '../lib/router'
import { playerToken } from '../lib/storage'

type Tab = 'name' | 'link'

export default function JoinView({ code: initial }: { code: string }) {
  const [code, setCode] = useState(normaliseCode(initial))
  const [tab, setTab] = useState<Tab>('name')
  const [name, setName] = useState('')
  const [spectator, setSpectator] = useState(false)
  const [linkCode, setLinkCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<{ name: string; token: string } | null>(null)
  const [checking, setChecking] = useState(true)

  // Already joined from this browser? Go straight to the game.
  useEffect(() => {
    const token = code ? playerToken.get(code) : null
    if (!token) {
      setChecking(false)
      return
    }
    whoami(code, token)
      .then((w) => {
        if (w.status === 'player') go(`/play/${code}`)
        else if (w.status === 'pending') setPending({ name: '', token })
        else playerToken.set(code, null)
      })
      .catch(() => undefined)
      .finally(() => setChecking(false))
  }, [code])

  // Waiting for the host to approve a link request
  useEffect(() => {
    if (!pending) return
    const t = window.setInterval(async () => {
      try {
        const w = await whoami(code, pending.token)
        if (w.status === 'player') go(`/play/${code}`)
        if (w.status === 'rejected' || w.status === 'removed') {
          playerToken.set(code, null)
          setPending(null)
          setError('The host did not approve the request. Ask them for a new code.')
        }
      } catch {
        /* keep waiting */
      }
    }, 3000)
    return () => window.clearInterval(t)
  }, [pending, code])

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      if (tab === 'name') {
        const r = await joinSession(code, name, spectator)
        playerToken.set(code, r.player_token)
        go(`/play/${code}`)
      } else {
        await getPublicState(code) // friendly "not found" before using the link code
        const r = await requestLink(code, linkCode.trim())
        playerToken.set(code, r.claim_token)
        setPending({ name: r.name, token: r.claim_token })
      }
    } catch (e) {
      setError(e instanceof GameError ? e.message : 'Could not join.')
    } finally {
      setBusy(false)
    }
  }

  if (checking) return <Shell><Loading /></Shell>

  if (pending) {
    return (
      <Shell>
        <section className="card narrow">
          <h1>Almost there</h1>
          <p>
            Waiting for the host to confirm that you are {pending.name ? <strong>{pending.name}</strong> : 'this player'}.
            This page will continue by itself.
          </p>
          <Loading label="Waiting for approval…" />
        </section>
      </Shell>
    )
  }

  return (
    <Shell>
      <section className="card narrow">
        <h1>Join game</h1>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'name'} className={tab === 'name' ? 'active' : ''} onClick={() => setTab('name')}>
            Join with my name
          </button>
          <button role="tab" aria-selected={tab === 'link'} className={tab === 'link' ? 'active' : ''} onClick={() => setTab('link')}>
            The host added me
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <label className="field">
            Game code
            <input
              className="code-input"
              value={code}
              autoComplete="off"
              autoCapitalize="characters"
              onChange={(e) => setCode(normaliseCode(e.target.value))}
            />
          </label>
          {tab === 'name' ? (
            <>
              <label className="field">
                Your name
                <input value={name} maxLength={24} autoComplete="nickname" onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="check">
                <input type="checkbox" checked={spectator} onChange={(e) => setSpectator(e.target.checked)} /> Just watching
                (spectator)
              </label>
            </>
          ) : (
            <label className="field">
              6-digit code from the host
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={linkCode}
                onChange={(e) => setLinkCode(e.target.value.replace(/\D/g, ''))}
              />
              <span className="muted small">
                Ask the host privately (e.g. in a Teams chat). They’ll confirm it’s you; your points are kept.
              </span>
            </label>
          )}
          <ErrorNote message={error} />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || code.length !== 6 || (tab === 'name' ? !name.trim() : linkCode.length !== 6)}
          >
            {busy ? 'Joining…' : 'Join'}
          </button>
        </form>
      </section>
    </Shell>
  )
}

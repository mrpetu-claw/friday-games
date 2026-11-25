import { useEffect, useState } from 'react'
import { CodeInput } from '../components/CodeInput'
import { ErrorNote, Loading, Shell } from '../components/common'
import { GameError, getPublicState, joinSession, requestLink, whoami } from '../lib/api'
import { normaliseCode } from '../lib/game'
import { go } from '../lib/router'
import { lastName, playerToken } from '../lib/storage'

// Page pattern: Form.

type Tab = 'name' | 'link'
type Field = 'code' | 'name' | 'link'

const FIELD_MESSAGES: Record<Field, string> = {
  code: 'Enter the 6-character code from the Teams chat.',
  name: 'Enter the name other players will see.',
  link: 'Enter the 6-digit code the host sent you.',
}

export default function JoinView({ code: initial }: { code: string }) {
  const [code, setCode] = useState(normaliseCode(initial))
  const [tab, setTab] = useState<Tab>('name')
  const [name, setName] = useState(() => lastName.get())
  const [spectator, setSpectator] = useState(false)
  const [linkCode, setLinkCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<GameError | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({})
  const [pending, setPending] = useState<{ name: string; token: string } | null>(null)
  const [checking, setChecking] = useState(true)

  const valid: Record<Field, boolean> = {
    code: code.length === 6,
    name: name.trim().length > 0,
    link: linkCode.length === 6,
  }
  const blur = (f: Field) => setFieldErrors((e) => ({ ...e, [f]: valid[f] ? undefined : FIELD_MESSAGES[f] }))
  const clear = (f: Field) => setFieldErrors((e) => ({ ...e, [f]: undefined }))

  // Already joined from this browser? Go straight to the game.
  useEffect(() => {
    const token = code.length === 6 ? playerToken.get(code) : null
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
          setError(new GameError('link_rejected'))
        }
      } catch {
        /* keep waiting */
      }
    }, 3000)
    return () => window.clearInterval(t)
  }, [pending, code])

  async function submit() {
    const fields: Field[] = tab === 'name' ? ['code', 'name'] : ['code', 'link']
    const errors = Object.fromEntries(fields.filter((f) => !valid[f]).map((f) => [f, FIELD_MESSAGES[f]]))
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      document.getElementById(`join-${Object.keys(errors)[0]}`)?.focus()
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (tab === 'name') {
        const r = await joinSession(code, name, spectator)
        playerToken.set(code, r.player_token)
        lastName.set(r.name)
        go(`/play/${code}`)
      } else {
        await getPublicState(code) // clear "not found" before using the link code
        const r = await requestLink(code, linkCode.trim())
        playerToken.set(code, r.claim_token)
        setPending({ name: r.name, token: r.claim_token })
      }
    } catch (e) {
      setError(e instanceof GameError ? e : new GameError('unknown'))
    } finally {
      setBusy(false)
    }
  }

  if (checking)
    return (
      <Shell>
        <Loading />
      </Shell>
    )

  if (pending) {
    return (
      <Shell>
        <section className="sheet narrow join-sheet">
          <h1>Almost there</h1>
          <p>
            The host is confirming that you are {pending.name ? <strong>{pending.name}</strong> : 'this player'}. This page
            continues by itself once they do.
          </p>
          <Loading label="Waiting for the host…" />
        </section>
      </Shell>
    )
  }

  return (
    <Shell>
      <section className="sheet narrow join-sheet">
        <h1>Join the game</h1>
        <div className="tabs" role="tablist" aria-label="How to join">
          <button role="tab" aria-selected={tab === 'name'} className={tab === 'name' ? 'active' : ''} onClick={() => setTab('name')}>
            Use my name
          </button>
          <button role="tab" aria-selected={tab === 'link'} className={tab === 'link' ? 'active' : ''} onClick={() => setTab('link')}>
            The host added me
          </button>
        </div>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <CodeInput
            id="join-code"
            value={code}
            onChange={(v) => {
              setCode(v)
              clear('code')
            }}
            onBlur={() => blur('code')}
            error={fieldErrors.code}
          />
          {tab === 'name' ? (
            <>
              <label className="field">
                Your name
                <input
                  id="join-name"
                  value={name}
                  maxLength={24}
                  autoComplete="nickname"
                  aria-invalid={Boolean(fieldErrors.name)}
                  aria-describedby={fieldErrors.name ? 'join-name-error' : undefined}
                  onBlur={() => blur('name')}
                  onChange={(e) => {
                    setName(e.target.value)
                    clear('name')
                  }}
                />
                {fieldErrors.name && (
                  <span className="field-error" id="join-name-error">
                    {fieldErrors.name}
                  </span>
                )}
              </label>
              <label className="check">
                <input type="checkbox" checked={spectator} onChange={(e) => setSpectator(e.target.checked)} /> Just watch as a
                spectator
              </label>
            </>
          ) : (
            <label className="field">
              6-digit code from the host
              <span className="helper">Ask the host privately, for example in a Teams chat. They’ll confirm it’s you, and your points are kept.</span>
              <input
                id="join-link"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={linkCode}
                aria-invalid={Boolean(fieldErrors.link)}
                aria-describedby={fieldErrors.link ? 'join-link-error' : undefined}
                onBlur={() => blur('link')}
                onChange={(e) => {
                  setLinkCode(e.target.value.replace(/\D/g, ''))
                  clear('link')
                }}
              />
              {fieldErrors.link && (
                <span className="field-error" id="join-link-error">
                  {fieldErrors.link}
                </span>
              )}
            </label>
          )}
          <ErrorNote error={error} />
          <button type="submit" className="btn btn-primary btn-large btn-block" disabled={busy}>
            {busy ? 'Joining…' : 'Join game'}
          </button>
        </form>
      </section>
    </Shell>
  )
}

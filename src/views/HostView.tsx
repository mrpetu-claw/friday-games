import { useMemo, useState } from 'react'
import { ConnectionBadge, ErrorNote, Loading, Scoreboard, Shell, Timer } from '../components/common'
import { GameError, hostApi, type HostApi } from '../lib/api'
import { resultHeadline } from '../lib/game'
import { routeUrl } from '../lib/router'
import { MysteryImage } from '../components/MysteryImage'
import { hostCredential } from '../lib/storage'
import type { BoardPlayer, HostState, ScoreEvent } from '../lib/types'
import { useLiveState } from '../lib/useLiveState'

const TEAM = '__team__'

export default function HostView({ code }: { code: string }) {
  const credential = hostCredential.get(code)
  if (!credential) {
    return (
      <Shell>
        <section className="card narrow">
          <h1>Host key not found</h1>
          <p>
            This browser doesn’t hold the host key for game <strong>{code}</strong>. Only the browser that created the
            game can host it.
          </p>
          <p>
            <a className="btn" href={`#/play/${code}`}>
              Open the public view instead
            </a>
          </p>
        </section>
      </Shell>
    )
  }
  return <HostConsole code={code} api={hostApi(code, credential)} />
}

function HostConsole({ code, api }: { code: string; api: HostApi }) {
  const { data, error, connection, refresh } = useLiveState(code, api.getState)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Runs a host action, shows a friendly error and refreshes (the broadcast
  // will also arrive, the explicit refresh just makes the host UI snappier).
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setActionError(null)
    try {
      await fn()
    } catch (e) {
      setActionError(e instanceof GameError ? e.message : 'That didn’t work. Try again.')
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  if (!data) {
    if (error?.code === 'not_authorized') {
      // The game was deleted or expired (old games are cleaned up after 7 days)
      hostCredential.forget(code)
      return (
        <Shell>
          <section className="card narrow">
            <h1>This game no longer exists</h1>
            <p>
              Game <strong>{code}</strong> has been closed and cleaned up. Start a new one from the home page.
            </p>
            <a className="btn btn-primary" href="#/">
              Go to the home page
            </a>
          </section>
        </Shell>
      )
    }
    return <Shell wide>{error ? <ErrorNote message={error.message} /> : <Loading label="Opening host console…" />}</Shell>
  }

  const ended = data.session.status === 'ended'
  return (
    <Shell wide>
      <HostHeader state={data} connection={connection} onEnd={() => act(api.endSession)} busy={busy} />
      <ErrorNote message={actionError} />
      {ended ? (
        <section className="card result">
          <p className="eyebrow">{data.session.end_reason === 'time_limit' ? 'Time limit reached' : 'Session ended'}</p>
          <h1>{resultHeadline(data.session, data.board)}</h1>
          <p className="muted">
            {data.board.mysteries_solved} of {data.board.mysteries_played} mysteries solved. Results are kept; no further
            changes are possible.
          </p>
        </section>
      ) : null}
      <div className="host-grid">
        <div>
          {!ended && <MysteryPanel state={data} api={api} act={act} busy={busy} />}
          <EventLog events={data.events} api={api} act={act} disabled={ended || busy} />
        </div>
        <aside>
          <Scoreboard session={data.session} board={data.board} />
          <PlayersPanel state={data} api={api} act={act} busy={busy} disabled={ended} />
        </aside>
      </div>
    </Shell>
  )
}

function HostHeader({
  state,
  connection,
  onEnd,
  busy,
}: {
  state: HostState
  connection: ReturnType<typeof useLiveState>['connection']
  onEnd: () => void
  busy: boolean
}) {
  const [copied, setCopied] = useState(false)
  const [showLink, setShowLink] = useState(false)
  const s = state.session
  const joinUrl = routeUrl(`/join/${s.code}`)
  const message = `Join Friday Games: ${joinUrl} (code ${s.code})`
  const copy = async () => {
    const ok = await copyText(message)
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    }
    // Always show the link too, so it can be copied by hand if the browser blocks the clipboard
    setShowLink(true)
  }
  return (
    <div className="statusbar host-bar">
      <span className="badge badge-private" title="Do not share this tab on screen">🔒 Host view — private</span>
      <span className="code-chip">
        Code <strong>{s.code}</strong>
      </span>
      <span className="muted small">{s.mode === 'competitive' ? 'Competitive' : `Cooperative · goal ${s.settings.coop_target}`}</span>
      <span className="spacer" />
      <ConnectionBadge connection={connection} />
      <Timer session={s} />
      <button className="btn" onClick={() => window.open(`#/play/${s.code}`, '_blank', 'noopener')}>
        Open Player View
      </button>
      <button className="btn" onClick={copy}>
        {copied ? 'Copied!' : 'Copy join link'}
      </button>
      {s.status !== 'ended' && (
        <button
          className="btn btn-danger"
          disabled={busy}
          onClick={() => {
            if (window.confirm('End the session for everyone? Final scores are kept and no more changes are possible.')) onEnd()
          }}
        >
          End session
        </button>
      )}
      {showLink && (
        <div className="join-link" role="status">
          <span className="small">{copied ? 'Copied! Paste it in the Teams chat:' : 'Copy this and paste it in the Teams chat:'}</span>
          <input
            readOnly
            value={message}
            aria-label="Join message"
            onFocus={(e) => e.currentTarget.select()}
            ref={(el) => el?.select()}
          />
          <button className="btn btn-small" onClick={() => setShowLink(false)}>
            Close
          </button>
        </div>
      )}
    </div>
  )
}

/** Clipboard API first, then the older execCommand route (works where the API is blocked). */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

type Act = (fn: () => Promise<unknown>) => Promise<void>

function MysteryPanel({ state, api, act, busy }: { state: HostState; api: HostApi; act: Act; busy: boolean }) {
  const round = state.round?.status === 'active' ? state.round : null
  const coop = state.session.mode === 'cooperative'
  const players = state.board.players.filter((p) => p.role === 'player')
  const [scorer, setScorer] = useState<string>(coop ? TEAM : '')
  const [showSolution, setShowSolution] = useState(false)
  const [picked, setPicked] = useState('')

  const scorerId = scorer === TEAM ? null : scorer || null
  const scorerName = scorer === TEAM ? 'the team' : players.find((p) => p.id === scorer)?.name
  const needScorer = !coop && !scorerId
  const s = state.session.settings

  if (!round) {
    const last = state.round
    const next = state.catalog.find((m) => !m.played)
    return (
      <section className="card">
        <h2>{last ? 'Next mystery' : 'Start a mystery'}</h2>
        {last && (
          <p className="muted small">
            Last: “{last.mystery.title}” — {last.solved ? `solved${last.solved_by ? ` by ${last.solved_by}` : ''}` : 'not solved'}.
          </p>
        )}
        {state.session.status === 'lobby' && (
          <p className="muted small">The 60-minute timer starts when you start the first mystery.</p>
        )}
        <ul className="catalog">
          {state.catalog.map((m) => (
            <li key={m.id}>
              <label className="option">
                <input
                  type="radio"
                  name="mystery"
                  value={m.id}
                  checked={(picked || next?.id) === m.id}
                  onChange={() => setPicked(m.id)}
                />
                <span>
                  <strong>{m.title}</strong>{' '}
                  <span className="muted small">
                    {m.category} · {m.difficulty}
                    {m.played && ' · already played'}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <button
          className="btn btn-primary"
          disabled={busy || !(picked || next?.id)}
          onClick={() => act(() => api.startMystery(picked || next!.id))}
        >
          Start mystery
        </button>
      </section>
    )
  }

  return (
    <section className="card mystery host-mystery">
      <div className="host-mystery-head">
        <MysteryImage path={round.mystery.image} className="thumb" />
        <div>
          <div className="mystery-meta">
            <span className="pill">Mystery {round.seq}</span>
            <span className="pill">{round.mystery.category}</span>
            <span className={`pill diff-${round.mystery.difficulty.toLowerCase()}`}>{round.mystery.difficulty}</span>
            {round.solved && <span className="pill pill-good">Solved{round.solved_by ? ` by ${round.solved_by}` : ''}</span>}
            {round.revealed && <span className="pill">Solution shown</span>}
          </div>
          <h2>{round.mystery.title}</h2>
          <p className="prompt small">{round.mystery.prompt}</p>
        </div>
      </div>

      <div className={`secret ${showSolution ? '' : 'hidden-secret'}`}>
        <div className="secret-head">
          <strong>Solution (private)</strong>
          <button className="btn btn-small" onClick={() => setShowSolution((v) => !v)}>
            {showSolution ? 'Hide' : 'Show'}
          </button>
        </div>
        {showSolution ? <p>{round.solution}</p> : <p className="muted small">Hidden in case this tab is on screen.</p>}
      </div>

      <fieldset className="scorer">
        <legend>Award points to</legend>
        <div className="chips">
          {coop && (
            <button className={`chip ${scorer === TEAM ? 'chip-on' : ''}`} onClick={() => setScorer(TEAM)} aria-pressed={scorer === TEAM}>
              Team
            </button>
          )}
          {players.map((p) => (
            <button
              key={p.id}
              className={`chip ${scorer === p.id ? 'chip-on' : ''}`}
              onClick={() => setScorer(p.id)}
              aria-pressed={scorer === p.id}
            >
              {p.name}
            </button>
          ))}
          {players.length === 0 && <span className="muted small">No players yet — add them on the right.</span>}
        </div>
      </fieldset>

      <h3>Clues</h3>
      <ul className="host-clues">
        {round.clues.map((c) => {
          const awarded = Boolean(c.award)
          return (
            <li key={c.id} className={awarded ? 'awarded' : ''}>
              <label className="check">
                <input
                  type="checkbox"
                  checked={awarded}
                  disabled={busy || (!awarded && needScorer)}
                  onChange={() =>
                    act(() => (awarded ? api.revokeClue(c.id) : api.awardClue(c.id, scorerId)))
                  }
                />
                <span>
                  {c.text}{' '}
                  <span className="muted small">
                    +{c.points}
                    {awarded && ` · ${c.award!.player ?? 'team'}`}
                  </span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>
      {needScorer && <p className="muted small">Pick a player above, then tick the clue they uncovered.</p>}

      <h3>Bonuses</h3>
      <div className="row wrap">
        <button className="btn" disabled={busy || needScorer} onClick={() => act(() => api.awardBonus('partial', scorerId))}>
          Partial deduction +{s.partial}
        </button>
        <button
          className="btn btn-good"
          disabled={busy || needScorer || round.solved}
          onClick={() => act(() => api.awardBonus('solve', scorerId))}
        >
          Solved! +{s.solve}
        </button>
        <button
          className="btn btn-warn"
          disabled={busy || needScorer}
          onClick={() => {
            if (window.confirm(`Apply ${s.wrong_guess} for a wrong solution to ${scorerName}?`))
              void act(() => api.awardBonus('wrong_guess', scorerId))
          }}
        >
          Wrong guess {s.wrong_guess}
        </button>
      </div>

      <h3>Round</h3>
      <div className="row wrap">
        <button
          className="btn"
          disabled={busy || round.revealed}
          onClick={() => {
            if (window.confirm('Show the solution on the Player View?')) void act(api.revealSolution)
          }}
        >
          Reveal solution
        </button>
        <button className="btn btn-primary" disabled={busy} onClick={() => act(api.closeMystery)}>
          Close mystery
        </button>
      </div>
    </section>
  )
}

function PlayersPanel({
  state,
  api,
  act,
  busy,
  disabled,
}: {
  state: HostState
  api: HostApi
  act: Act
  busy: boolean
  disabled: boolean
}) {
  const [name, setName] = useState('')
  const [spectator, setSpectator] = useState(false)
  const [linkCodes, setLinkCodes] = useState<Record<string, { code: string; expires: string }>>({})
  const sorted = useMemo(
    () => [...state.board.players].sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name)),
    [state.board.players],
  )

  const makeCode = (p: BoardPlayer) =>
    act(async () => {
      const r = await api.createLinkCode(p.id)
      setLinkCodes((m) => ({ ...m, [p.id]: { code: r.link_code, expires: r.expires_at } }))
    })

  return (
    <section className="card">
      <h2>Players</h2>
      {state.link_requests.length > 0 && (
        <div className="requests" role="status">
          {state.link_requests.map((r) => (
            <div key={r.id} className="request">
              <span>
                Someone used <strong>{r.player}</strong>’s code. Is it really them?
              </span>
              <div className="row">
                <button className="btn btn-small btn-good" disabled={busy} onClick={() => act(() => api.resolveLink(r.id, true))}>
                  Yes, link
                </button>
                <button className="btn btn-small" disabled={busy} onClick={() => act(() => api.resolveLink(r.id, false))}>
                  No
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ul className="players">
        {sorted.map((p) => (
          <PlayerRow
            key={p.id}
            p={p}
            busy={busy}
            disabled={disabled}
            linkCode={linkCodes[p.id]}
            onRename={(n) => act(() => api.renamePlayer(p.id, n))}
            onRole={() => act(() => api.setRole(p.id, p.role === 'player' ? 'spectator' : 'player'))}
            onRemove={() => {
              if (window.confirm(`Remove ${p.name}? Their points will no longer count.`)) void act(() => api.removePlayer(p.id))
            }}
            onLinkCode={() => makeCode(p)}
          />
        ))}
        {sorted.length === 0 && <li className="muted small">Nobody yet. Share the code, or add people below.</li>}
      </ul>

      {!disabled && (
        <form
          className="add-player"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            void act(async () => {
              await api.addPlayer(name, spectator)
              setName('')
            })
          }}
        >
          <label className="field">
            Add someone without the web app
            <input value={name} maxLength={24} placeholder="Name" onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="check small">
            <input type="checkbox" checked={spectator} onChange={(e) => setSpectator(e.target.checked)} /> Spectator
          </label>
          <button type="submit" className="btn" disabled={busy || !name.trim()}>
            Add
          </button>
        </form>
      )}
    </section>
  )
}

function PlayerRow({
  p,
  busy,
  disabled,
  linkCode,
  onRename,
  onRole,
  onRemove,
  onLinkCode,
}: {
  p: BoardPlayer
  busy: boolean
  disabled: boolean
  linkCode?: { code: string; expires: string }
  onRename: (name: string) => void
  onRole: () => void
  onRemove: () => void
  onLinkCode: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(p.name)
  return (
    <li className="player">
      {editing ? (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault()
            onRename(draft)
            setEditing(false)
          }}
        >
          <input aria-label={`New name for ${p.name}`} value={draft} maxLength={24} autoFocus onChange={(e) => setDraft(e.target.value)} />
          <button className="btn btn-small" type="submit">
            Save
          </button>
          <button className="btn btn-small" type="button" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <div className="player-line">
          <span>
            <strong>{p.name}</strong>{' '}
            <span className="muted small">
              {p.role === 'spectator' ? 'spectator' : `${p.score} pts`}
              {p.join_method === 'manual' && (p.linked ? ' · linked' : ' · added by host')}
            </span>
          </span>
          {!disabled && (
            <span className="row">
              <button className="btn btn-small" disabled={busy} onClick={() => { setDraft(p.name); setEditing(true) }}>
                Rename
              </button>
              <button className="btn btn-small" disabled={busy} onClick={onRole}>
                {p.role === 'player' ? 'Make spectator' : 'Make player'}
              </button>
              {p.join_method === 'manual' && !p.linked && (
                <button className="btn btn-small" disabled={busy} onClick={onLinkCode}>
                  Link code
                </button>
              )}
              <button className="btn btn-small btn-danger" disabled={busy} onClick={onRemove}>
                Remove
              </button>
            </span>
          )}
        </div>
      )}
      {linkCode && !p.linked && (
        <p className="linkcode small">
          Send privately to {p.name}: <strong className="mono">{linkCode.code}</strong>{' '}
          <span className="muted">(valid until {new Date(linkCode.expires).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})</span>
        </p>
      )}
    </li>
  )
}

const REASON: Record<ScoreEvent['reason'], string> = {
  clue: 'Clue',
  partial: 'Partial deduction',
  solve: 'Solved',
  wrong_guess: 'Wrong guess',
  reversal: 'Undone',
}

function EventLog({ events, api, act, disabled }: { events: ScoreEvent[]; api: HostApi; act: Act; disabled: boolean }) {
  if (events.length === 0) return null
  return (
    <details className="card log">
      <summary>Score history ({events.length})</summary>
      <ul>
        {events.map((e) => (
          <li key={e.id} className={e.reversed ? 'struck' : ''}>
            <span className="muted small">{new Date(e.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>{' '}
            <strong>{e.amount > 0 ? `+${e.amount}` : e.amount}</strong> {REASON[e.reason]} · {e.player ?? 'team'}
            {e.clue && <span className="muted small"> — {e.clue}</span>}
            {!disabled && !e.reversed && ['partial', 'solve', 'wrong_guess'].includes(e.reason) && (
              <button className="btn btn-small" onClick={() => act(() => api.reverseEvent(e.id))}>
                Undo
              </button>
            )}
          </li>
        ))}
      </ul>
    </details>
  )
}

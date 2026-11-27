import { Copy, ExternalLink, Flag } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ConnectionBadge, ErrorNote, PageSkeleton, Scoreboard, Shell, Timer } from '../components/common'
import { ConfirmButton } from '../components/ConfirmButton'
import { MysteryImage } from '../components/MysteryImage'
import { GameError, hostApi, type HostApi } from '../lib/api'
import { resultHeadline } from '../lib/game'
import { routeUrl } from '../lib/router'
import { hostCredential } from '../lib/storage'
import type { BoardPlayer, HostState, ScoreEvent } from '../lib/types'
import { useLiveState } from '../lib/useLiveState'

// Page pattern: Detail (the running mystery) with a side panel (scores, players).

const TEAM = '__team__'

export default function HostView({ code }: { code: string }) {
  const credential = hostCredential.get(code)
  if (!credential) {
    return (
      <Shell home="#/host">
        <section className="sheet narrow">
          <h1>This browser can’t host game {code}</h1>
          <p>Only the browser that created a game holds its host key. You can still follow the game on the public screen.</p>
          <a className="btn btn-primary" href={`#/play/${code}`}>
            Open the public screen
          </a>
        </section>
      </Shell>
    )
  }
  return <HostConsole code={code} api={hostApi(code, credential)} />
}

function HostConsole({ code, api }: { code: string; api: HostApi }) {
  const { data, error, connection, refresh } = useLiveState(code, api.getState)
  const [actionError, setActionError] = useState<GameError | null>(null)
  const [busy, setBusy] = useState(false)

  // Runs a host action, shows a clear error and refreshes (the broadcast will
  // also arrive; the explicit refresh just makes the host UI snappier).
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setActionError(null)
    try {
      await fn()
    } catch (e) {
      setActionError(e instanceof GameError ? e : new GameError('unknown'))
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
        <Shell home="#/host">
          <section className="sheet narrow">
            <h1>Game {code} has ended</h1>
            <p>It was closed and cleaned up, so it can’t be hosted any more. Create a new game to play again.</p>
            <a className="btn btn-primary" href="#/host">
              Create a new game
            </a>
          </section>
        </Shell>
      )
    }
    return <Shell wide home="#/host">{error ? <ErrorNote error={error} /> : <PageSkeleton />}</Shell>
  }

  const ended = data.session.status === 'ended'
  return (
    <Shell wide home="#/host">
      <HostHeader state={data} connection={connection} onEnd={() => act(api.endSession)} busy={busy} />
      <ErrorNote error={actionError} />
      {ended ? (
        <section className="result">
          <p className="stamp">{data.session.end_reason === 'time_limit' ? 'Time limit reached' : 'Game ended'}</p>
          <h1>{resultHeadline(data.session, data.board)}</h1>
          <p className="muted">
            {data.board.mysteries_solved} of {data.board.mysteries_played} mysteries solved. The results are saved and the
            game can no longer change.
          </p>
          <a className="btn btn-primary" href="#/host">
            Create a new game
          </a>
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
  const message = `Join Friday Games: ${routeUrl(`/join/${s.code}`)} (code ${s.code})`
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
    <div className="host-bar">
      <div className="statusbar">
        <span className="badge badge-private" title="Don’t share this tab on screen">
          Private host view
        </span>
        <span className="code-chip">
          <span className="code-chip-label">Code</span>
          <strong>{s.code}</strong>
        </span>
        <span className="muted hide-narrow">
          {s.mode === 'competitive' ? 'Competitive' : `Cooperative, goal ${s.settings.coop_target}`}
        </span>
        <span className="spacer" />
        <ConnectionBadge connection={connection} />
        <Timer session={s} />
      </div>
      <div className="host-actions">
        <button className="btn" onClick={() => window.open(`#/play/${s.code}`, '_blank', 'noopener')}>
          <ExternalLink size={18} aria-hidden="true" /> Open Player View
        </button>
        <button className="btn" onClick={copy}>
          <Copy size={18} aria-hidden="true" /> {copied ? 'Copied' : 'Copy join link'}
        </button>
        {s.status !== 'ended' && (
          <ConfirmButton
            className="btn btn-danger"
            disabled={busy}
            title={`End game ${s.code} for everyone?`}
            body="The final scores are saved and nobody can join or score after this."
            confirmLabel="End game"
            onConfirm={onEnd}
          >
            <Flag size={18} aria-hidden="true" /> End game
          </ConfirmButton>
        )}
      </div>
      {showLink && (
        <div className="join-link" role="status">
          <label className="field">
            {copied ? 'Copied. Paste it in the Teams chat:' : 'Copy this message and paste it in the Teams chat:'}
            <input readOnly value={message} onFocus={(e) => e.currentTarget.select()} ref={(el) => el?.select()} />
          </label>
          <button className="btn" onClick={() => setShowLink(false)}>
            Hide link
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
  const [hint, setHint] = useState(false)

  const scorerId = scorer === TEAM ? null : scorer || null
  const scorerName = scorer === TEAM ? 'the team' : players.find((p) => p.id === scorer)?.name ?? ''
  const needScorer = !coop && !scorerId
  const s = state.session.settings

  // Scoring controls stay clickable; without a chosen player they explain what to do.
  const score = (fn: () => Promise<unknown>) => {
    if (needScorer) {
      setHint(true)
      document.getElementById('scorer')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      return
    }
    setHint(false)
    void act(fn)
  }

  if (!round) {
    const last = state.round
    const next = state.catalog.find((m) => !m.played)
    const chosen = picked || next?.id || state.catalog[0]?.id
    return (
      <section className="sheet">
        <h2 className="section-title">{last ? 'Choose the next mystery' : 'Choose the first mystery'}</h2>
        {last && (
          <p className="muted">
            Last mystery: {last.mystery.title}, {last.solved ? `solved${last.solved_by ? ` by ${last.solved_by}` : ''}` : 'not solved'}.
          </p>
        )}
        {state.session.status === 'lobby' && <p className="muted">The 60-minute timer starts when you start the first mystery.</p>}
        <fieldset>
          <legend className="sr-only">Mystery</legend>
          <ul className="catalog">
            {state.catalog.map((m) => (
              <li key={m.id}>
                <label className="option">
                  <input type="radio" name="mystery" value={m.id} checked={chosen === m.id} onChange={() => setPicked(m.id)} />
                  <span>
                    <strong>{m.title}</strong>{' '}
                    <span className="muted small">
                      {m.category}, {m.difficulty.toLowerCase()}
                      {m.played && ' (already played)'}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <button className="btn btn-primary" disabled={busy || !chosen} onClick={() => act(() => api.startMystery(chosen!))}>
          {busy ? 'Starting…' : 'Start mystery'}
        </button>
      </section>
    )
  }

  return (
    <section className="sheet host-mystery">
      <div className="host-mystery-head">
        <MysteryImage path={round.mystery.image} className="thumb" />
        <div>
          <p className="meta">
            <span>Mystery {round.seq}</span>
            <span>{round.mystery.category}</span>
            <span className={`diff diff-${round.mystery.difficulty.toLowerCase()}`}>{round.mystery.difficulty}</span>
            {round.solved && <span className="status-good">Solved{round.solved_by ? ` by ${round.solved_by}` : ''}</span>}
            {round.revealed && <span>Solution shown</span>}
          </p>
          <h2>{round.mystery.title}</h2>
          <p className="prompt">{round.mystery.prompt}</p>
        </div>
      </div>

      <div className={`secret ${showSolution ? '' : 'hidden-secret'}`}>
        <div className="secret-head">
          <strong>Solution, only for you</strong>
          <button className="btn btn-small" onClick={() => setShowSolution((v) => !v)} aria-expanded={showSolution}>
            {showSolution ? 'Hide solution' : 'Show solution'}
          </button>
        </div>
        {showSolution ? <p>{round.solution}</p> : <p className="muted small">Hidden in case this tab is on screen.</p>}
      </div>

      <div className={`scorer ${hint && needScorer ? 'needs-attention' : ''}`} id="scorer" role="group" aria-labelledby="scorer-label">
        <p className="scorer-label" id="scorer-label">
          Who gets the points?
        </p>
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
              onClick={() => {
                setScorer(p.id)
                setHint(false)
              }}
              aria-pressed={scorer === p.id}
            >
              {p.name}
            </button>
          ))}
          {players.length === 0 && <span className="muted small">No players yet. Add them in the Players panel.</span>}
        </div>
        {hint && needScorer && (
          <p className="field-error" role="alert">
            Choose who gets the points first.
          </p>
        )}
      </div>

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
                  disabled={busy}
                  onChange={() => (awarded ? void act(() => api.revokeClue(c.id)) : score(() => api.awardClue(c.id, scorerId)))}
                />
                <span>
                  {c.text}{' '}
                  <span className="clue-points">
                    +{c.points}
                    {awarded && `, ${c.award!.player ?? 'team'}`}
                  </span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>

      <h3>Bonuses</h3>
      <div className="row wrap">
        <button className="btn" disabled={busy} onClick={() => score(() => api.awardBonus('partial', scorerId))}>
          Award partial +{s.partial}
        </button>
        <button className="btn btn-good" disabled={busy || round.solved} onClick={() => score(() => api.awardBonus('solve', scorerId))}>
          Mark solved +{s.solve}
        </button>
        {needScorer ? (
          <button className="btn btn-warn" disabled={busy} onClick={() => score(async () => undefined)}>
            Deduct {Math.abs(s.wrong_guess)} for wrong guess
          </button>
        ) : (
          <ConfirmButton
            className="btn btn-warn"
            disabled={busy}
            title={`Deduct ${Math.abs(s.wrong_guess)} points from ${scorerName}?`}
            body="Use this when a proposed solution was wrong. You can undo it in the score history."
            confirmLabel={`Deduct ${Math.abs(s.wrong_guess)} points`}
            onConfirm={() => void act(() => api.awardBonus('wrong_guess', scorerId))}
          >
            Deduct {Math.abs(s.wrong_guess)} for wrong guess
          </ConfirmButton>
        )}
      </div>

      <h3>Round</h3>
      <div className="row wrap">
        <ConfirmButton
          disabled={busy || round.revealed}
          danger={false}
          title={`Show the solution to “${round.mystery.title}”?`}
          body="Everyone watching the Player View will see it."
          confirmLabel="Reveal solution"
          onConfirm={() => void act(api.revealSolution)}
        >
          Reveal solution
        </ConfirmButton>
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
  const [nameError, setNameError] = useState<string | null>(null)
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
                Someone entered <strong>{r.player}</strong>’s code. Is it really them?
              </span>
              <div className="row wrap">
                <button className="btn btn-good" disabled={busy} onClick={() => act(() => api.resolveLink(r.id, true))}>
                  Link {r.player}
                </button>
                <button className="btn" disabled={busy} onClick={() => act(() => api.resolveLink(r.id, false))}>
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="empty">
          <h3>No players yet</h3>
          <p className="muted small">Players appear here as soon as they join with the code. Add anyone who can’t open the link below.</p>
        </div>
      ) : (
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
              onRemove={() => void act(() => api.removePlayer(p.id))}
              onLinkCode={() => makeCode(p)}
            />
          ))}
        </ul>
      )}

      {!disabled && (
        <form
          className="add-player"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) {
              setNameError('Enter a name to add a player.')
              return
            }
            void act(async () => {
              await api.addPlayer(name, spectator)
              setName('')
            })
          }}
        >
          <label className="field">
            Add someone without the web app
            <input
              value={name}
              maxLength={24}
              autoComplete="off"
              aria-invalid={Boolean(nameError)}
              aria-describedby={nameError ? 'add-name-error' : undefined}
              onBlur={() => setNameError(null)}
              onChange={(e) => {
                setName(e.target.value)
                setNameError(null)
              }}
            />
            {nameError && (
              <span className="field-error" id="add-name-error">
                {nameError}
              </span>
            )}
          </label>
          <label className="check">
            <input type="checkbox" checked={spectator} onChange={(e) => setSpectator(e.target.checked)} /> Add as a spectator
          </label>
          <button type="submit" className="btn" disabled={busy}>
            Add player
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
  const save = () => {
    if (draft.trim() && draft.trim() !== p.name) onRename(draft)
    setEditing(false)
  }
  return (
    <li className="player">
      {/* Name and rename input share one reserved box, so nothing moves while editing */}
      <div className="player-name">
        {editing ? (
          <input
            aria-label={`New name for ${p.name}`}
            value={draft}
            maxLength={24}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') setEditing(false)
            }}
          />
        ) : (
          <span>
            <strong>{p.name}</strong>{' '}
            <span className="muted small">
              {p.role === 'spectator' ? 'spectator' : `${p.score} pts`}
              {p.join_method === 'manual' && (p.linked ? ', linked' : ', added by host')}
            </span>
          </span>
        )}
      </div>
      {!disabled && (
        <div className="player-actions">
          {/* Same buttons in both modes, so the row never changes shape while renaming */}
          {editing ? (
            <button className="btn btn-small btn-primary" onClick={save}>
              Save name
            </button>
          ) : (
            <button
              className="btn btn-small"
              disabled={busy}
              onClick={() => {
                setDraft(p.name)
                setEditing(true)
              }}
            >
              Rename
            </button>
          )}
          {editing ? (
            <button className="btn btn-small" onClick={() => setEditing(false)}>
              Cancel
            </button>
          ) : (
            <button className="btn btn-small" disabled={busy} onClick={onRole}>
              {p.role === 'player' ? 'Make spectator' : 'Make player'}
            </button>
          )}
          {p.join_method === 'manual' && !p.linked && (
            <button className="btn btn-small" disabled={busy || editing} onClick={onLinkCode}>
              Create link code
            </button>
          )}
          <ConfirmButton
            className="btn btn-small btn-danger"
            disabled={busy || editing}
            title={`Remove ${p.name} from the game?`}
            body="Their points stop counting and their screen stops updating. Their name becomes free again."
            confirmLabel={`Remove ${p.name}`}
            onConfirm={onRemove}
          >
            Remove
          </ConfirmButton>
        </div>
      )}
      {linkCode && !p.linked && (
        <p className="linkcode small">
          Send privately to {p.name}: <strong>{linkCode.code}</strong>{' '}
          <span className="muted">
            (valid until {new Date(linkCode.expires).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
          </span>
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
            <strong>{e.amount > 0 ? `+${e.amount}` : e.amount}</strong> {REASON[e.reason]}, {e.player ?? 'team'}
            {e.clue && <span className="muted small"> ({e.clue})</span>}
            {!disabled && !e.reversed && ['partial', 'solve', 'wrong_guess'].includes(e.reason) && (
              <button className="btn btn-small" onClick={() => act(() => api.reverseEvent(e.id))}>
                Undo score
              </button>
            )}
          </li>
        ))}
      </ul>
    </details>
  )
}

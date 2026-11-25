import { useEffect, useMemo, useState } from 'react'
import { ErrorNote, Loading, Shell } from '../components/common'
import { ConfirmButton } from '../components/ConfirmButton'
import { MysteryImage } from '../components/MysteryImage'
import { adminApi, GameError } from '../lib/api'
import { adminKey } from '../lib/storage'
import type { AdminClue, AdminMystery } from '../lib/types'

// Page patterns: Form (key entry), List (stories), Form (edit a story).

const EMPTY: AdminMystery = {
  title: '',
  category: '',
  difficulty: 'Medium',
  prompt: '',
  solution: '',
  active: true,
  clues: [
    { text: '', points: 3 },
    { text: '', points: 3 },
    { text: '', points: 3 },
    { text: '', points: 3 },
  ],
}

// Unsaved edits are kept in this browser so a refresh or misclick loses nothing.
const draftKey = (id?: string) => `friday-games:draft:${id ?? 'new'}`
function readDraft(id?: string): AdminMystery | null {
  try {
    const raw = window.localStorage.getItem(draftKey(id))
    return raw ? (JSON.parse(raw) as AdminMystery) : null
  } catch {
    return null
  }
}
function writeDraft(id: string | undefined, m: AdminMystery | null) {
  try {
    if (m) window.localStorage.setItem(draftKey(id), JSON.stringify(m))
    else window.localStorage.removeItem(draftKey(id))
  } catch {
    /* storage unavailable */
  }
}

export default function AdminView() {
  const [key, setKey] = useState<string | null>(() => adminKey.get())
  if (!key)
    return (
      <AdminLogin
        onKey={(k) => {
          adminKey.set(k)
          setKey(k)
        }}
      />
    )
  return (
    <StoryEditor
      api={adminApi(key)}
      onLogout={() => {
        adminKey.set(null)
        setKey(null)
      }}
    />
  )
}

function AdminLogin({ onKey }: { onKey: (k: string) => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<GameError | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <Shell home="#/host">
      <section className="sheet narrow">
        <h1>Story Editor</h1>
        <p className="muted">Enter the admin key to add and edit mysteries. This browser remembers it.</p>
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault()
            if (value.trim().length < 16) {
              setFieldError('Enter the full admin key. It’s at least 16 characters long.')
              return
            }
            setBusy(true)
            setError(null)
            try {
              await adminApi(value.trim()).list()
              onKey(value.trim())
            } catch (err) {
              setError(err instanceof GameError ? err : new GameError('unknown'))
            } finally {
              setBusy(false)
            }
          }}
        >
          <label className="field">
            Admin key
            <input
              type="password"
              autoComplete="current-password"
              value={value}
              aria-invalid={Boolean(fieldError)}
              aria-describedby={fieldError ? 'key-error' : undefined}
              onChange={(e) => {
                setValue(e.target.value)
                setFieldError(null)
              }}
              onBlur={() => {
                if (value && value.trim().length < 16) setFieldError('Enter the full admin key. It’s at least 16 characters long.')
              }}
            />
            {fieldError && (
              <span className="field-error" id="key-error">
                {fieldError}
              </span>
            )}
          </label>
          <ErrorNote error={error} />
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Checking…' : 'Open Story Editor'}
          </button>
        </form>
      </section>
    </Shell>
  )
}

function StoryEditor({ api, onLogout }: { api: ReturnType<typeof adminApi>; onLogout: () => void }) {
  const [list, setList] = useState<AdminMystery[] | null>(null)
  const [editing, setEditing] = useState<AdminMystery | null>(null)
  const [error, setError] = useState<GameError | null>(null)
  const [filter, setFilter] = useState<'active' | 'archived' | 'all'>('active')
  const [query, setQuery] = useState('')

  const load = async () => {
    try {
      setList(await api.list())
    } catch (e) {
      const err = e instanceof GameError ? e : new GameError('unknown')
      setError(err)
      if (err.code === 'not_admin') onLogout()
    }
  }
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (editing) {
    return (
      <MysteryForm
        api={api}
        initial={editing}
        onClose={() => {
          setEditing(null)
          void load()
        }}
      />
    )
  }

  const q = query.trim().toLowerCase()
  const shown = (list ?? [])
    .filter((m) => (filter === 'all' ? true : filter === 'active' ? m.active : !m.active))
    .filter((m) => !q || `${m.title} ${m.category} ${m.difficulty}`.toLowerCase().includes(q))
  const filtered = filter !== 'all' || q

  return (
    <Shell wide home="#/host">
      <div className="list-head">
        <h1>Stories</h1>
        <div className="row wrap">
          <button className="btn btn-primary" onClick={() => setEditing(readDraft() ?? structuredClone(EMPTY))}>
            New mystery
          </button>
          <button className="btn" onClick={onLogout}>
            Lock editor
          </button>
        </div>
      </div>
      <ErrorNote error={error} />

      <div className="list-tools">
        <label className="field search-field">
          Search stories
          <input type="search" value={query} placeholder="e.g. lighthouse" onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="tabs" role="tablist" aria-label="Show">
          {(['active', 'archived', 'all'] as const).map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
              {f === 'active' ? 'In the game' : f === 'archived' ? 'Archived' : 'All'}
            </button>
          ))}
        </div>
      </div>

      {!list ? (
        <Loading />
      ) : (
        <div className="table-frame">
          {shown.length === 0 ? (
            filtered && (list ?? []).length > 0 ? (
              <div className="empty">
                <h2>No stories match</h2>
                <p className="muted">Nothing in this view matches “{query || filter}”. Clear the search to see every story.</p>
                <button
                  className="btn"
                  onClick={() => {
                    setQuery('')
                    setFilter('all')
                  }}
                >
                  Clear search and filters
                </button>
              </div>
            ) : (
              <div className="empty">
                <h2>No stories yet</h2>
                <p className="muted">Each story you add becomes a mystery hosts can start in a game.</p>
                <button className="btn btn-primary" onClick={() => setEditing(structuredClone(EMPTY))}>
                  New mystery
                </button>
              </div>
            )
          ) : (
            <table className="story-table">
              <thead>
                <tr>
                  <th scope="col">Story</th>
                  <th scope="col" className="hide-narrow">
                    Category
                  </th>
                  <th scope="col">Difficulty</th>
                  <th scope="col" className="hide-narrow num">
                    Clues
                  </th>
                  <th scope="col" className="hide-narrow num">
                    Played
                  </th>
                  <th scope="col" className="hide-narrow">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((m) => (
                  <tr key={m.id} className="row-link" onClick={() => setEditing(structuredClone(readDraft(m.id) ?? m))}>
                    <td>
                      <span className="story-cell">
                        <MysteryImage path={m.image ?? ''} className="story-thumb" />
                        <button
                          className="link-button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditing(structuredClone(readDraft(m.id) ?? m))
                          }}
                        >
                          {m.title}
                        </button>
                      </span>
                    </td>
                    <td className="hide-narrow">{m.category}</td>
                    <td>
                      <span className={`diff diff-${m.difficulty.toLowerCase()}`}>{m.difficulty}</span>
                    </td>
                    <td className="hide-narrow num">{m.clues.length}</td>
                    <td className="hide-narrow num">{m.times_played ?? 0}</td>
                    <td className="hide-narrow">{m.active ? 'In the game' : 'Archived'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Shell>
  )
}

function MysteryForm({
  api,
  initial,
  onClose,
}: {
  api: ReturnType<typeof adminApi>
  initial: AdminMystery
  onClose: () => void
}) {
  const [m, setM] = useState<AdminMystery>(initial)
  const [restored] = useState(() => Boolean(readDraft(initial.id)))
  const [pendingImage, setPendingImage] = useState<{ mime: string; base64: string; preview: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<GameError | null>(null)
  const [saved, setSaved] = useState(false)
  const isNew = !m.id
  const total = useMemo(() => m.clues.reduce((s, c) => s + (Number(c.points) || 0), 0), [m.clues])

  // Auto-save the draft in this browser on every change
  useEffect(() => {
    if (!saved) writeDraft(initial.id, m)
  }, [m, saved, initial.id])

  const set = <K extends keyof AdminMystery>(k: K, v: AdminMystery[K]) => {
    setSaved(false)
    setM((cur) => ({ ...cur, [k]: v }))
  }
  const setClue = (i: number, patch: Partial<AdminClue>) => set('clues', m.clues.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  const moveClue = (i: number, d: -1 | 1) => {
    const next = [...m.clues]
    const [c] = next.splice(i, 1)
    next.splice(i + d, 0, c)
    set('clues', next)
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      let result = await api.save({ ...m, clues: m.clues.map((c) => ({ ...c, points: Number(c.points) })) })
      if (pendingImage && result.id) {
        const r = await api.uploadImage(result.id, pendingImage.mime, pendingImage.base64)
        result = { ...result, image: r.image }
        setPendingImage(null)
      }
      writeDraft(initial.id, null)
      setM(result)
      setSaved(true)
    } catch (e) {
      setError(e instanceof GameError ? e : new GameError('unknown'))
    } finally {
      setBusy(false)
    }
  }

  async function pickImage(file: File | undefined) {
    if (!file) return
    setError(null)
    try {
      setPendingImage(await compressImage(file))
      setSaved(false)
    } catch {
      setError(new GameError('invalid_image'))
    }
  }

  return (
    <Shell wide home="#/host">
      <div className="list-head">
        <div>
          <button className="btn btn-small" onClick={onClose}>
            Back to stories
          </button>
          <h1>{isNew ? 'New mystery' : m.title || 'Untitled'}</h1>
        </div>
        <div className="row wrap">
          {m.in_play && <span className="badge badge-warn">Being played right now</span>}
          {saved && (
            <span className="badge badge-live" role="status">
              Saved
            </span>
          )}
          <button className="btn btn-primary" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : isNew ? 'Create mystery' : 'Save changes'}
          </button>
        </div>
      </div>
      {restored && !saved && (
        <div className="note" role="status">
          <p>Your unsaved changes were restored.</p>
          <button
            className="btn btn-small"
            onClick={() => {
              writeDraft(initial.id, null)
              setM(initial.id ? { ...initial } : structuredClone(EMPTY))
              onClose()
            }}
          >
            Discard changes
          </button>
        </div>
      )}
      <ErrorNote error={error} />

      <div className="editor-grid">
        <div>
          <section className="sheet">
            <h2 className="section-title">Story</h2>
            <label className="field">
              Title
              <input value={m.title} maxLength={80} onChange={(e) => set('title', e.target.value)} placeholder="e.g. The Midnight Tulips" />
            </label>
            <div className="grid-2 tight">
              <label className="field">
                Category
                <input value={m.category} maxLength={40} onChange={(e) => set('category', e.target.value)} placeholder="e.g. Home & Garden" list="categories" />
                <datalist id="categories">
                  {['Everyday', 'Office', 'School', 'Business', 'Travel', 'Maritime', 'Home & Garden', 'History', 'Science', 'Sports'].map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </label>
              <label className="field">
                Difficulty
                <select value={m.difficulty} onChange={(e) => set('difficulty', e.target.value as AdminMystery['difficulty'])}>
                  <option>Easy</option>
                  <option>Medium</option>
                  <option>Hard</option>
                </select>
              </label>
            </div>
            <label className="field">
              What players see
              <span className="helper">The puzzling situation, without the answer. 2 to 4 sentences. {m.prompt.length}/1200</span>
              <textarea rows={5} value={m.prompt} maxLength={1200} onChange={(e) => set('prompt', e.target.value)} />
            </label>
            <label className="field">
              Solution
              <span className="helper">Private until the host presses Reveal.</span>
              <textarea rows={5} value={m.solution} maxLength={2000} onChange={(e) => set('solution', e.target.value)} />
            </label>
            <label className="check">
              <input type="checkbox" checked={m.active} onChange={(e) => set('active', e.target.checked)} /> Hosts can start this
              mystery (untick to archive it)
            </label>
          </section>

          <section className="sheet">
            <h2 className="section-title">Clues</h2>
            <p className="muted small">
              {m.clues.length} clues worth {total} points. Order them from broad to specific; 4 to 6 works best.
            </p>
            <ol className="clue-editor">
              {m.clues.map((c, i) => (
                <li key={c.id ?? `new-${i}`}>
                  <label className="field clue-text-field">
                    Clue {i + 1}
                    <input value={c.text} maxLength={240} placeholder="e.g. The culprit was not a person." onChange={(e) => setClue(i, { text: e.target.value })} />
                  </label>
                  <label className="field clue-points-field">
                    Points
                    <select value={c.points} onChange={(e) => setClue(i, { points: Number(e.target.value) })}>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                        <option key={n} value={n}>
                          +{n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="clue-tools">
                    <button className="icon-btn" aria-label={`Move clue ${i + 1} up`} data-tip="Move up" disabled={i === 0} onClick={() => moveClue(i, -1)}>
                      ↑
                    </button>
                    <button
                      className="icon-btn"
                      aria-label={`Move clue ${i + 1} down`}
                      data-tip="Move down"
                      disabled={i === m.clues.length - 1}
                      onClick={() => moveClue(i, 1)}
                    >
                      ↓
                    </button>
                    <button
                      className="icon-btn icon-btn-danger"
                      aria-label={`Remove clue ${i + 1}`}
                      data-tip="Remove clue"
                      disabled={m.clues.length <= 3}
                      onClick={() => set('clues', m.clues.filter((_, j) => j !== i))}
                    >
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ol>
            <button className="btn" disabled={m.clues.length >= 8} onClick={() => set('clues', [...m.clues, { text: '', points: 3 }])}>
              Add clue
            </button>
          </section>

          {!isNew && (m.times_played ?? 0) === 0 && (
            <section className="sheet">
              <h2 className="section-title">Delete</h2>
              <p className="muted small">This mystery has never been played, so it can be deleted completely.</p>
              <ConfirmButton
                className="btn btn-danger"
                disabled={busy}
                title={`Delete “${m.title}”?`}
                body="The story, its clues and its picture are removed permanently. This can’t be undone."
                confirmLabel="Delete mystery"
                onConfirm={async () => {
                  setBusy(true)
                  try {
                    await api.remove(m.id!)
                    writeDraft(initial.id, null)
                    onClose()
                  } catch (e) {
                    setError(e instanceof GameError ? e : new GameError('unknown'))
                    setBusy(false)
                  }
                }}
              >
                Delete mystery
              </ConfirmButton>
            </section>
          )}
        </div>

        <aside>
          <section className="sheet">
            <h2 className="section-title">Picture</h2>
            {pendingImage ? (
              <img src={pendingImage.preview} alt="" className="mystery-art" />
            ) : m.image ? (
              <MysteryImage path={m.image} className="mystery-art" />
            ) : (
              <div className="mystery-art img-placeholder" />
            )}
            <label className="btn file-btn">
              {m.image || pendingImage ? 'Replace picture' : 'Upload picture'}
              <input type="file" accept="image/*" onChange={(e) => void pickImage(e.target.files?.[0])} />
            </label>
            <p className="muted small">
              Landscape (16:9) looks best and it’s resized automatically. Show the scene from the story, never the answer.
              {pendingImage && ' Save changes to upload it.'}
            </p>
          </section>

          <section className="sheet preview">
            <h2 className="preview-label">How players see it</h2>
            <p className="meta">
              <span>{m.category || 'Category'}</span>
              <span className={`diff diff-${m.difficulty.toLowerCase()}`}>{m.difficulty}</span>
            </p>
            <p className="preview-title">{m.title || 'Title'}</p>
            <p className="prompt">{m.prompt || 'The puzzling situation players will read…'}</p>
            <p className="muted small">Clues found: 0 of {m.clues.length}</p>
          </section>

          <section className="card tips">
            <h2>Writing a good mystery</h2>
            <ul className="small">
              <li>The situation should sound impossible but have one clear, fair explanation.</li>
              <li>Keep the player text short: 2 to 4 sentences people can hold in their heads.</li>
              <li>Every fact in the solution should be reachable with yes/no questions.</li>
              <li>Clues go from broad (“not a person”) to specific (“the duct was open”). Give +3 for key facts and +2 for supporting ones.</li>
              <li>Easy: one twist. Medium: two linked facts. Hard: a chain of three or more.</li>
              <li>Write original stories rather than copying well-known riddles.</li>
            </ul>
          </section>
        </aside>
      </div>
    </Shell>
  )
}

// Resizes to max 1600px wide and re-encodes (WebP, or JPEG where WebP encoding
// isn't supported) so uploads stay small and fast for players.
async function compressImage(file: File): Promise<{ mime: string; base64: string; preview: string }> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1600 / bitmap.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  let dataUrl = canvas.toDataURL('image/webp', 0.82)
  let mime = 'image/webp'
  if (!dataUrl.startsWith('data:image/webp')) {
    dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    mime = 'image/jpeg'
  }
  return { mime, base64: dataUrl.split(',')[1], preview: dataUrl }
}

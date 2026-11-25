import { useEffect, useMemo, useState } from 'react'
import { ErrorNote, Loading, Shell } from '../components/common'
import { ConfirmButton } from '../components/ConfirmButton'
import { MysteryImage } from '../components/MysteryImage'
import { adminApi, GameError } from '../lib/api'
import { adminKey } from '../lib/storage'
import type { AdminClue, AdminMystery } from '../lib/types'

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

export default function AdminView() {
  const [key, setKey] = useState<string | null>(() => adminKey.get())
  if (!key) return <AdminLogin onKey={(k) => { adminKey.set(k); setKey(k) }} />
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
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <Shell home="#/host">
      <section className="card narrow">
        <h1>Story Editor</h1>
        <p className="muted">Enter the admin key to add and edit mysteries. This browser will remember it.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            setError(null)
            try {
              await adminApi(value.trim()).list()
              onKey(value.trim())
            } catch (err) {
              setError(err instanceof GameError ? err.message : 'Could not check the key.')
            } finally {
              setBusy(false)
            }
          }}
        >
          <label className="field">
            Admin key
            <input type="password" autoComplete="current-password" value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
          <ErrorNote message={error} />
          <button className="btn btn-primary" disabled={busy || value.trim().length < 16}>
            {busy ? 'Checking…' : 'Open editor'}
          </button>
        </form>
      </section>
    </Shell>
  )
}

function StoryEditor({ api, onLogout }: { api: ReturnType<typeof adminApi>; onLogout: () => void }) {
  const [list, setList] = useState<AdminMystery[] | null>(null)
  const [editing, setEditing] = useState<AdminMystery | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'active' | 'archived' | 'all'>('active')

  const load = async () => {
    try {
      setList(await api.list())
    } catch (e) {
      setError(e instanceof GameError ? e.message : 'Could not load the stories.')
      if (e instanceof GameError && e.code === 'not_admin') onLogout()
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

  const shown = (list ?? []).filter((m) => (filter === 'all' ? true : filter === 'active' ? m.active : !m.active))

  return (
    <Shell wide home="#/host">
      <div className="statusbar">
        <h1 style={{ margin: 0 }}>Story Editor</h1>
        <span className="spacer" />
        <div className="tabs" role="tablist" style={{ margin: 0 }}>
          {(['active', 'archived', 'all'] as const).map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
              {f === 'active' ? 'In the game' : f === 'archived' ? 'Archived' : 'All'}
            </button>
          ))}
        </div>
        <button className="btn btn-primary" onClick={() => setEditing(structuredClone(EMPTY))}>
          New mystery
        </button>
        <button className="btn" onClick={onLogout}>
          Lock editor
        </button>
      </div>
      <ErrorNote message={error} />
      {!list ? (
        <Loading />
      ) : (
        <div className="story-grid">
          {shown.map((m) => (
            <button key={m.id} className="story-card" onClick={() => setEditing(structuredClone(m))}>
              <MysteryImage path={m.image ?? ''} className="story-thumb" />
              <span className="story-body">
                <span className="mystery-meta">
                  <span className="pill">{m.id}</span>
                  <span className={`pill diff-${m.difficulty.toLowerCase()}`}>{m.difficulty}</span>
                  {!m.active && <span className="pill">Archived</span>}
                </span>
                <strong>{m.title}</strong>
                <span className="muted small">
                  {m.category}, {m.clues.length} clues, played {m.times_played ?? 0} times
                </span>
              </span>
            </button>
          ))}
          {shown.length === 0 && <p className="muted">Nothing here yet.</p>}
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
  const [pendingImage, setPendingImage] = useState<{ mime: string; base64: string; preview: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const isNew = !m.id
  const total = useMemo(() => m.clues.reduce((s, c) => s + (Number(c.points) || 0), 0), [m.clues])

  const set = <K extends keyof AdminMystery>(k: K, v: AdminMystery[K]) => {
    setSaved(false)
    setM((cur) => ({ ...cur, [k]: v }))
  }
  const setClue = (i: number, patch: Partial<AdminClue>) =>
    set('clues', m.clues.map((c, j) => (j === i ? { ...c, ...patch } : c)))
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
      setM(result)
      setSaved(true)
    } catch (e) {
      setError(e instanceof GameError ? e.message : 'Could not save.')
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
      setError('Could not read that image. Try a JPG or PNG.')
    }
  }

  return (
    <Shell wide home="#/host">
      <div className="statusbar">
        <button className="btn" onClick={onClose}>
          ← All stories
        </button>
        <h1 style={{ margin: 0 }}>{isNew ? 'New mystery' : m.title || 'Untitled'}</h1>
        <span className="spacer" />
        {m.in_play && <span className="badge badge-warn">Being played right now</span>}
        {saved && <span className="badge badge-live">Saved</span>}
        <button className="btn btn-primary" disabled={busy} onClick={save}>
          {busy ? 'Saving…' : isNew ? 'Create mystery' : 'Save changes'}
        </button>
      </div>
      <ErrorNote message={error} />

      <div className="editor-grid">
        <div>
          <section className="card">
            <h2>Story</h2>
            <label className="field">
              Title
              <input value={m.title} maxLength={80} onChange={(e) => set('title', e.target.value)} placeholder="The Midnight Tulips" />
            </label>
            <div className="grid-2 tight">
              <label className="field">
                Category
                <input value={m.category} maxLength={40} onChange={(e) => set('category', e.target.value)} placeholder="Home & Garden" list="categories" />
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
              What players see <span className="muted small">({m.prompt.length}/1200) — the puzzling situation, no answer</span>
              <textarea rows={5} value={m.prompt} maxLength={1200} onChange={(e) => set('prompt', e.target.value)} />
            </label>
            <label className="field">
              Solution <span className="muted small">(private until you press Reveal)</span>
              <textarea rows={5} value={m.solution} maxLength={2000} onChange={(e) => set('solution', e.target.value)} />
            </label>
            <label className="check">
              <input type="checkbox" checked={m.active} onChange={(e) => set('active', e.target.checked)} /> Available to hosts
              (untick to archive)
            </label>
          </section>

          <section className="card">
            <h2>
              Clues <span className="muted small">{m.clues.length} clues, {total} points in total (4–6 clues works best)</span>
            </h2>
            <p className="muted small">
              Order them from broad to specific. Each clue should be something players can discover with yes/no questions.
            </p>
            <ol className="clue-editor">
              {m.clues.map((c, i) => (
                <li key={c.id ?? `new-${i}`}>
                  <input
                    aria-label={`Clue ${i + 1}`}
                    value={c.text}
                    maxLength={240}
                    placeholder="e.g. The culprit was not a person."
                    onChange={(e) => setClue(i, { text: e.target.value })}
                  />
                  <select aria-label={`Points for clue ${i + 1}`} value={c.points} onChange={(e) => setClue(i, { points: Number(e.target.value) })}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <option key={n} value={n}>
                        +{n}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-small" aria-label="Move up" disabled={i === 0} onClick={() => moveClue(i, -1)}>
                    ↑
                  </button>
                  <button className="btn btn-small" aria-label="Move down" disabled={i === m.clues.length - 1} onClick={() => moveClue(i, 1)}>
                    ↓
                  </button>
                  <button
                    className="btn btn-small btn-danger"
                    aria-label="Remove clue"
                    disabled={m.clues.length <= 3}
                    onClick={() => set('clues', m.clues.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ol>
            <button className="btn" disabled={m.clues.length >= 8} onClick={() => set('clues', [...m.clues, { text: '', points: 3 }])}>
              Add clue
            </button>
          </section>

          {!isNew && (m.times_played ?? 0) === 0 && (
            <section className="card">
              <h2>Delete</h2>
              <p className="muted small">This mystery has never been played, so it can be deleted completely.</p>
              <ConfirmButton
                className="btn btn-danger"
                disabled={busy}
                question="Delete it permanently?"
                confirmLabel="Yes, delete"
                onConfirm={async () => {
                  setBusy(true)
                  try {
                    await api.remove(m.id!)
                    onClose()
                  } catch (e) {
                    setError(e instanceof GameError ? e.message : 'Could not delete.')
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
          <section className="card">
            <h2>Picture</h2>
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
              Landscape (16:9) looks best. It’s resized automatically. Show the scene from the story — never the answer.
              {pendingImage && ' Click Save to upload it.'}
            </p>
          </section>

          <section className="card preview">
            <p className="preview-label">Player preview</p>
            <div className="mystery-meta">
              <span className="pill">{m.category || 'Category'}</span>
              <span className={`pill diff-${m.difficulty.toLowerCase()}`}>{m.difficulty}</span>
            </div>
            <h2>{m.title || 'Title'}</h2>
            <p className="prompt">{m.prompt || 'The puzzling situation players will read…'}</p>
            <p className="muted small">Clues found: 0 of {m.clues.length}</p>
          </section>

          <section className="card tips">
            <h2>Writing a good mystery</h2>
            <ul className="small">
              <li>The situation should sound impossible but have one clear, fair explanation.</li>
              <li>Keep the player text short: 2–4 sentences people can hold in their heads.</li>
              <li>Every fact in the solution should be reachable with yes/no questions.</li>
              <li>Clues: start broad (“not a person”), end specific (“the duct was open”). Give +3 for key facts and +2 for supporting ones.</li>
              <li>Easy: 1 twist. Medium: 2 linked facts. Hard: a chain of 3 or more.</li>
              <li>Write original stories; don’t copy well-known riddles.</li>
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

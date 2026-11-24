import { useEffect, useState } from 'react'
import { getMysteryImage } from '../lib/api'
import { assetUrl } from '../lib/router'

// Pictures uploaded in the Story Editor live in the database ("db:<id>:<version>");
// the original ones ship with the site. Loaded images are cached per version.
const cache = new Map<string, string>()

export function MysteryImage({ path, className }: { path: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(() => resolveSync(path))

  useEffect(() => {
    const sync = resolveSync(path)
    if (sync !== null) {
      setSrc(sync)
      return
    }
    let cancelled = false
    const id = path.split(':')[1]
    getMysteryImage(id)
      .then((img) => {
        if (!img || cancelled) return
        const url = `data:${img.mime};base64,${img.data.replace(/\s/g, '')}`
        cache.set(path, url)
        setSrc(url)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [path])

  if (!src) return <div className={`${className ?? ''} img-placeholder`} aria-hidden="true" />
  return <img src={src} alt="" className={className} />
}

function resolveSync(path: string): string | null {
  if (!path) return ''
  if (!path.startsWith('db:')) return assetUrl(path)
  return cache.get(path) ?? null
}

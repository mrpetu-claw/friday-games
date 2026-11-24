import { useEffect, useState } from 'react'

// Hash routes work on GitHub Pages without server rewrites.
//   #/                 home (create / join)
//   #/host/CODE        host view (needs the host key stored in this browser)
//   #/play/CODE        public player view (safe to share in Teams)
//   #/join/CODE        join form (name, or link code for manually added players)

export type Route =
  | { name: 'home' }
  | { name: 'host'; code: string }
  | { name: 'play'; code: string }
  | { name: 'join'; code: string }

export function parseRoute(hash: string): Route {
  const [, view, code = ''] = hash.replace(/^#/, '').split('/')
  const c = code.toUpperCase()
  if (view === 'host' && c) return { name: 'host', code: c }
  if (view === 'play' && c) return { name: 'play', code: c }
  if (view === 'join') return { name: 'join', code: c }
  return { name: 'home' }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export const go = (path: string) => {
  window.location.hash = path
}

/** Absolute URL of a route, for links shared with others. */
export function routeUrl(path: string): string {
  const { origin, pathname } = window.location
  return `${origin}${pathname}#${path}`
}

export const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`

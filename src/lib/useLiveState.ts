import { useCallback, useEffect, useRef, useState } from 'react'
import { GameError } from './api'
import { supabase } from './supabase'

export type Connection = 'connecting' | 'live' | 'reconnecting'

/**
 * Keeps a piece of server state fresh for a session code.
 * - Subscribes to the public Realtime broadcast channel `session:<CODE>`. The
 *   server sends `state_changed` with only a version number, then each client
 *   refetches through the RPC that applies its own visibility rules.
 * - Falls back to polling, and refetches when the tab regains focus or the
 *   network comes back, so short drops recover on their own.
 */
export function useLiveState<T extends { session: { version: number } }>(
  code: string,
  fetcher: () => Promise<T>,
) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<GameError | null>(null)
  const [connection, setConnection] = useState<Connection>('connecting')
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const inFlight = useRef(false)
  const again = useRef(false)

  const refresh = useCallback(async () => {
    if (inFlight.current) {
      again.current = true
      return
    }
    inFlight.current = true
    try {
      do {
        again.current = false
        const next = await fetcherRef.current()
        setData(next)
        setError(null)
      } while (again.current)
    } catch (e) {
      setError(e instanceof GameError ? e : new GameError('unknown'))
    } finally {
      inFlight.current = false
    }
  }, [])

  useEffect(() => {
    if (!supabase || !code) return
    void refresh()
    const channel = supabase
      .channel(`session:${code}`)
      .on('broadcast', { event: 'state_changed' }, () => void refresh())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnection('live')
          void refresh() // catch anything missed while disconnected
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnection('reconnecting')
        }
      })

    const poll = window.setInterval(() => void refresh(), 15_000)
    const onWake = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener('online', onWake)
    window.addEventListener('focus', onWake)
    document.addEventListener('visibilitychange', onWake)
    return () => {
      window.clearInterval(poll)
      window.removeEventListener('online', onWake)
      window.removeEventListener('focus', onWake)
      document.removeEventListener('visibilitychange', onWake)
      void supabase!.removeChannel(channel)
    }
  }, [code, refresh])

  return { data, error, connection, refresh }
}

/** Re-renders every second; used for countdowns. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(t)
  }, [intervalMs])
  return now
}

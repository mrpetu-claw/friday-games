import { describe, expect, it } from 'vitest'
import { formatClock, normaliseCode, rankPlayers, remainingMs, resultHeadline } from './game'
import type { Board, BoardPlayer, SessionInfo } from './types'

const p = (name: string, score: number, role: 'player' | 'spectator' = 'player'): BoardPlayer => ({
  id: name, name, role, join_method: 'web', linked: true, score, clues: 0,
})

const session = (over: Partial<SessionInfo> = {}): SessionInfo => ({
  code: 'ABCDEF', game: 'mystery_stories', mode: 'competitive', status: 'active',
  created_at: '2026-11-27T12:00:00Z', started_at: '2026-11-27T12:00:00Z',
  expires_at: '2026-11-27T13:00:00Z', ended_at: null, end_reason: null, version: 1,
  server_now: '2026-11-27T12:00:00Z',
  settings: { partial: 5, solve: 15, wrong_guess: -2, coop_target: 60, duration_minutes: 60 },
  ...over,
})

const board = (over: Partial<Board> = {}): Board => ({
  players: [], team_score: 0, mysteries_played: 0, mysteries_solved: 0, winners: [], team_success: null, ...over,
})

describe('rankPlayers', () => {
  it('ranks by score, shares ranks on ties, drops spectators', () => {
    const r = rankPlayers([p('Ben', 3), p('Ana', 9), p('Cy', 9), p('Viewer', 0, 'spectator')])
    expect(r.map((x) => [x.name, x.rank])).toEqual([['Ana', 1], ['Cy', 1], ['Ben', 3]])
  })
})

describe('timer', () => {
  it('counts down using the server clock', () => {
    const s = session({ server_now: '2026-11-27T12:10:00Z' })
    const clientNow = new Date('2026-11-27T12:09:00Z').getTime() // client is 1 min behind
    const offset = new Date(s.server_now).getTime() - clientNow
    expect(remainingMs(s, offset, clientNow)).toBe(50 * 60 * 1000)
  })
  it('is null before the first mystery and 0 once ended', () => {
    expect(remainingMs(session({ expires_at: null }), 0)).toBeNull()
    expect(remainingMs(session({ status: 'ended' }), 0)).toBe(0)
  })
  it('formats m:ss', () => {
    expect(formatClock(61_000)).toBe('1:01')
    expect(formatClock(0)).toBe('0:00')
  })
})

describe('resultHeadline', () => {
  it('handles a single winner, a shared victory and cooperative mode', () => {
    expect(resultHeadline(session(), board({ winners: ['Ana'] }))).toBe('Ana wins!')
    expect(resultHeadline(session(), board({ winners: ['Ana', 'Ben', 'Cy'] }))).toBe('Shared victory: Ana, Ben and Cy!')
    expect(resultHeadline(session({ mode: 'cooperative' }), board({ team_score: 61, team_success: true })))
      .toContain('Team goal reached')
  })
})

it('normalises codes', () => {
  expect(normaliseCode(' ab-c d3f9 ')).toBe('ABCD3F')
})

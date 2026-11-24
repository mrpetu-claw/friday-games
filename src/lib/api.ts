import { supabase } from './supabase'
import type { AdminMystery, HostState, PublicState, WhoAmI } from './types'

const MESSAGES: Record<string, string> = {
  not_found: 'No game found with that code. Check the code and try again.',
  not_authorized: 'This browser does not hold the host key for this game.',
  session_ended: 'This game has already finished.',
  name_taken: 'Someone in this game already uses that name. Try another one.',
  invalid_name: 'Names need 1–24 characters and cannot contain < > { } or \\.',
  rate_limited: 'Too many attempts. Wait a few minutes and try again.',
  invalid_code: 'That code is not valid or has expired. Ask the host for a new one.',
  no_active_mystery: 'Start a mystery first.',
  clue_already_awarded: 'That clue has already been awarded.',
  clue_not_awarded: 'That clue was not awarded.',
  player_required: 'Choose which player gets the points.',
  invalid_player: 'That player can’t receive points (removed or spectator).',
  already_solved: 'This mystery has already been marked as solved.',
  already_reversed: 'That score has already been undone.',
  not_admin: 'That admin key is not correct.',
  invalid_title: 'The title needs 1–80 characters.',
  invalid_category: 'The category needs 1–40 characters.',
  invalid_difficulty: 'Choose Easy, Medium or Hard.',
  invalid_prompt: 'The story for players needs 20–1200 characters.',
  invalid_solution: 'The solution needs 20–2000 characters.',
  invalid_clue_count: 'A mystery needs between 3 and 8 clues (4–6 works best).',
  invalid_clue_text: 'Each clue needs 3–240 characters.',
  invalid_clue_points: 'Clue points must be between 1 and 10.',
  mystery_in_play: 'This mystery is being played right now. Edit it after the round closes.',
  mystery_used: 'This mystery has already been played, so it can’t be deleted. Archive it instead.',
  invalid_image: 'That file isn’t a supported image (use JPG, PNG or WebP).',
  image_too_large: 'That image is too large even after compression. Try a smaller one.',
}

export class GameError extends Error {
  code: string
  constructor(code: string) {
    super(MESSAGES[code] ?? 'Something went wrong. Please try again.')
    this.code = code
  }
}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new GameError('not_configured')
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new GameError(error.message || 'unknown')
  if (data && typeof data === 'object' && 'error' in data) throw new GameError(String((data as { error: string }).error))
  return data as T
}

// ---- public
export const createSession = (mode: string, coopTarget: number) =>
  call<{ code: string; host_credential: string }>('create_session', { p_mode: mode, p_coop_target: coopTarget })

export const getPublicState = (code: string) => call<PublicState>('get_public_state', { p_code: code })

export const joinSession = (code: string, name: string, spectator: boolean) =>
  call<{ player_id: string; player_token: string; name: string }>('join_session', {
    p_code: code,
    p_name: name,
    p_spectator: spectator,
  })

export const whoami = (code: string, token: string) => call<WhoAmI>('whoami', { p_code: code, p_token: token })

export const requestLink = (code: string, linkCode: string) =>
  call<{ claim_token: string; name: string }>('request_link', { p_code: code, p_link_code: linkCode })

// ---- host (credential is sent in the request body, never in a URL)
export function hostApi(code: string, credential: string) {
  const h = (fn: string, args: Record<string, unknown> = {}) =>
    call<unknown>(fn, { p_code: code, p_credential: credential, ...args })
  return {
    getState: () => h('host_get_state') as Promise<HostState>,
    addPlayer: (name: string, spectator: boolean) => h('host_add_player', { p_name: name, p_spectator: spectator }),
    renamePlayer: (id: string, name: string) => h('host_rename_player', { p_player_id: id, p_name: name }),
    setRole: (id: string, role: 'player' | 'spectator') => h('host_set_role', { p_player_id: id, p_role: role }),
    removePlayer: (id: string) => h('host_remove_player', { p_player_id: id }),
    createLinkCode: (id: string) =>
      h('host_create_link_code', { p_player_id: id }) as Promise<{ link_code: string; expires_at: string }>,
    resolveLink: (requestId: string, approve: boolean) =>
      h('host_resolve_link', { p_request_id: requestId, p_approve: approve }),
    startMystery: (mysteryId: string) => h('host_start_mystery', { p_mystery_id: mysteryId }),
    awardClue: (clueId: string, playerId: string | null) =>
      h('host_award_clue', { p_clue_id: clueId, p_player_id: playerId }),
    revokeClue: (clueId: string) => h('host_revoke_clue', { p_clue_id: clueId }),
    awardBonus: (kind: 'partial' | 'solve' | 'wrong_guess', playerId: string | null) =>
      h('host_award_bonus', { p_kind: kind, p_player_id: playerId }),
    reverseEvent: (eventId: string) => h('host_reverse_event', { p_event_id: eventId }),
    revealSolution: () => h('host_reveal_solution'),
    closeMystery: () => h('host_close_mystery'),
    endSession: () => h('host_end_session'),
  }
}
export type HostApi = ReturnType<typeof hostApi>

// ---- Story Editor (admin key is kept in this browser only)
export function adminApi(key: string) {
  const a = (fn: string, args: Record<string, unknown> = {}) => call<unknown>(fn, { p_key: key, ...args })
  return {
    list: () => a('admin_list_mysteries') as Promise<AdminMystery[]>,
    save: (m: AdminMystery) => a('admin_save_mystery', { p_mystery: m }) as Promise<AdminMystery>,
    uploadImage: (id: string, mime: string, base64: string) =>
      a('admin_upload_image', { p_mystery_id: id, p_mime: mime, p_base64: base64 }) as Promise<{ image: string }>,
    remove: (id: string) => a('admin_delete_mystery', { p_mystery_id: id }),
  }
}

export const getMysteryImage = (id: string) =>
  call<{ mime: string; data: string } | null>('get_mystery_image', { p_mystery_id: id })

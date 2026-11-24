// Small wrapper over localStorage. Host credentials and player tokens stay in
// this browser only — they are never put in a URL or shown on screen.

const PREFIX = 'friday-games:'

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(PREFIX + key)
    else window.localStorage.setItem(PREFIX + key, value)
  } catch {
    /* storage unavailable (private mode): the session still works until reload */
  }
}

export const hostCredential = {
  get: (code: string) => read(`host:${code}`),
  set: (code: string, cred: string) => write(`host:${code}`, cred),
  forget: (code: string) => write(`host:${code}`, null),
}

export const playerToken = {
  get: (code: string) => read(`player:${code}`),
  set: (code: string, token: string | null) => write(`player:${code}`, token),
}

export function recentHostedCodes(): string[] {
  try {
    return Object.keys(window.localStorage)
      .filter((k) => k.startsWith(PREFIX + 'host:'))
      .map((k) => k.slice((PREFIX + 'host:').length))
  } catch {
    return []
  }
}

export const adminKey = {
  get: () => read('admin'),
  set: (key: string | null) => write('admin', key),
}

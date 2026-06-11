/**
 * Публичный origin для QR и deep-link (IMP-UX-002).
 * На dev с --host window.location.origin часто localhost — задайте VITE_PUBLIC_URL.
 */
export function getPublicAppOrigin(): string {
  const fromEnv = (import.meta.env.VITE_PUBLIC_URL as string | undefined)?.trim()?.replace(/\/$/, '')

  if (typeof window !== 'undefined') {
    const live = window.location.origin.replace(/\/$/, '')
    if (!fromEnv) return live

    try {
      const envHost = new URL(fromEnv).hostname
      const liveHost = new URL(live).hostname
      // Тот же LAN-хост, другой порт (например env :5174, dev :5173) — берём активную вкладку.
      if (envHost === liveHost && !isLocalhostOrigin(live)) {
        return live
      }
      // localhost в браузере, в env — IP для телефонов.
      if (isLocalhostOrigin(live) && !isLocalhostOrigin(fromEnv)) {
        return fromEnv
      }
    } catch {
      return fromEnv
    }
    return fromEnv
  }

  return fromEnv ?? ''
}

export function isLocalhostOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
  } catch {
    return false
  }
}

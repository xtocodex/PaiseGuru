// Installable app helpers: service worker, install prompt (Android/desktop Chrome), iPhone detection, appearance.
import { useSyncExternalStore } from 'react'

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: InstallEvent | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

// The browser fires this once, early; keep it so an Install button can use it later.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e as InstallEvent
  emit()
})
window.addEventListener('appinstalled', () => {
  deferred = null
  emit()
})

export function registerServiceWorker() {
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
  }
}

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)

export function useInstall() {
  const canPrompt = useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => deferred !== null,
  )
  return {
    installed: isStandalone(),
    /** Android/desktop: the browser's own install dialog is available. */
    canPrompt,
    /** iPhone: no install dialog exists; show "Share → Add to Home Screen" steps instead. */
    ios: isIOS(),
    async install() {
      if (!deferred) return false
      await deferred.prompt()
      const { outcome } = await deferred.userChoice
      deferred = null
      emit()
      return outcome === 'accepted'
    },
  }
}

export type Theme = 'system' | 'light' | 'dark'
export function getTheme(): Theme {
  try {
    const t = localStorage.getItem('theme')
    return t === 'light' || t === 'dark' ? t : 'system'
  } catch {
    return 'system'
  }
}
export function setTheme(t: Theme) {
  try {
    if (t === 'system') localStorage.removeItem('theme')
    else localStorage.setItem('theme', t)
  } catch {}
  if (t === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = t
}

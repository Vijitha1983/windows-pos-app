import { useEffect } from 'react'

export function useKeyboard(handlers, deps = []) {
  useEffect(() => {
    const handler = (e) => {
      const key = e.key
      const ctrl = e.ctrlKey
      const shift = e.shiftKey

      for (const [combo, fn] of Object.entries(handlers)) {
        const parts = combo.split('+')
        const mainKey = parts[parts.length - 1]
        const needsCtrl = parts.includes('ctrl')
        const needsShift = parts.includes('shift')

        if (
          key.toLowerCase() === mainKey.toLowerCase() &&
          needsCtrl === ctrl &&
          needsShift === shift
        ) {
          e.preventDefault()
          fn(e)
          break
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, deps)
}

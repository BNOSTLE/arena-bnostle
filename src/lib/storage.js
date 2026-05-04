export function installStorageShim() {
  if (typeof window === 'undefined') return

  window.storage = {
    async get(key, shared = true) {
      try {
        const v = localStorage.getItem(key)
        if (v === null) return null
        return { value: v, shared }
      } catch {
        return null
      }
    },
    async set(key, value, shared = true) {
      try {
        localStorage.setItem(key, value)
        return { value, shared }
      } catch (e) {
        console.error('storage.set failed', e)
        return null
      }
    },
    async delete(key, shared = true) {
      try {
        localStorage.removeItem(key)
        return { key, deleted: true, shared }
      } catch {
        return null
      }
    },
    async list(prefix = '', shared = true) {
      const keys = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith(prefix)) keys.push(k)
      }
      return { keys, prefix, shared }
    },
  }
}
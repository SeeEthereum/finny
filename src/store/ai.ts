import { del, get, set } from 'idb-keyval'
import { create } from 'zustand'
import { DEFAULT_BASE_URL, SERVER_BASE_URL, type AiConfig } from '../lib/ai/client'

const KEY = 'finny:ai:v1'

interface AiSettings {
  /** server: the key sits in Netlify's environment; browser: the key is stored here */
  mode: 'server' | 'browser'
  passphrase: string
  enabled: boolean
  apiKey: string
  baseUrl: string
  model: string
  models: string[]
  shareMerchants: boolean
}

/**
 * AI settings live on this device only, in a separate IndexedDB entry: they are never part of
 * the backup file, so exporting your data never exports your API key.
 */
export const useAi = create<
  AiSettings & {
    load: () => Promise<void>
    update: (patch: Partial<AiSettings>) => void
    forget: () => Promise<void>
  }
>((setState, getState) => ({
  mode: 'server',
  passphrase: '',
  enabled: false,
  apiKey: '',
  baseUrl: DEFAULT_BASE_URL,
  model: '',
  models: [],
  shareMerchants: true,
  load: async () => {
    try {
      const saved = await get<AiSettings>(KEY)
      // settings saved before the server mode existed used a key in the browser
      if (saved) {
        const legacy = saved as Partial<AiSettings>
        setState({ ...saved, mode: legacy.mode ?? (saved.apiKey ? 'browser' : 'server'), passphrase: legacy.passphrase ?? '' })
      }
    } catch {
      /* settings stay for this visit only */
    }
  },
  update: (patch) => {
    setState(patch)
    const { mode, passphrase, enabled, apiKey, baseUrl, model, models, shareMerchants } = getState()
    set(KEY, { mode, passphrase, enabled, apiKey, baseUrl, model, models, shareMerchants }).catch(() => {})
  },
  forget: async () => {
    setState({ enabled: false, apiKey: '', passphrase: '', model: '', models: [] })
    try {
      await del(KEY)
    } catch {
      /* nothing stored */
    }
  },
}))

export function aiConfig(s: Pick<AiSettings, 'mode' | 'passphrase' | 'apiKey' | 'baseUrl' | 'model'>): AiConfig {
  if (s.mode === 'server') return { apiKey: '', baseUrl: SERVER_BASE_URL, model: s.model, passphrase: s.passphrase || undefined }
  return { apiKey: s.apiKey, baseUrl: s.baseUrl || DEFAULT_BASE_URL, model: s.model }
}

export function useAiReady() {
  return useAi((s) => s.enabled && !!s.model && (s.mode === 'server' || !!s.apiKey))
}

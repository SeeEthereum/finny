import { del, get, set } from 'idb-keyval'
import { create } from 'zustand'
import { DEFAULT_BASE_URL, type AiConfig } from '../lib/ai/client'

const KEY = 'finny:ai:v1'

interface AiSettings {
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
  enabled: false,
  apiKey: '',
  baseUrl: DEFAULT_BASE_URL,
  model: '',
  models: [],
  shareMerchants: true,
  load: async () => {
    try {
      const saved = await get<AiSettings>(KEY)
      if (saved) setState(saved)
    } catch {
      /* settings stay for this visit only */
    }
  },
  update: (patch) => {
    setState(patch)
    const { enabled, apiKey, baseUrl, model, models, shareMerchants } = getState()
    set(KEY, { enabled, apiKey, baseUrl, model, models, shareMerchants }).catch(() => {})
  },
  forget: async () => {
    setState({ enabled: false, apiKey: '', model: '', models: [] })
    try {
      await del(KEY)
    } catch {
      /* nothing stored */
    }
  },
}))

export function aiConfig(s: Pick<AiSettings, 'apiKey' | 'baseUrl' | 'model'>): AiConfig {
  return { apiKey: s.apiKey, baseUrl: s.baseUrl || DEFAULT_BASE_URL, model: s.model }
}

export function useAiReady() {
  return useAi((s) => s.enabled && !!s.apiKey && !!s.model)
}

import { create } from 'zustand'
import type { CategoryId } from '../lib/types'

/** Cross-view filters, e.g. clicking a category on the dashboard opens Movimenti filtered */
export const useUi = create<{
  search: string
  category: CategoryId | 'all'
  setSearch: (s: string) => void
  setCategory: (c: CategoryId | 'all') => void
  /** a question to send as soon as Chiedi opens (from the dashboard brief) */
  question: string
  setQuestion: (q: string) => void
}>((set) => ({
  search: '',
  category: 'all',
  question: '',
  setQuestion: (question) => set({ question }),
  setSearch: (search) => set({ search }),
  setCategory: (category) => set({ category }),
}))

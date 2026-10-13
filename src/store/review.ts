import { useMemo } from 'react'
import { create } from 'zustand'
import { detectSubscriptions, findOverlaps } from '../lib/analytics'
import { useFinny } from './useFinny'

const DISMISSED_KEY = 'finny:overlaps:dismissed'

function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]')
  } catch {
    return []
  }
}

/** Overlaps the user said to keep, shared by the dashboard and the subscriptions view */
const useDismissed = create<{ ids: string[]; dismiss: (id: string) => void }>((set, get) => ({
  ids: readDismissed(),
  dismiss: (id) => {
    const ids = [...new Set([...get().ids, id])]
    set({ ids })
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids))
    } catch {
      /* remembered for this visit only */
    }
  },
}))

/** Recurring charges split into active and stopped, plus what is worth a second look */
export function useSubscriptionReview() {
  const txs = useFinny((s) => s.transactions)
  const dismissed = useDismissed((s) => s.ids)
  const dismiss = useDismissed((s) => s.dismiss)
  const base = useMemo(() => {
    const all = detectSubscriptions(txs, { includeStopped: true })
    const active = all.filter((s) => !s.stopped && s.category !== 'investimenti')
    return {
      all,
      active,
      stopped: all.filter((s) => s.stopped),
      overlaps: findOverlaps(active),
      raises: active.filter((s) => s.priceChange && s.priceChange.to > s.priceChange.from),
    }
  }, [txs])
  const openOverlaps = base.overlaps.filter((o) => !dismissed.includes(o.id))
  return { ...base, openOverlaps, toReview: openOverlaps.length + base.raises.length, dismissed, dismiss }
}

import { useMemo } from 'react'
import { currentMonth, detectSubscriptions, monthlyStats } from '../lib/analytics'
import { buildInsights } from '../lib/insights'
import { useFinny } from './useFinny'

/** Everything the views compute from the ledger, memoized on the transaction list */
export function useDerived() {
  const transactions = useFinny((s) => s.transactions)
  return useMemo(() => {
    const cur = currentMonth(transactions)
    const subs = detectSubscriptions(transactions)
    return {
      cur,
      stats: monthlyStats(transactions, 12, cur),
      subs,
      insights: buildInsights(transactions, subs),
    }
  }, [transactions])
}

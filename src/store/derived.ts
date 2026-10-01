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
    // start the year view at the first month that has data, so a statement that begins
    // in January doesn't show three empty months that drag the cumulative line down
    const all = monthlyStats(transactions, 12, cur)
    const first = all.findIndex((m) => m.income > 0 || m.expenses > 0)
    return {
      cur,
      stats: first > 0 ? all.slice(first) : all,
      subs,
      insights: buildInsights(transactions, subs),
    }
  }, [transactions])
}

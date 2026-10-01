import { del, get, set } from 'idb-keyval'
import { create } from 'zustand'
import { categorize, merchantName, normalize } from '../lib/categorize'
import { demoSnapshot } from '../lib/demo'
import { todayISO } from '../lib/format'
import type { View } from '../lib/insights'
import type { DraftTx } from '../lib/parse/table'
import type { Account, Budgets, CategoryId, Rule, Snapshot, Transaction, TxSource } from '../lib/types'

const KEY = 'finny:snapshot:v1'

export interface ImportRequest {
  accountId?: string
  accountName: string
  institution: string
  source: TxSource
  drafts: DraftTx[]
  balance?: { amount: number; date: string }
}

export interface ImportOutcome {
  added: number
  duplicates: number
  accountId: string
}

interface State extends Snapshot {
  ready: boolean
  persistent: boolean
  view: View
  go: (v: View) => void
  load: () => Promise<void>
  importDrafts: (req: ImportRequest) => ImportOutcome
  setCategory: (id: string, cat: CategoryId, applyToSimilar: boolean) => number
  deleteRule: (id: string) => void
  setBudget: (cat: CategoryId, amount: number | null) => void
  deleteTransaction: (id: string) => void
  deleteAccount: (id: string) => void
  resetToDemo: () => void
  wipe: () => Promise<void>
  restore: (snap: Snapshot) => void
}

function uid() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
}

function fingerprint(t: { date: string; amount: number; description: string }) {
  return `${t.date}|${t.amount.toFixed(2)}|${normalize(t.description).slice(0, 60)}`
}

function snapshotOf(s: State): Snapshot {
  return {
    version: 1,
    transactions: s.transactions,
    accounts: s.accounts,
    rules: s.rules,
    budgets: s.budgets,
    isDemo: s.isDemo,
  }
}

const VIEWS: View[] = ['home', 'movimenti', 'analisi', 'chiedi', 'abbonamenti', 'budget', 'importa', 'collega', 'impostazioni']

function viewFromHash(): View {
  try {
    const h = window.location.hash.replace('#', '') as View
    return VIEWS.includes(h) ? h : 'home'
  } catch {
    return 'home'
  }
}

export const useFinny = create<State>((setState, getState) => {
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  const persist = () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      try {
        await set(KEY, snapshotOf(getState()))
        if (!getState().persistent) setState({ persistent: true })
      } catch {
        setState({ persistent: false })
      }
    }, 250)
  }
  const update = (patch: Partial<State>) => {
    setState(patch)
    persist()
  }

  return {
    ...demoSnapshot(),
    ready: false,
    persistent: true,
    view: viewFromHash(),

    go: (view) => {
      setState({ view })
      try {
        history.replaceState(null, '', `#${view}`)
      } catch {
        /* hash sync is a convenience */
      }
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },

    load: async () => {
      try {
        const saved = await get<Snapshot>(KEY)
        if (saved?.version === 1) setState({ ...saved, ready: true, persistent: true })
        else setState({ ready: true })
      } catch {
        setState({ ready: true, persistent: false })
      }
    },

    importDrafts: (req) => {
      const s = getState()
      // the first real import replaces the example data
      const base = s.isDemo
        ? { transactions: [] as Transaction[], accounts: [] as Account[], budgets: {} as Budgets }
        : { transactions: s.transactions, accounts: s.accounts, budgets: s.budgets }

      let account = req.accountId ? base.accounts.find((a) => a.id === req.accountId) : undefined
      if (!account) {
        account = {
          id: uid(),
          name: req.accountName.trim() || 'Conto',
          institution: req.institution.trim(),
          source: req.source,
          createdAt: todayISO(),
        }
      }
      if (req.balance && (!account.balance || req.balance.date >= account.balance.date)) {
        account = { ...account, balance: req.balance }
      }

      const seen = new Set(base.transactions.filter((t) => t.accountId === account!.id).map(fingerprint))
      const added: Transaction[] = []
      let duplicates = 0
      for (const d of req.drafts) {
        const fp = fingerprint(d)
        if (seen.has(fp)) {
          duplicates++
          continue
        }
        seen.add(fp)
        added.push({
          id: uid(),
          date: d.date,
          description: d.description,
          merchant: merchantName(d.description),
          amount: d.amount,
          currency: d.currency,
          category: categorize(d.description, d.amount, s.rules),
          accountId: account.id,
          source: req.source,
        })
      }
      const accounts = [...base.accounts.filter((a) => a.id !== account!.id), account]
      const transactions = [...added, ...base.transactions].sort((a, b) => b.date.localeCompare(a.date))
      update({ transactions, accounts, budgets: base.budgets, isDemo: false })
      return { added: added.length, duplicates, accountId: account.id }
    },

    setCategory: (id, cat, applyToSimilar) => {
      const s = getState()
      const tx = s.transactions.find((t) => t.id === id)
      if (!tx) return 0
      let rules = s.rules
      let changed = 0
      const transactions = s.transactions.map((t) => {
        const same = t.id === id || (applyToSimilar && t.merchant === tx.merchant && Math.sign(t.amount) === Math.sign(tx.amount))
        if (!same) return t
        changed++
        return { ...t, category: cat, manualCategory: true }
      })
      if (applyToSimilar) {
        const match = tx.merchant.toLowerCase()
        rules = [...rules.filter((r) => r.match !== match), { id: uid(), match, category: cat }]
      }
      update({ transactions, rules })
      return changed
    },

    deleteRule: (id) => update({ rules: getState().rules.filter((r) => r.id !== id) }),

    setBudget: (cat, amount) => {
      const budgets = { ...getState().budgets }
      if (amount == null || amount <= 0) delete budgets[cat]
      else budgets[cat] = amount
      update({ budgets })
    },

    deleteTransaction: (id) => update({ transactions: getState().transactions.filter((t) => t.id !== id) }),

    deleteAccount: (id) => {
      const s = getState()
      update({
        accounts: s.accounts.filter((a) => a.id !== id),
        transactions: s.transactions.filter((t) => t.accountId !== id),
      })
    },

    resetToDemo: () => update({ ...demoSnapshot() }),

    wipe: async () => {
      try {
        await del(KEY)
      } catch {
        /* nothing stored */
      }
      setState({ transactions: [], accounts: [], rules: [], budgets: {}, isDemo: false })
      persist()
    },

    restore: (snap) => update({ ...snap }),
  }
})

export type { Rule }

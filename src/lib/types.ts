export type CategoryId =
  | 'stipendio'
  | 'entrate'
  | 'rimborsi'
  | 'casa'
  | 'bollette'
  | 'telefonia'
  | 'spesa'
  | 'ristoranti'
  | 'delivery'
  | 'trasporti'
  | 'auto'
  | 'abbonamenti'
  | 'shopping'
  | 'salute'
  | 'svago'
  | 'viaggi'
  | 'istruzione'
  | 'animali'
  | 'regali'
  | 'commissioni'
  | 'tasse'
  | 'contanti'
  | 'investimenti'
  | 'trasferimenti'
  | 'persone'
  | 'altro'

export type TxSource = 'csv' | 'xlsx' | 'pdf' | 'demo' | 'bank' | 'manual'

export interface Transaction {
  id: string
  /** ISO date, yyyy-mm-dd */
  date: string
  /** Original description as it appears on the statement */
  description: string
  /** Cleaned-up counterpart name, used for grouping */
  merchant: string
  /** Signed amount in account currency: negative = money out */
  amount: number
  currency: string
  category: CategoryId
  accountId: string
  source: TxSource
  /** true when the user picked the category by hand */
  manualCategory?: boolean
  note?: string
}

export interface Account {
  id: string
  name: string
  institution: string
  source: TxSource
  createdAt: string
  /** Last balance read from the statement, when the file carried one */
  balance?: { amount: number; date: string }
}

export interface Rule {
  id: string
  /** lowercase text that must appear in the description or merchant */
  match: string
  category: CategoryId
}

export type Budgets = Partial<Record<CategoryId, number>>

export interface Snapshot {
  version: 1
  transactions: Transaction[]
  accounts: Account[]
  rules: Rule[]
  budgets: Budgets
  isDemo: boolean
}

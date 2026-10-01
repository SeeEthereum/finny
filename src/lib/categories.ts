import {
  ArrowLeftRight, Banknote, BookOpen, Briefcase, Bus, Car, Clapperboard, Coins, Gift,
  HeartPulse, Home, Landmark, PawPrint, Plane, Receipt, RefreshCcw, Repeat, ShoppingBag,
  ShoppingCart, Smartphone, Sparkles, TrendingUp, UtensilsCrossed, Bike, Users, Zap,
  type LucideIcon,
} from 'lucide-react'
import type { CategoryId } from './types'

/**
 * How a category counts in the 50/30/20 split. 'other' is real money out that fits neither
 * needs nor wants (payments to people): it counts as spending but stays out of the split.
 */
export type Bucket = 'needs' | 'wants' | 'savings' | 'income' | 'neutral' | 'other'

export interface CategoryDef {
  id: CategoryId
  label: string
  icon: LucideIcon
  bucket: Bucket
  /** hue (0-360) used only for the icon chip tint, never for chart series */
  hue: number
}

export const CATEGORIES: CategoryDef[] = [
  { id: 'stipendio', label: 'Stipendio', icon: Briefcase, bucket: 'income', hue: 160 },
  { id: 'entrate', label: 'Altre entrate', icon: Coins, bucket: 'income', hue: 150 },
  { id: 'rimborsi', label: 'Rimborsi', icon: RefreshCcw, bucket: 'income', hue: 140 },
  { id: 'casa', label: 'Casa e affitto', icon: Home, bucket: 'needs', hue: 30 },
  { id: 'bollette', label: 'Bollette', icon: Zap, bucket: 'needs', hue: 45 },
  { id: 'telefonia', label: 'Telefono e internet', icon: Smartphone, bucket: 'needs', hue: 200 },
  { id: 'spesa', label: 'Spesa', icon: ShoppingCart, bucket: 'needs', hue: 95 },
  { id: 'ristoranti', label: 'Ristoranti e bar', icon: UtensilsCrossed, bucket: 'wants', hue: 15 },
  { id: 'delivery', label: 'Food delivery', icon: Bike, bucket: 'wants', hue: 5 },
  { id: 'trasporti', label: 'Trasporti', icon: Bus, bucket: 'needs', hue: 210 },
  { id: 'auto', label: 'Auto e carburante', icon: Car, bucket: 'needs', hue: 220 },
  { id: 'abbonamenti', label: 'Abbonamenti', icon: Repeat, bucket: 'wants', hue: 280 },
  { id: 'shopping', label: 'Shopping', icon: ShoppingBag, bucket: 'wants', hue: 320 },
  { id: 'salute', label: 'Salute', icon: HeartPulse, bucket: 'needs', hue: 350 },
  { id: 'svago', label: 'Tempo libero', icon: Clapperboard, bucket: 'wants', hue: 265 },
  { id: 'viaggi', label: 'Viaggi', icon: Plane, bucket: 'wants', hue: 190 },
  { id: 'istruzione', label: 'Istruzione', icon: BookOpen, bucket: 'needs', hue: 240 },
  { id: 'animali', label: 'Animali', icon: PawPrint, bucket: 'needs', hue: 35 },
  { id: 'regali', label: 'Regali e donazioni', icon: Gift, bucket: 'wants', hue: 335 },
  { id: 'commissioni', label: 'Commissioni bancarie', icon: Landmark, bucket: 'needs', hue: 0 },
  { id: 'tasse', label: 'Tasse e tributi', icon: Receipt, bucket: 'needs', hue: 10 },
  { id: 'contanti', label: 'Prelievi contanti', icon: Banknote, bucket: 'wants', hue: 60 },
  { id: 'investimenti', label: 'Risparmio e investimenti', icon: TrendingUp, bucket: 'savings', hue: 170 },
  { id: 'trasferimenti', label: 'Giroconti', icon: ArrowLeftRight, bucket: 'neutral', hue: 230 },
  { id: 'persone', label: 'Pagamenti a persone', icon: Users, bucket: 'other', hue: 25 },
  { id: 'altro', label: 'Altro', icon: Sparkles, bucket: 'wants', hue: 250 },
]

export const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<
  CategoryId,
  CategoryDef
>

export function category(id: CategoryId) {
  return CATEGORY_MAP[id] ?? CATEGORY_MAP.altro
}

/** Categories that are not real spending or earning (money moving between your own pockets) */
export function isNeutral(id: CategoryId) {
  return CATEGORY_MAP[id]?.bucket === 'neutral'
}

export function isIncomeCategory(id: CategoryId) {
  return CATEGORY_MAP[id]?.bucket === 'income'
}

export const EXPENSE_CATEGORIES = CATEGORIES.filter(
  (c) => c.bucket !== 'income' && c.bucket !== 'neutral',
)

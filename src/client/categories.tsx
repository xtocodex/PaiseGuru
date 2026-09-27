import {
  BookOpen, Car, CircleEllipsis, Clapperboard, Gift, HandCoins, HandHelping, HeartHandshake, House, Landmark, Pill, Plane, Plug, ReceiptText,
  ShieldCheck, ShoppingBag, ShoppingBasket, Sparkles, Undo2, Users, UtensilsCrossed, type LucideIcon,
} from 'lucide-react'
import type { Category } from '../domain/hisaab.ts'

export const CATEGORY_ICON: Record<Category, LucideIcon> = {
  Food: UtensilsCrossed,
  Groceries: ShoppingBasket,
  Housing: House,
  'Household help': HandHelping,
  Utilities: Plug,
  Transport: Car,
  Travel: Plane,
  Shopping: ShoppingBag,
  Entertainment: Clapperboard,
  Healthcare: Pill,
  Education: BookOpen,
  'Personal care': Sparkles,
  Insurance: ShieldCheck,
  Gifts: Gift,
  Bills: ReceiptText,
  'Family support': HeartHandshake,
  Shared: Users,
  Other: CircleEllipsis,
}

/** The icon for an entry row: its category for bills and refunds, else its type. */
export function entryIcon(e: { type: string; category: string | null }): LucideIcon {
  if (e.type === 'money_in') return Landmark
  if (e.type === 'money_given') return HandCoins
  if (e.type === 'refund') return Undo2
  return CATEGORY_ICON[e.category as Category] ?? CircleEllipsis
}

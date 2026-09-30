import { categorize, merchantName } from './categorize'
import { daysInMonth, monthKey, shiftMonth, todayISO } from './format'
import type { Account, Snapshot, Transaction } from './types'

function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A plausible year on an Italian current account, generated so the app opens in a working state. */
export function demoSnapshot(): Snapshot {
  const r = rng(20260930)
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]
  const between = (a: number, b: number) => Math.round((a + r() * (b - a)) * 100) / 100
  const today = todayISO()
  const end = monthKey(today)
  const accounts: Account[] = [
    { id: 'demo-main', name: 'Conto principale', institution: 'Banca Demo', source: 'demo', createdAt: today },
    { id: 'demo-card', name: 'Carta prepagata', institution: 'Neobank Demo', source: 'demo', createdAt: today },
  ]
  const txs: Transaction[] = []
  let n = 0
  const add = (date: string, description: string, amount: number, accountId = 'demo-main') => {
    if (date > today) return
    txs.push({
      id: `demo-${n++}`,
      date,
      description,
      merchant: merchantName(description),
      amount: Math.round(amount * 100) / 100,
      currency: 'EUR',
      category: categorize(description, amount),
      accountId,
      source: 'demo',
    })
  }

  for (let i = 11; i >= 0; i--) {
    const key = shiftMonth(end, -i)
    const days = daysInMonth(key)
    const d = (day: number) => `${key}-${String(Math.min(day, days)).padStart(2, '0')}`
    const monthIdx = Number(key.slice(5)) // 1-12
    const recent = i <= 1

    add(d(27), 'ACCREDITO EMOLUMENTI STIPENDIO ACME SRL', monthIdx === 12 ? 2380 + 2190 : 2380)
    if (monthIdx === 7) add(d(20), 'BONIFICO A VOSTRO FAVORE RIMBORSO 730 AGENZIA ENTRATE', 412.5)
    add(d(1), 'BONIFICO SEPA A FAVORE DI ROSSI MARIO CANONE LOCAZIONE', -750)
    add(d(5), 'ADDEBITO SDD CONDOMINIO VIA ROMA 12', -45)
    if (monthIdx % 2 === 0) add(d(12), 'ADDEBITO SDD ENEL ENERGIA SPA BOLLETTA LUCE E GAS', -between(88, 142))
    add(d(8), 'ADDEBITO SDD ILIAD ITALIA', -9.99)
    add(d(14), 'ADDEBITO SDD FASTWEB SPA', -29.95)
    add(d(3), 'PAGAMENTO CARTA NETFLIX.COM', i <= 4 ? -13.99 : -12.99, 'demo-card')
    add(d(9), 'PAGAMENTO CARTA SPOTIFY P1A2B3C4', -11.99, 'demo-card')
    add(d(17), 'PAGAMENTO CARTA APPLE.COM/BILL ICLOUD', -2.99, 'demo-card')
    add(d(22), 'PAGAMENTO CARTA DAZN LIMITED', -34.99, 'demo-card')
    add(d(2), 'ADDEBITO SDD MCFIT PALESTRA', -24.9)
    add(d(28), 'CANONE MENSILE CONTO', -3)
    add(d(28), 'BONIFICO VERSO CONTO DEPOSITO RISPARMIO', -200)
    add(d(15), 'PIANO DI ACCUMULO ETF MSCI WORLD', -150)
    add(d(6), 'RICARICA CARTA PREPAGATA', -300)
    add(d(6), 'RICARICA CARTA PREPAGATA', 300, 'demo-card')
    if (monthIdx === 3) add(d(18), 'PAGAMENTO CARTA AMAZON PRIME EU', -49.9, 'demo-card')
    if (monthIdx === 11) add(d(10), 'PAGAMENTO PAGOPA TARI COMUNE DI MILANO', -186)
    if (monthIdx === 1) add(d(30), 'PAGAMENTO BOLLO AUTO ACI', -218.4)

    // groceries, twice a week
    for (let w = 0; w < days; w += 3 + Math.floor(r() * 2)) {
      const shop = pick(['ESSELUNGA', 'COOP LOMBARDIA', 'LIDL ITALIA', 'CONAD CITY', 'CARREFOUR MARKET', 'NATURASI'])
      add(d(1 + w), `PAGAMENTO POS ${shop} MILANO`, -between(18, 78), r() > 0.5 ? 'demo-card' : 'demo-main')
    }
    // coffee & lunch
    for (let k = 0; k < 9; k++) {
      add(d(1 + Math.floor(r() * days)), `PAGAMENTO POS ${pick(['BAR CENTRALE', 'CAFFE NAZIONALE', 'PASTICCERIA MARCHESI', 'STARBUCKS MILANO'])}`, -between(1.4, 7.5), 'demo-card')
    }
    // dinners out
    for (let k = 0; k < 3 + Math.floor(r() * 3); k++) {
      add(d(1 + Math.floor(r() * days)), `PAGAMENTO POS ${pick(['TRATTORIA DA GIGI', 'PIZZERIA SPONTINI', 'SUSHI KOI', 'OSTERIA DEL BINARIO', 'POKE HOUSE'])}`, -between(22, 68))
    }
    // delivery: grows in the last two months so an insight fires
    for (let k = 0; k < (recent ? 7 : 3); k++) {
      add(d(1 + Math.floor(r() * days)), `PAGAMENTO CARTA ${pick(['GLOVO', 'DELIVEROO', 'JUST EAT ITALY'])}`, -between(14, 32), 'demo-card')
    }
    // transport
    add(d(1), 'ATM MILANO ABBONAMENTO MENSILE', -39)
    for (let k = 0; k < 2; k++) add(d(1 + Math.floor(r() * days)), 'PAGAMENTO CARTA TRENITALIA', -between(12, 49))
    if (r() > 0.4) add(d(1 + Math.floor(r() * days)), 'PAGAMENTO CARTA UBER TRIP', -between(9, 24), 'demo-card')
    add(d(1 + Math.floor(r() * days)), `PAGAMENTO POS ${pick(['ENILIVE', 'Q8', 'IP STAZIONE'])}`, -between(40, 65))
    // shopping & fun
    for (let k = 0; k < 2 + Math.floor(r() * 3); k++) {
      add(d(1 + Math.floor(r() * days)), `PAGAMENTO CARTA ${pick(['AMAZON MKTP IT', 'ZALANDO SE', 'DECATHLON', 'IKEA ITALIA', 'MEDIAWORLD', 'SEPHORA'])}`, -between(15, 95), 'demo-card')
    }
    if (r() > 0.5) add(d(1 + Math.floor(r() * days)), 'PAGAMENTO CARTA UCI CINEMAS', -between(9, 26), 'demo-card')
    if (r() > 0.3) add(d(1 + Math.floor(r() * days)), 'PAGAMENTO POS FARMACIA SAN BABILA', -between(6, 38))
    if (r() > 0.6) add(d(1 + Math.floor(r() * days)), 'PRELIEVO BANCOMAT ATM', -pick([50, 100, 50]))
    if (r() > 0.7) add(d(1 + Math.floor(r() * days)), 'PAGAMENTO CARTA AMAZON MKTP IT RESO', between(12, 40), 'demo-card')
    if (monthIdx === 8) {
      add(d(4), 'PAGAMENTO CARTA RYANAIR', -189.4)
      add(d(10), 'PAGAMENTO CARTA AIRBNB', -620)
      for (let k = 0; k < 5; k++) add(d(11 + k), `PAGAMENTO POS ${pick(['RISTORANTE AL PORTO', 'GELATERIA DEL MARE', 'BAR LIDO'])}`, -between(12, 64))
    }
    if (monthIdx === 12) {
      for (let k = 0; k < 4; k++) add(d(8 + k * 4), `PAGAMENTO CARTA ${pick(['LA FELTRINELLI', 'RINASCENTE', 'AMAZON MKTP IT', 'LEGO STORE'])} REGALO`, -between(25, 90), 'demo-card')
    }
    if (monthIdx === 6) add(d(19), 'PAGAMENTO POS STUDIO DENTISTICO BIANCHI', -180)
  }

  txs.sort((a, b) => b.date.localeCompare(a.date))
  accounts[0].balance = { amount: 4870.35, date: today }
  accounts[1].balance = { amount: 132.4, date: today }

  return {
    version: 1,
    transactions: txs,
    accounts,
    rules: [],
    budgets: { spesa: 420, ristoranti: 180, delivery: 90, shopping: 200, svago: 80 },
    isDemo: true,
  }
}

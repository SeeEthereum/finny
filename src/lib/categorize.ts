import type { CategoryId, Rule } from './types'

/**
 * Keyword dictionary tuned on Italian bank statements.
 * Order matters: the first category whose keyword matches wins, so specific
 * entries (e.g. "uber eats") sit before generic ones ("uber").
 */
const KEYWORDS: [CategoryId, string[]][] = [
  ['trasferimenti', [
    'giroconto', 'giro conto', 'trasferimento tra conti', 'ricarica carta', 'ricarica prepagata',
    'top up', 'topup', 'transfer to', 'transfer from', 'to pocket', 'from pocket', 'salvadanaio',
  ]],
  ['contanti', ['prelievo', 'prelevamento', 'prel bancomat', 'atm withdrawal', 'cash withdrawal']],
  ['investimenti', [
    'piano di accumulo', 'pac ', 'fondo pensione', 'previdenza complementare', 'etf', 'trade republic',
    'scalable capital', 'directa', 'fineco trading', 'moneyfarm', 'satispay risparmi', 'conto deposito',
    'acquisto titoli', 'sottoscrizione fondi', 'buono fruttifero', 'btp', 'raisin', 'investimento',
  ]],
  ['stipendio', ['stipendio', 'emolumenti', 'retribuzione', 'busta paga', 'salary', 'payroll', 'competenze mese', 'accredito emolumenti', 'noipa']],
  ['rimborsi', ['rimborso', 'refund', 'storno', 'reso ', 'cashback', 'rimb ']],
  ['delivery', ['uber eats', 'ubereats', 'deliveroo', 'glovo', 'just eat', 'justeat', 'wolt', 'foodinho']],
  ['abbonamenti', [
    'netflix', 'spotify', 'disney plus', 'disneyplus', 'disney+', 'amazon prime', 'prime video', 'primevideo',
    'dazn', 'now tv', 'nowtv', 'sky italia', 'apple.com/bill', 'apple com bill', 'icloud', 'itunes',
    'google one', 'google storage', 'youtube premium', 'youtubepremium', 'chatgpt', 'openai', 'anthropic',
    'claude ai', 'microsoft 365', 'office 365', 'adobe', 'canva', 'dropbox', 'notion', 'audible',
    'kindle unlimited', 'paramount', 'crunchyroll', 'playstation', 'xbox', 'nintendo', 'patreon',
    'duolingo', 'linkedin', 'mediaset infinity', 'timvision', 'tim vision', 'apple music', 'tidal',
  ]],
  ['telefonia', [
    'tim ', 'telecom italia', 'vodafone', 'windtre', 'wind tre', 'iliad', 'fastweb', 'ho mobile',
    'homobile', 'kena', 'very mobile', 'postemobile', 'poste mobile', 'coopvoce', 'tiscali', 'eolo',
    'sky wifi', 'linkem', 'spusu', 'lycamobile',
  ]],
  ['bollette', [
    'enel', 'a2a', 'iren', 'hera', 'edison', 'eni plenitude', 'plenitude', 'sorgenia', 'acea', 'engie',
    'illumia', 'octopus energy', 'iberdrola', 'e on', 'e.on', 'servizio elettrico', 'gas naturale',
    'acquedotto', 'metropolitana milanese', 'smat', 'publiacqua', 'abbanoa', 'bolletta', 'luce e gas',
    'tari ', 'amsa', 'ama roma',
  ]],
  ['casa', [
    'affitto', 'canone locazione', 'locazione', 'mutuo', 'rata mutuo', 'condominio', 'spese condominiali',
    'amministratore condominio', 'ikea', 'leroy merlin', 'brico', 'obi ', 'mondo convenienza', 'maison du monde',
    'jysk', 'tecnomat', 'bricoman',
  ]],
  ['spesa', [
    'esselunga', 'coop', 'conad', 'carrefour', 'lidl', 'eurospin', 'aldi', 'penny', 'md spa', 'md discount',
    'pam ', 'panorama', 'despar', 'eurospar', 'interspar', 'spar ', 'famila', 'tigre', 'crai', 'sigma',
    'iper ', 'ipercoop', 'bennet', 'il gigante', 'tigros', 'unes', 'u2 supermercato', 'naturasi', 'naturasì',
    'todis', 'in s mercato', 'ins mercato', 'dok ', 'decò', 'deco supermercati', 'simply', 'supermercato',
    'alimentari', 'macelleria', 'panificio', 'forno ', 'ortofrutta', 'pescheria', 'mercato',
    'everli', 'cortilia', 'esselunga a casa',
  ]],
  ['ristoranti', [
    'ristorante', 'trattoria', 'osteria', 'pizzeria', 'pizza', 'sushi', 'bar ', 'caffe', 'caffè', 'cafe',
    'bistrot', 'pasticceria', 'gelateria', 'gelato', 'mcdonald', 'burger king', 'kfc', 'starbucks', 'autogrill',
    'old wild west', 'roadhouse', 'poke', 'kebab', 'braceria', 'enoteca', 'pub ', 'birreria', 'tavola calda',
    'rosticceria', 'piadineria', 'spizzico', 'cioccolati italiani', 'signorvino', 'la piadineria', 'five guys',
  ]],
  ['auto', [
    'eni ', 'enilive', 'eni live', 'q8', 'ip ', 'ipplus', 'tamoil', 'esso', 'api ', 'shell', 'total erg',
    'totalenergies', 'carburante', 'benzina', 'distributore', 'autostrade', 'telepass', 'unipolmove',
    'parcheggio', 'easypark', 'mycicero', 'saba ', 'apcoa', 'bollo auto', 'aci ', 'assicurazione auto',
    'rca ', 'autofficina', 'officina', 'gommista', 'revisione', 'car wash', 'autolavaggio',
  ]],
  ['trasporti', [
    'uber', 'trenitalia', 'italo', 'ntv', 'trenord', 'atm milano', 'atm ', 'atac', 'gtt', 'tper', 'amat',
    'anm ', 'actv', 'flixbus', 'itabus', 'freenow', 'free now', 'taxi', 'bolt', 'lime', 'dott ', 'tier ',
    'bird ', 'enjoy', 'share now', 'sharenow', 'zity', 'cotral', 'busitalia', 'metro', 'abbonamento trasporti',
  ]],
  ['viaggi', [
    'ryanair', 'easyjet', 'wizz', 'ita airways', 'alitalia', 'volotea', 'vueling', 'lufthansa', 'airbnb',
    'booking.com', 'booking com', 'expedia', 'hotel', 'b&b', 'agriturismo', 'trivago', 'edreams',
    'lastminute', 'skyscanner', 'hostel', 'resort', 'tirrenia', 'moby', 'grimaldi', 'traghetti',
  ]],
  ['salute', [
    'farmacia', 'parafarmacia', 'dentista', 'dentistic', 'odontoiatr', 'medico', 'ospedale', 'asl ', 'ticket sanitario',
    'poliambulatorio', 'centro medico', 'analisi cliniche', 'laboratorio analisi', 'ottica', 'optician',
    'fisioterap', 'psicolog', 'veterinar',
  ]],
  ['animali', ['arcaplanet', 'zooplus', 'maxi zoo', 'isola dei tesori', 'pet shop', 'petshop', 'animali']],
  ['istruzione', [
    'universita', 'università', 'politecnico', 'tasse universitarie', 'scuola', 'retta', 'libreria',
    'feltrinelli', 'mondadori', 'coursera', 'udemy', 'corso ', 'asilo', 'mensa scolastica',
  ]],
  ['svago', [
    'cinema', 'uci cinemas', 'the space', 'teatro', 'museo', 'concerto', 'ticketone', 'ticketmaster',
    'vivaticket', 'palestra', 'mcfit', 'virgin active', 'fitprime', 'anytime fitness', 'piscina',
    'decathlon', 'steam', 'epic games', 'lottomatica', 'sisal', 'snai', 'bowling', 'discoteca', 'escape room',
  ]],
  ['shopping', [
    'amazon', 'amzn', 'zalando', 'shein', 'temu', 'aliexpress', 'ebay', 'vinted', 'zara', 'h&m', 'h m ',
    'bershka', 'pull&bear', 'pull bear', 'stradivarius', 'oysho', 'primark', 'ovs', 'upim', 'coin ',
    'rinascente', 'uniqlo', 'nike', 'adidas', 'foot locker', 'mediaworld', 'unieuro', 'euronics',
    'trony', 'expert ', 'apple store', 'apple retail', 'sephora', 'douglas', 'kiko', 'acqua e sapone',
    'tigota', 'tedi', 'action ', 'flying tiger', 'yves rocher', 'calzedonia', 'intimissimi', 'tezenis',
    'benetton', 'mango', 'tally weijl', 'la feltrinelli', 'ikea food',
  ]],
  ['regali', ['regalo', 'gift', 'donazione', 'beneficenza', 'emergency', 'unicef', 'msf', 'gofundme', 'lista nozze']],
  ['tasse', [
    'f24', 'agenzia entrate', 'agenzia delle entrate', 'imu', 'irpef', 'pagopa', 'pago pa', 'multa',
    'contravvenzione', 'canone rai', 'imposta di bollo', 'bollo su', 'ritenuta', 'tassa', 'tributo',
  ]],
  ['commissioni', [
    'commissione', 'commissioni', 'canone conto', 'canone mensile', 'canone carta', 'spese tenuta conto',
    'competenze di chiusura', 'spese di liquidazione', 'costo bonifico', 'spese bonifico', 'interessi passivi',
    'fee ', 'costo operazione',
  ]],
]

/** Known merchants: raw token → display name */
const MERCHANT_NAMES: [RegExp, string][] = [
  [/emolumenti|stipendio|salary|payroll/, 'Stipendio'],
  [/prelievo|prelevamento/, 'Prelievo contanti'],
  [/\bq8\b/, 'Q8'],
  [/\bip\s+(stazione|plus)|\bipplus\b/, 'IP'],
  [/enilive|eni\s*live|eni station/, 'Enilive'],
  [/amzn|amazon\s*(mktp|marketplace|eu|it)?/, 'Amazon'],
  [/amazon prime|prime video/, 'Amazon Prime'],
  [/netflix/, 'Netflix'],
  [/spotify/, 'Spotify'],
  [/apple\.?com\/?bill|itunes|icloud/, 'Apple'],
  [/google\s*(one|storage|play|\*)/, 'Google'],
  [/esselunga/, 'Esselunga'],
  [/ipercoop|coop\b/, 'Coop'],
  [/conad/, 'Conad'],
  [/carrefour/, 'Carrefour'],
  [/lidl/, 'Lidl'],
  [/eurospin/, 'Eurospin'],
  [/uber\s*eats|ubereats/, 'Uber Eats'],
  [/uber(?!\s*eats)/, 'Uber'],
  [/deliveroo/, 'Deliveroo'],
  [/glovo|foodinho/, 'Glovo'],
  [/just\s*eat/, 'Just Eat'],
  [/trenitalia/, 'Trenitalia'],
  [/italo|ntv\b/, 'Italo'],
  [/ryanair/, 'Ryanair'],
  [/airbnb/, 'Airbnb'],
  [/booking\.?com/, 'Booking.com'],
  [/mcdonald/, "McDonald's"],
  [/starbucks/, 'Starbucks'],
  [/enel\b|enel energia/, 'Enel'],
  [/iliad/, 'Iliad'],
  [/vodafone/, 'Vodafone'],
  [/windtre|wind\s*tre/, 'WindTre'],
  [/fastweb/, 'Fastweb'],
  [/telepass/, 'Telepass'],
  [/zalando/, 'Zalando'],
  [/ikea/, 'IKEA'],
  [/decathlon/, 'Decathlon'],
  [/dazn/, 'DAZN'],
  [/disney/, 'Disney+'],
  [/satispay/, 'Satispay'],
  [/paypal/, 'PayPal'],
]

/** Statement boilerplate that says how you paid, not who you paid */
const NOISE = [
  /pagamento\s+(pos|carta|con carta|tramite pos|contactless|apple pay|google pay)/g,
  /pag\.?\s*(pos|carta)/g,
  /operazione\s+(carta|pos|n\.?)/g,
  /acquisto\s+(pos|carta|con carta)?/g,
  /addebito\s+(sdd|diretto|rid|carta|pos)?/g,
  /sdd\s+(core|b2b)?/g,
  /bonifico\s+(sepa|istantaneo|in uscita|a vostro favore|a favore di|da|disposto|ricevuto)?/g,
  /(disposizione|ordinante|beneficiario|a favore|favore|causale|rif\.?|riferimento|mandato|cro|trn|id)\s*[:.]?/g,
  /carta\s*(n\.?|nr\.?|num\.?)?\s*[*x\d\s]{4,}/g,
  /\*{2,}\d+/g,
  /\b\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?\b/g,
  /\b\d{1,2}[:.]\d{2}\b/g,
  /\b(it|de|fr|es|nl|lu|ie|gb)\d{2}[a-z0-9]{10,30}\b/g, // IBAN
  /\b(eur|euro|€)\b/g,
  /\bpresso\b|\bc\/o\b|\bdel\b|\bore\b|\bdi\b/g,
  /\b(mi|rm|to|na|bo|fi|ge|pd|vr|bs|bg|va|co|mb)\b\s*(ita|it)?\s*$/g, // trailing province code
  /\b(ita|italy|italia|irl|lux|nld)\b/g,
  /\bpagamento\b|\bpagam\.?\b/g,
  /\b(milano|roma|torino|napoli|bologna|firenze|genova|padova|verona|bari|palermo|venezia|brescia|bergamo)\s*$/g,
  /\d{3,}/g,
]

export function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/[^a-z0-9&+.*/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function matches(haystack: string, keyword: string) {
  const kw = normalize(keyword)
  if (!kw) return false
  const padded = ` ${haystack} `
  // short tokens (tim, eni, ip…) must be whole words; longer ones may be prefixes
  if (kw.length <= 4) return padded.includes(` ${kw} `)
  return padded.includes(` ${kw}`)
}

export function merchantName(description: string) {
  const low = description.toLowerCase()
  for (const [re, name] of MERCHANT_NAMES) if (re.test(low)) return name
  let s = low
  for (const re of NOISE) s = s.replace(re, ' ')
  s = s.replace(/[^a-zà-ü&'+ ]+/gi, ' ').replace(/\s+/g, ' ').trim()
  const words = s.split(' ').filter((w) => w.length > 1).slice(0, 3)
  if (!words.length) return description.trim().slice(0, 28) || 'Sconosciuto'
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
}

export function categorize(description: string, amount: number, rules: Rule[] = []): CategoryId {
  const text = normalize(description)
  for (const r of rules) {
    if (r.match && text.includes(normalize(r.match))) return r.category
  }
  for (const [cat, kws] of KEYWORDS) {
    if (!kws.some((k) => matches(text, k))) continue
    // incoming money can only land in an income-ish or neutral category
    if (amount > 0 && !['stipendio', 'rimborsi', 'trasferimenti', 'investimenti'].includes(cat)) {
      return 'rimborsi'
    }
    if (amount < 0 && (cat === 'stipendio' || cat === 'rimborsi')) continue
    return cat
  }
  return amount > 0 ? 'entrate' : 'altro'
}

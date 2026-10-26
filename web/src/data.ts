// Brand name lives here so it can be swapped in one place.
export const BRAND = 'Copilot Money'
export const BRAND_SHORT = 'Copilot'

export type Pill = { label: string; emoji: string; color: string }

export const pills: Pill[] = [
  { label: 'Baby', emoji: '🧸', color: '#ff33aa' },
  { label: 'Groceries', emoji: '🍎', color: '#e83030' },
  { label: 'Dancing', emoji: '🪩', color: '#5c6f8a' },
  { label: 'Date night', emoji: '🍸', color: '#9019e6' },
  { label: 'Home', emoji: '🏡', color: '#ff8833' },
  { label: 'Hiking', emoji: '⛰️', color: '#59cc33' },
  { label: 'Wedding', emoji: '💒', color: '#f27f0c' },
]

export const awards = [
  'Smart Ways to Save Money',
  "Editor's Choice",
  'Apple Design Awards Finalist',
  'Must-Have Finance Apps',
  'Apps We Love',
]

export type Tag = { label: string; emoji: string; color: string }

export const tags: Record<string, Tag> = {
  entertainment: { label: 'Entertainment', emoji: '🍿', color: '#f04242' },
  groceries: { label: 'Groceries', emoji: '🥑', color: '#94ae43' },
  dateNight: { label: 'Date night', emoji: '🍸', color: '#cc0abf' },
  coffee: { label: 'Coffee', emoji: '☕️', color: '#c08635' },
  transport: { label: 'Transportation', emoji: '🚕', color: '#e1b321' },
  restaurants: { label: 'Restaurants', emoji: '🥟', color: '#ff8833' },
  subscriptions: { label: 'Subscriptions', emoji: '📺', color: '#00acfe' },
  shops: { label: 'Shops', emoji: '🛍️', color: '#ea687c' },
  insurance: { label: 'Insurance', emoji: '☂️', color: '#4840bb' },
}

export const reviewTransactions = [
  { merchant: 'Spotify', amount: 11.99, tag: tags.entertainment },
  { merchant: 'Whole Food', amount: 120.45, tag: tags.groceries },
  { merchant: 'Grand Street', amount: 56.32, tag: tags.dateNight },
  { merchant: '787 Coffee', amount: 12.42, tag: tags.coffee },
  { merchant: 'Lyft', amount: 15.71, tag: tags.transport },
]

export const cashFlow = [
  { label: 'Rent', emoji: '🔑', delta: 20 },
  { label: 'Recreation', emoji: '🎟️', delta: -180 },
  { label: 'Groceries', emoji: '🥑', delta: 240 },
  { label: 'Car', emoji: '🚙', delta: 123 },
  { label: 'Utilities', emoji: '⚡️', delta: 85 },
]

export const subscriptions = [
  { date: 'Dec 1', label: 'Streaming Service', emoji: '🎬', amount: 19.99 },
  { date: 'Dec 1', label: 'Gym Membership', emoji: '💪', amount: 79.99 },
  { date: 'Dec 2', label: 'Food Delivery', emoji: '🍔', amount: 24.99 },
  { date: 'Dec 5', label: 'Card Annual Fee', emoji: '💳', amount: 89.99 },
]

export const accounts = [
  { name: 'Coinbase', initial: 'C', color: '#1a66ff', updated: '2 hours ago', change: -0.22, balance: 3360 },
  { name: 'Vanguard', initial: 'V', color: '#e5072d', updated: '4 hours ago', change: 1.97, balance: 6281 },
  { name: 'Wealthfront', initial: 'W', color: '#4840bb', updated: '2 hours ago', change: 1.81, balance: 2906 },
  { name: 'Charles Schwab', initial: 'S', color: '#00a0df', updated: '8 hours ago', change: -0.15, balance: 4278 },
]

export const holdings = [
  { ticker: 'AAPL', name: 'Apple', change: 1.91, seed: 3 },
  { ticker: 'RIVN', name: 'Rivian', change: 1.52, seed: 7 },
  { ticker: 'MSFT', name: 'Microsoft', change: -1.64, seed: 11 },
  { ticker: 'VTI', name: 'Vanguard Total Stock Market Index Fund ETF', change: 1.47, seed: 19 },
]

export const allocation = [
  { label: 'Equity', pct: 58 },
  { label: 'Crypto', pct: 34 },
  { label: 'ETF', pct: 22 },
  { label: 'Cash', pct: 8 },
]

export type Review = {
  name: string
  handle?: string
  title?: string
  body: string
  stars?: boolean
  avatar: string
}

// Placeholder testimonials (fictional people), modeled on the layout of the original.
export const reviews: Review[] = [
  { name: 'Avery Collins', title: 'A must have personal finance app', stars: true, avatar: '#3373cc',
    body: "I wanted one place to track spending, investments and net worth. Two years in and it's changed how I think about money. The graphs are beautiful and I can see exactly where everything goes." },
  { name: 'Jordan Reyes', handle: '@jreyes', avatar: '#ff8833',
    body: 'Used the same budgeting app for close to a decade and switched last week.\n\nThis IS the move.' },
  { name: 'Sam Patel', title: 'Totally worth the subscription!', stars: true, avatar: '#59cc33',
    body: "I never thought I'd pay for a budgeting app, but this one is worth it. 5/5, no questions asked. If you care about seeing the big picture with your finances, get it." },
  { name: 'Riley Chen', handle: '@rileyc', avatar: '#9019e6', body: 'Clean design and easy to use. Exactly what I wanted.' },
  { name: 'Morgan Lee', title: "I've tried them all", stars: true, avatar: '#e83030',
    body: "You name the budgeting app, I've used it. This is the one I actually open every day. The interface is great, accounts sync reliably, and support has been outstanding. Not perfect, but a keeper." },
  { name: 'Taylor Brooks', handle: '@tbrooks', avatar: '#00acfe', body: 'Best money app I have ever used!!' },
  { name: 'Casey Nguyen', title: 'The Best Budgeting App!!', stars: true, avatar: '#ff33aa',
    body: 'A magical experience so far. It keeps you informed, but the right things are automatic. You choose how hands-on to be. Getting a budget set up took minutes.' },
  { name: 'Drew Alvarez', handle: '@drewal', avatar: '#f27f0c', body: 'Downloaded yesterday and already love it. Connected multiple cards and it breaks everything down beautifully.' },
  { name: 'Jamie Foster', handle: '@jfoster', avatar: '#4840bb', body: "I actually enjoy checking my finances now. I've gotten a few friends hooked too." },
  { name: 'Quinn Harper', handle: '@quinnh', avatar: '#00cc4b', body: 'Finally an app with a dashboard showing all my accounts in one place.' },
  { name: 'Parker Diaz', title: 'Amazing Design, Great App to Switch To', stars: true, avatar: '#c08635',
    body: "I've been a power user of desktop finance software. The iPhone and Mac apps feel native and clean, and new features ship constantly. If you want to track spending and budgets, give it a try." },
  { name: 'Skyler Kim', handle: '@skylerk', avatar: '#ea687c', body: 'Love it. That is the review.' },
  { name: 'Rowan Ellis', title: 'So good and waaay better', stars: true, avatar: '#1c6cff',
    body: "Years on another app, and I'm so happy I switched. Managing my finances is fun now. Incredible support team that actually listens." },
  { name: 'Emerson Wade', handle: '@ewade', avatar: '#94ae43', body: 'Few apps become homescreen fixtures this quickly. Go get it!' },
]

export const footerLinks = {
  Product: ['Overview', 'Features', 'Pricing', 'Download'],
  Company: ['About', 'Careers', 'California Privacy Notice', 'Privacy Policy', 'Terms', 'FAQ'],
  Resources: ['Help Center', "What's new?", 'Privacy & Security', 'Country Leaderboard', 'For Employees'],
  Social: ['Developer Spotlight', 'Partnerships', 'Instagram', 'LinkedIn', 'YouTube', 'X'],
}

export const fmt = (n: number, digits = 2) =>
  n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })

let _id = 0
const nextId = () => `req_${++_id}_${Date.now()}`

const HOSTS = [
  'api.example.com', 'cdn.example.com', 'analytics.googleapis.com',
  'www.googletagmanager.com', 'fonts.googleapis.com', 'fonts.gstatic.com',
  'static.cloudflare.com', 'edge.app.local', 'i.imgur.com',
  'media.assets.io', 'ws.realtime.io',
]

const PATHS_BY_TYPE = {
  fetch: ['/api/v1/users', '/api/v1/profile', '/api/orders?limit=20',
    '/api/products?category=apparel', '/api/cart/items', '/api/feed/timeline',
    '/api/messages?after=12345'],
  xhr: ['/api/v1/metrics', '/api/v1/heartbeat', '/api/v1/track?event=view', '/api/v1/log'],
  doc: ['/', '/dashboard', '/settings', '/about'],
  css: ['/static/css/main.css', '/assets/styles/app.css', '/theme.css'],
  js: ['/static/js/main.bundle.js', '/static/js/vendor.chunk.js', '/static/js/runtime.js', '/sdk/analytics.js'],
  font: ['/fonts/Inter-Regular.woff2', '/fonts/JetBrainsMono.woff2', '/s/roboto/v32/KFOmCnqEu92Fr1Mu4mxK.woff2'],
  img: ['/img/hero.png', '/img/avatar.jpg', '/cdn/banner.webp', '/i/profile.png'],
  media: ['/media/intro.mp4', '/audio/podcast.mp3'],
  manifest: ['/site.webmanifest', '/manifest.json'],
  socket: ['/socket'],
  wasm: ['/lib/codec.wasm'],
  other: ['/health', '/ping'],
}

const METHODS = ['GET', 'GET', 'GET', 'POST', 'POST', 'PUT', 'DELETE', 'PATCH']

const TYPE_WEIGHTS = {
  fetch: 8, xhr: 4, doc: 1, css: 2, js: 6, font: 1,
  img: 5, media: 1, manifest: 1, socket: 1, wasm: 1, other: 1,
}

function pickType() {
  const pool = []
  for (const [t, w] of Object.entries(TYPE_WEIGHTS)) {
    for (let i = 0; i < w; i++) pool.push(t)
  }
  return pool[Math.floor(Math.random() * pool.length)]
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }

function mimeFor(type) {
  return ({
    fetch: 'application/json', xhr: 'application/json',
    doc: 'text/html; charset=utf-8', css: 'text/css',
    js: 'application/javascript', font: 'font/woff2',
    img: 'image/webp', media: 'video/mp4',
    manifest: 'application/manifest+json', socket: 'text/plain',
    wasm: 'application/wasm', other: 'text/plain',
  })[type] || 'application/octet-stream'
}

function sizeFor(type) {
  const ranges = {
    fetch: [200, 8000], xhr: [100, 2000], doc: [3000, 60000],
    css: [800, 30000], js: [2000, 250000], font: [10000, 80000],
    img: [3000, 300000], media: [50000, 4000000], manifest: [200, 1500],
    socket: [50, 500], wasm: [10000, 200000], other: [50, 1000],
  }
  const [min, max] = ranges[type] || [200, 5000]
  return Math.floor(min + Math.random() * (max - min))
}

function timingFor() {
  const queue = Math.random() * 8
  const dns = Math.random() < 0.4 ? Math.random() * 25 : 0
  const connect = Math.random() < 0.3 ? Math.random() * 60 : 0
  const ssl = connect > 0 ? Math.random() * 40 : 0
  const ttfb = 20 + Math.random() * 280
  const download = 5 + Math.random() * 250
  return { queue, dns, connect, ssl, ttfb, download }
}

function statusFor() {
  const r = Math.random()
  if (r < 0.72) return 200
  if (r < 0.76) return 204
  if (r < 0.82) return 301
  if (r < 0.87) return 304
  if (r < 0.91) return 404
  if (r < 0.94) return 500
  if (r < 0.97) return 0
  return 401
}

function sampleHeaders(method, url, type) {
  let host = ''
  try { host = new URL(url).host } catch { host = '' }
  let path = ''
  try { const u = new URL(url); path = u.pathname + u.search } catch { path = '/' }

  const reqHeaders = {
    ':method': method, ':authority': host, ':scheme': 'https', ':path': path,
    'accept': type === 'img' ? 'image/avif,image/webp,*/*' : 'application/json, text/plain, */*',
    'accept-encoding': 'gzip, deflate, br',
    'accept-language': 'en-US,en;q=0.9',
    'cache-control': 'no-cache',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  }
  if (method !== 'GET' && method !== 'DELETE') {
    reqHeaders['content-type'] = 'application/json'
    reqHeaders['origin'] = `https://${host}`
  }
  const resHeaders = {
    'content-type': mimeFor(type),
    'content-encoding': 'br',
    'cache-control': 'public, max-age=300',
    'date': new Date().toUTCString(),
    'server': 'cloudflare',
    'x-content-type-options': 'nosniff',
  }
  return { reqHeaders, resHeaders }
}

function samplePayload(method, type) {
  if (method === 'GET' || method === 'DELETE') return null
  if (type === 'fetch' || type === 'xhr') {
    return JSON.stringify({
      userId: Math.floor(Math.random() * 1000),
      action: pick(['update', 'create', 'click', 'view']),
      ts: Date.now(),
      meta: { source: 'web', version: '1.298.0' },
    }, null, 2)
  }
  return null
}

function sampleResponse(status, type) {
  if (status === 204 || status === 0) return ''
  if (type === 'fetch' || type === 'xhr') {
    return JSON.stringify({
      ok: status >= 200 && status < 400,
      data: Array.from({ length: 3 }, (_, i) => ({
        id: i + 1,
        name: pick(['Alpha', 'Beta', 'Gamma', 'Delta']) + '-' + (i + 1),
        value: Math.round(Math.random() * 1000) / 10,
      })),
      meta: { count: 3, page: 1 },
    }, null, 2)
  }
  if (type === 'doc') return '<!doctype html><html><head>...</head><body>...</body></html>'
  if (type === 'css') return '/* compiled css */\n.app { display: flex; }'
  if (type === 'js') return '/* bundled js */\n!function(){"use strict"}();'
  return '(binary content not shown)'
}

export function generateRequest({ startedAt = performance.now() } = {}) {
  const type = pickType()
  const host = pick(HOSTS)
  const path = pick(PATHS_BY_TYPE[type] || PATHS_BY_TYPE.fetch)
  const method = (type === 'fetch' || type === 'xhr') ? pick(METHODS) : 'GET'
  const url = `https://${host}${path}`
  const status = statusFor()
  const failed = status === 0
  const errorText = failed ? '(failed) net::ERR_CONNECTION_RESET' : null
  const timing = timingFor()
  const duration = Object.values(timing).reduce((a, b) => a + b, 0)
  const size = failed ? 0 : sizeFor(type)
  const { reqHeaders, resHeaders } = sampleHeaders(method, url, type)
  const name = path.split('/').filter(Boolean).pop() || host

  return {
    id: nextId(),
    name,
    url,
    host,
    path,
    method,
    type,
    status,
    statusText: errorText,
    initiator: pick([
      'main-CfwT4dcx.js:5', 'vendor.chunk.js:1',
      'app.bundle.js:42', 'analytics.js:12', 'Other',
    ]),
    size,
    transferred: failed ? 0 : Math.max(120, Math.round(size * (0.4 + Math.random() * 0.6))),
    duration,
    timing,
    startedAt,
    finishedAt: startedAt + duration,
    mime: mimeFor(type),
    requestHeaders: reqHeaders,
    responseHeaders: resHeaders,
    payload: samplePayload(method, type),
    response: sampleResponse(status, type),
    cookies: Math.random() < 0.4 ? [
      { name: 'session_id', value: Math.random().toString(36).slice(2, 18), domain: host, path: '/', httpOnly: true, secure: true },
      { name: '_ga', value: 'GA1.2.' + Math.floor(Math.random() * 1e9), domain: host, path: '/', httpOnly: false, secure: true },
    ] : [],
  }
}

export function seedInitial(count = 28) {
  const base = performance.now() - 15000
  return Array.from({ length: count }, (_, i) =>
    generateRequest({ startedAt: base + i * (Math.random() * 600 + 100) })
  )
}

export const ALL_TYPES = Object.keys(TYPE_WEIGHTS)

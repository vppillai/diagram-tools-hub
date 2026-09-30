import { TLSocketRoom } from '@tldraw/sync-core'
import { WebSocketServer } from 'ws'
import { createServer } from 'http'
import { request as httpRequest } from 'http'
import { request as httpsRequest } from 'https'
import { readFile, writeFile, mkdir, readdir, stat, unlink, rename } from 'fs/promises'
import { join } from 'path'
import { BlockList, isIP } from 'net'
import { lookup as dnsLookup } from 'dns/promises'
import { createGunzip, createInflate, createBrotliDecompress } from 'zlib'
import _unfurl from 'unfurl.js'

const PORT = process.env.PORT || 3001
const DIR = './.rooms'
const ASSETS_DIR = './.assets'

// Max bytes for a single asset upload. Matches the frontend's
// `options.maxAssetSize` (10 MB) — anything larger is rejected with 413
// before it can buffer in memory.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

// Safe character set for any path-segment derived from a URL (asset IDs,
// room IDs). Length-capped to prevent absurd values; explicitly rejects
// '..' even though the regex wouldn't allow it, as defense-in-depth.
// Closes the path-traversal vector on /uploads/<id> and /connect/<roomId>.
const SAFE_ID_RE = /^[A-Za-z0-9_.\-]{1,200}$/
function isSafeId(s) {
    return typeof s === 'string' && SAFE_ID_RE.test(s) && !s.includes('..')
}

// decodeURIComponent throws on malformed escapes (e.g. "%E0%A4"); inside an
// async request handler that became an unhandled rejection and took the
// whole process down. Return null and let isSafeId reject it instead.
function safeDecode(s) {
    try { return decodeURIComponent(s) } catch { return null }
}

// Last-resort guards: log instead of exiting on a stray rejection so one bad
// request cannot drop every connected room.
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection:', reason)
})

// ----- Unfurl SSRF guard ---------------------------------------------------
// Every hop of an unfurl fetch must land on a public address. We resolve the
// host ourselves, reject if ANY resolved address is non-public, and pin the
// socket to exactly the addresses we validated (custom `lookup`) so a DNS
// rebind between check and connect cannot redirect us to an internal host.
const BLOCKED = new BlockList()
for (const [net, prefix] of [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
    ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16],
    ['224.0.0.0', 4], ['240.0.0.0', 4],
]) BLOCKED.addSubnet(net, prefix, 'ipv4')
for (const [net, prefix] of [
    ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
]) BLOCKED.addSubnet(net, prefix, 'ipv6')

// Expand an IPv6 address (optionally with a dotted-quad tail) to 8 numbers.
function ipv6Groups(addr) {
    let a = addr.toLowerCase()
    if (a.includes('.')) {
        const i = a.lastIndexOf(':')
        const q = a.slice(i + 1).split('.').map(Number)
        a = a.slice(0, i + 1) + ((q[0] << 8) | q[1]).toString(16) + ':' + ((q[2] << 8) | q[3]).toString(16)
    }
    const [head, tail] = a.split('::')
    const h = head ? head.split(':') : []
    if (tail === undefined) return h.map(g => parseInt(g, 16))
    const t = tail ? tail.split(':') : []
    return [...h, ...Array(8 - h.length - t.length).fill('0'), ...t].map(g => parseInt(g, 16))
}

function isPublicAddress(addr) {
    try {
        const family = isIP(addr)
        if (family === 4) return !BLOCKED.check(addr, 'ipv4')
        if (family !== 6) return false
        const g = ipv6Groups(addr)
        if (g.length !== 8 || g.some(n => !Number.isInteger(n) || n < 0 || n > 0xffff)) return false
        // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d): judge
        // by the embedded IPv4 address, which is what the kernel connects to.
        if (g.slice(0, 5).every(n => n === 0) && (g[5] === 0xffff || g[5] === 0)) {
            const v4 = `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`
            return !BLOCKED.check(v4, 'ipv4')
        }
        return !BLOCKED.check(addr, 'ipv6')
    } catch {
        return false
    }
}

// Parse + resolve + validate one URL. Returns { url, addresses } or throws;
// policy rejections carry code 'NOT_PUBLIC' (DNS failures keep their own).
function notPublic(message) {
    return Object.assign(new Error(message), { code: 'NOT_PUBLIC' })
}
async function resolvePublicUrl(rawUrl) {
    let parsed
    try { parsed = new URL(rawUrl) } catch { throw notPublic('Invalid URL') }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw notPublic('Only http(s) URLs allowed')
    const host = parsed.hostname.replace(/^\[|\]$/g, '')
    if (!host) throw notPublic('Missing host')
    const addresses = isIP(host)
        ? [{ address: host, family: isIP(host) }]
        : await dnsLookup(host, { all: true })
    if (addresses.length === 0 || !addresses.every(a => isPublicAddress(a.address))) {
        throw notPublic(`Host ${host} resolves to a non-public address`)
    }
    return { url: parsed, addresses }
}

const UNFURL_TIMEOUT_MS = 5000
const UNFURL_MAX_BYTES = 1024 * 1024
const UNFURL_MAX_REDIRECTS = 3

// One GET with the socket pinned to pre-validated addresses. Resolves to a
// WHATWG Response (what unfurl.js expects from a custom fetch). Body is
// decompressed and truncated at UNFURL_MAX_BYTES — page metadata lives in
// <head>, so a truncated body still unfurls.
function pinnedGet(url, addresses, signal) {
    return new Promise((resolve, reject) => {
        const lookup = (_h, opts, cb) => opts && opts.all
            ? cb(null, addresses)
            : cb(null, addresses[0].address, addresses[0].family)
        const req = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
            method: 'GET',
            lookup,
            signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; DiagramToolsHub-unfurl/1.0)',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Encoding': 'gzip, deflate, br',
            },
        }, (res) => {
            const enc = String(res.headers['content-encoding'] || '').toLowerCase()
            let body = res
            if (enc === 'gzip' || enc === 'x-gzip') body = res.pipe(createGunzip())
            else if (enc === 'deflate') body = res.pipe(createInflate())
            else if (enc === 'br') body = res.pipe(createBrotliDecompress())
            const chunks = []
            let size = 0
            let done = false
            const finish = () => {
                if (done) return
                done = true
                res.destroy()
                const headers = {}
                if (res.headers['content-type']) headers['content-type'] = res.headers['content-type']
                if (res.headers.location) headers.location = res.headers.location
                const status = res.statusCode >= 200 && res.statusCode <= 599 ? res.statusCode : 502
                resolve(new Response(status === 204 || status === 304 ? null : Buffer.concat(chunks), { status, headers }))
            }
            body.on('data', (c) => {
                if (done) return
                const room = UNFURL_MAX_BYTES - size
                chunks.push(c.length > room ? c.subarray(0, room) : c)
                size += Math.min(c.length, room)
                if (size >= UNFURL_MAX_BYTES) finish()
            })
            body.on('end', finish)
            const fail = (e) => { if (!done) { done = true; reject(e) } }
            body.on('error', fail)
            res.on('error', fail)
            res.on('close', () => { if (!res.complete) fail(new Error('Response aborted')) })
        })
        req.on('error', reject)
        req.end()
    })
}

// Custom fetch for unfurl.js: re-validates every redirect hop manually.
async function safeFetch(rawUrl, signal) {
    let target = rawUrl
    for (let hop = 0; ; hop++) {
        const { url, addresses } = await resolvePublicUrl(target)
        const res = await pinnedGet(url, addresses, signal)
        const location = res.headers.get('location')
        if (![301, 302, 303, 307, 308].includes(res.status) || !location) return res
        if (hop >= UNFURL_MAX_REDIRECTS) throw new Error('Too many redirects')
        target = new URL(location, url).href
    }
}

// Cleanup configuration
const CLEANUP_CONFIG = {
    // Room files not modified for this long are deleted, unless loaded (ms)
    ROOM_RETENTION_PERIOD: parseInt(process.env.ROOM_RETENTION_DAYS || '90') * 24 * 60 * 60 * 1000, // 90 days default
    // Asset files older than this are deleted if no room references them (ms)
    ASSET_RETENTION_PERIOD: parseInt(process.env.ASSET_RETENTION_DAYS || '90') * 24 * 60 * 60 * 1000, // 90 days default
    // How often to run cleanup (in milliseconds)
    CLEANUP_INTERVAL: parseInt(process.env.CLEANUP_INTERVAL_HOURS || '6') * 60 * 60 * 1000, // 6 hours default
    // Enable/disable cleanup
    CLEANUP_ENABLED: process.env.CLEANUP_ENABLED !== 'false' // Enabled by default
}

// Files in DIR that are not room snapshots: in-flight/orphaned atomic-write
// temp files and quarantined unparseable snapshots.
const isTmpFile = (name) => /\.tmp(-\d+-\d+)?$/.test(name)
const isCorruptFile = (name) => /\.corrupt-\d+$/.test(name)
const isRoomFile = (name) => !name.startsWith('.') && !isTmpFile(name) && !isCorruptFile(name)
const TMP_ORPHAN_AGE = 60 * 60 * 1000

// A room is loaded while its map entry is an in-flight load or an open room.
function isRoomLoaded(roomId) {
    const entry = rooms.get(roomId)
    if (!entry) return false
    if (typeof entry.then === 'function') return true
    return !entry.room.isClosed()
}

// Storage cleanup functions
async function cleanupOldRooms() {
    if (!CLEANUP_CONFIG.CLEANUP_ENABLED) return

    try {
        console.log('Starting room cleanup...')
        const roomFiles = await readdir(DIR).catch(() => [])
        const now = Date.now()
        let cleaned = 0

        for (const file of roomFiles) {
            if (file.startsWith('.') || isCorruptFile(file)) continue  // corrupt files are kept for the operator
            const filePath = join(DIR, file)
            const stats = await stat(filePath).catch(() => null)
            if (!stats) continue

            // Temp files are only live for the duration of one write; an old
            // one is debris from a crash mid-write.
            if (isTmpFile(file)) {
                if (now - stats.mtime.getTime() > TMP_ORPHAN_AGE) await unlink(filePath).catch(() => {})
                continue
            }

            if (now - stats.mtime.getTime() <= CLEANUP_CONFIG.ROOM_RETENTION_PERIOD) continue
            // Never delete the file behind a loaded room: an open but
            // unedited room would otherwise lose its only copy. Checked
            // right before unlink (same tick) so a concurrent load can't slip in.
            if (isRoomLoaded(file)) continue
            await unlink(filePath)
            cleaned++
            console.log(`Cleaned up old room: ${file}`)
        }

        console.log(`Room cleanup completed: ${cleaned} rooms removed`)
    } catch (error) {
        console.error('Error during room cleanup:', error)
    }
}

// Assets are garbage-collected by reference: an asset is removed only when it
// is past ASSET_RETENTION_PERIOD AND no room (on disk or loaded) mentions its
// id. Clients no longer DELETE on shape removal, since undo / copy-paste /
// other rooms may still point at the same file.
async function cleanupOldAssets() {
    if (!CLEANUP_CONFIG.CLEANUP_ENABLED) return

    try {
        console.log('Starting asset cleanup...')
        const assetFiles = await readdir(ASSETS_DIR).catch(() => [])
        const present = new Set(assetFiles)
        const now = Date.now()
        let cleaned = 0

        const candidates = new Set()
        for (const file of assetFiles) {
            if (isMetaFile(file)) {
                // Sidecar whose asset is gone (e.g. deleted by hand).
                if (!present.has(file.slice(0, -META_SUFFIX.length))) {
                    await unlink(join(ASSETS_DIR, file)).catch(() => {})
                }
                continue
            }
            const stats = await stat(join(ASSETS_DIR, file)).catch(() => null)
            if (stats && (now - stats.mtime.getTime()) > CLEANUP_CONFIG.ASSET_RETENTION_PERIOD) {
                candidates.add(file)
            }
        }

        if (candidates.size > 0) {
            // ponytail: substring scan of every snapshot, O(rooms x candidates);
            // fine for hundreds of rooms, index asset refs if it ever isn't.
            const dropReferenced = (text) => {
                for (const id of candidates) if (text.includes(id)) candidates.delete(id)
            }
            for (const state of rooms.values()) {
                if (!state || typeof state.then === 'function' || state.room.isClosed()) continue
                dropReferenced(JSON.stringify(state.room.getCurrentSnapshot()))
            }
            // Any read error other than a vanished file aborts the sweep:
            // better to keep garbage than delete a referenced asset.
            const roomFiles = await readdir(DIR).catch((err) => {
                if (err.code === 'ENOENT') return []
                throw err
            })
            for (const file of roomFiles) {
                if (candidates.size === 0) break
                if (file.startsWith('.')) continue
                const text = await readFile(join(DIR, file), 'utf8').catch((err) => {
                    if (err.code === 'ENOENT') return ''
                    throw err
                })
                dropReferenced(text)
            }
        }

        for (const file of candidates) {
            await unlink(join(ASSETS_DIR, file))
            await unlink(join(ASSETS_DIR, file + META_SUFFIX)).catch(() => {})
            cleaned++
            console.log(`Cleaned up unreferenced old asset: ${file}`)
        }

        console.log(`Asset cleanup completed: ${cleaned} assets removed`)
    } catch (error) {
        console.error('Error during asset cleanup:', error)
    }
}

async function performCleanup() {
    console.log('Performing scheduled cleanup...')
    await cleanupOldRooms()
    await cleanupOldAssets()
    console.log('Cleanup cycle completed')
}

// Room management
const rooms = new Map()

// Most recent snapshot write failure across all rooms; surfaced by the
// health endpoints so a full/read-only disk doesn't fail silently.
let lastPersistError = null
const PERSIST_ERROR_WINDOW_MS = 10 * 60 * 1000

async function readSnapshotIfExists(roomId) {
    const filePath = join(DIR, roomId)
    let data
    try {
        data = await readFile(filePath, 'utf8')
        return JSON.parse(data) ?? undefined
    } catch (err) {
        if (err.code === 'ENOENT') return undefined  // new room
        // Unreadable or unparseable: move it aside so the first persist of
        // the (now empty) room cannot overwrite what may be recoverable.
        // If the rename fails too, refuse to load rather than risk that.
        const quarantine = `${filePath}.corrupt-${Date.now()}`
        await rename(filePath, quarantine)
        console.error(`!!! CORRUPT ROOM SNAPSHOT: ${roomId} could not be loaded (${err.message}). ` +
            `Original preserved as ${quarantine}; room starts empty.`)
        return undefined
    }
}

let tmpCounter = 0
async function saveSnapshot(roomId, snapshot) {
    await mkdir(DIR, { recursive: true })
    // Atomic write: a process kill between writeFile and full sync would
    // otherwise leave a truncated file, which JSON.parse rejects on the
    // next load. POSIX rename is atomic. The unique tmp name keeps two
    // writers (should one ever overlap) from interleaving into one file.
    const finalPath = join(DIR, roomId)
    const tmpPath = `${finalPath}.tmp-${process.pid}-${++tmpCounter}`
    try {
        await writeFile(tmpPath, JSON.stringify(snapshot))
        await rename(tmpPath, finalPath)
    } catch (err) {
        await unlink(tmpPath).catch(() => {})
        throw err
    }
}

async function makeOrLoadRoom(roomId) {
    // The map entry may hold either a concrete roomState OR a Promise that
    // resolves to one — the latter happens while a previous concurrent
    // call is still loading. Without this, two simultaneous WebSocket
    // upgrades for a new room both pass `has`, both load the snapshot,
    // both construct a TLSocketRoom, and the second one overwrites the
    // first leaving an orphaned persistInterval referencing a dead room.
    const existing = rooms.get(roomId)
    if (existing) {
        const state = await Promise.resolve(existing)
        if (state && !state.room.isClosed()) {
            return state.room
        }
        // Stale entry (closed room) — fall through to recreate
    }

    const loadPromise = (async () => {
        console.log('Loading room:', roomId)
        const initialSnapshot = await readSnapshotIfExists(roomId)
        console.log(`Initial snapshot for room ${roomId}:`, initialSnapshot ? 'found' : 'not found')

        let saveTimeout = null
        const state = { needsPersist: false, id: roomId, room: null, lastPersistError: null }

        // Persists are serialised per room through a promise chain, so the
        // debounce timer, the 5 s heartbeat and shutdown can never race two
        // writes of the same room (an older snapshot landing last). The chain
        // never rejects; failures re-arm needsPersist so the heartbeat retries.
        let persistChain = Promise.resolve()
        const persistData = () => {
            persistChain = persistChain.then(async () => {
                if (!state.needsPersist) return
                state.needsPersist = false
                try {
                    const snapshot = state.room.getCurrentSnapshot()
                    await saveSnapshot(roomId, snapshot)
                } catch (error) {
                    state.needsPersist = true
                    state.lastPersistError = lastPersistError = {
                        time: new Date().toISOString(),
                        room: roomId,
                        message: error?.message || String(error),
                    }
                    console.error(`Failed to save snapshot for room ${roomId}:`, error)
                }
            })
            return persistChain
        }

        state.room = new TLSocketRoom({
            initialSnapshot,
            onSessionRemoved(room, args) {
                console.log(`Client disconnected: ${args.sessionId} (${roomId}, ${args.numSessionsRemaining} remaining)`)
                if (args.numSessionsRemaining === 0) {
                    setTimeout(() => {
                        if (room.getNumActiveSessions() === 0) {
                            console.log('Closing room after timeout:', roomId)
                            room.close()
                        }
                    }, 30000)
                }
            },
            onDataChange() {
                state.needsPersist = true
                if (saveTimeout) clearTimeout(saveTimeout)
                saveTimeout = setTimeout(persistData, 500)
            },
        })

        // Heartbeat: backup persist + cleanup on close.
        state.persistInterval = setInterval(async () => {
            if (state.needsPersist) await persistData()
            if (state.room.isClosed()) {
                console.log(`Room ${roomId} is closed, cleaning up`)
                clearInterval(state.persistInterval)
                if (saveTimeout) clearTimeout(saveTimeout)
                // Final flush guarantees data committed before the map entry
                // is dropped (no-op when nothing is pending).
                await persistData()
                if (state.needsPersist) {
                    console.error(`Room ${roomId} closed with unsaved changes: final persist failed`)
                }
                // Only remove our own entry: a room re-created in the 5 s
                // window would otherwise be dropped from the map while live.
                if (rooms.get(roomId) === state) rooms.delete(roomId)
            }
        }, 5000)

        // Expose persistData so the SIGTERM handler can force a final flush.
        state.persistData = persistData

        return state
    })()

    rooms.set(roomId, loadPromise)
    try {
        const state = await loadPromise
        rooms.set(roomId, state)  // replace promise with concrete value
        return state.room
    } catch (err) {
        rooms.delete(roomId)
        throw err
    }
}

// Asset storage. Uploads are same-origin with the hub, so serving an
// attacker-chosen body with a sniffable type would be stored XSS. We accept
// only image/video formats identified by magic bytes, remember the detected
// type in a `<id>.meta.json` sidecar, and serve with nosniff + a sandbox CSP.
const META_SUFFIX = '.meta.json'
const isMetaFile = (name) => name.endsWith(META_SUFFIX)

function sniffContentType(buf) {
    const ascii = (start, end) => buf.subarray(start, end).toString('latin1')
    if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
    if (buf.length >= 6 && (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a')) return 'image/gif'
    if (buf.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
    if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'video/webm'
    if (buf.length >= 12 && ascii(4, 8) === 'ftyp') {
        const brand = ascii(8, 12)
        if (brand === 'avif' || brand === 'avis') return 'image/avif'
        if (brand === 'qt  ') return 'video/quicktime'
        return 'video/mp4'
    }
    // SVG: text starting (after optional BOM/whitespace) with <svg or <?xml;
    // an XML prolog must be followed by an <svg root somewhere in the head.
    let head = buf.subarray(0, 64 * 1024).toString('utf8')
    if (head.charCodeAt(0) === 0xfeff) head = head.slice(1)
    head = head.trimStart()
    if (/^<svg[\s>]/i.test(head)) return 'image/svg+xml'
    if (head.startsWith('<?xml') && /<svg[\s>]/i.test(head)) return 'image/svg+xml'
    return null
}

async function storeAsset(id, buffer, contentType) {
    await mkdir(ASSETS_DIR, { recursive: true })
    await writeFile(join(ASSETS_DIR, id), buffer)
    await writeFile(join(ASSETS_DIR, id + META_SUFFIX), JSON.stringify({ contentType }))
}

async function loadAsset(id) {
    try {
        return await readFile(join(ASSETS_DIR, id))
    } catch {
        return null
    }
}

// Sidecar first; assets uploaded before sidecars existed are sniffed.
async function assetContentType(id, data) {
    try {
        const meta = JSON.parse(await readFile(join(ASSETS_DIR, id + META_SUFFIX), 'utf8'))
        if (typeof meta.contentType === 'string' && /^(image|video)\//.test(meta.contentType)) return meta.contentType
    } catch { /* no/invalid sidecar */ }
    return sniffContentType(data) || 'application/octet-stream'
}

// URL unfurling. All network access goes through safeFetch (SSRF guard,
// manual redirects, 1 MB cap); one 5 s deadline covers every hop.
async function unfurl(url) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), UNFURL_TIMEOUT_MS)
    try {
        const { title, description, open_graph, twitter_card, favicon } = await _unfurl.unfurl(url, {
            oembed: false,
            fetch: (u) => safeFetch(u, controller.signal),
        })
        const image = open_graph?.images?.[0]?.url || twitter_card?.images?.[0]?.url

        return {
            title: title || '',
            description: description || '',
            image: image || '',
            favicon: favicon || '',
        }
    } catch (error) {
        console.error('Unfurl error:', error?.message || error)
        return {
            title: '',
            description: '',
            image: '',
            favicon: '',
        }
    } finally {
        clearTimeout(timer)
    }
}

// Create WebSocket server that handles upgrade requests manually
const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024 })

// Monitoring and statistics functions
async function getRoomStatistics() {
    try {
        const stats = {
            totalRooms: 0,
            activeRooms: 0,
            storageUsed: 0,
            rooms: [],
            lastUpdated: new Date().toISOString()
        }

        try {
            await mkdir(DIR, { recursive: true })
            const roomFiles = await readdir(DIR)
            
            for (const file of roomFiles) {
                if (isRoomFile(file)) {
                    const filePath = join(DIR, file)
                    const stat_result = await stat(filePath)
                    const roomName = file
                    
                    // Check if room is active (modified within last 24 hours)
                    const isActive = (Date.now() - stat_result.mtime.getTime()) < (24 * 60 * 60 * 1000)
                    
                    stats.rooms.push({
                        name: roomName,
                        size: stat_result.size,
                        lastModified: stat_result.mtime.toISOString(),
                        isActive: isActive
                    })
                    
                    stats.totalRooms++
                    stats.storageUsed += stat_result.size
                    if (isActive) stats.activeRooms++
                }
            }
            
            // Sort rooms by last modified (newest first)
            stats.rooms.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified))
        } catch (error) {
            console.error('Error reading room directory:', error)
        }

        return stats
    } catch (error) {
        console.error('Error getting room statistics:', error)
        return { error: error.message }
    }
}

async function getAssetStatistics() {
    try {
        const stats = {
            totalAssets: 0,
            storageUsed: 0,
            assets: [],
            lastUpdated: new Date().toISOString()
        }

        try {
            await mkdir(ASSETS_DIR, { recursive: true })
            const assetFiles = await readdir(ASSETS_DIR)
            
            for (const file of assetFiles) {
                if (isMetaFile(file)) continue
                const filePath = join(ASSETS_DIR, file)
                const stat_result = await stat(filePath)

                stats.assets.push({
                    name: file,
                    size: stat_result.size,
                    lastModified: stat_result.mtime.toISOString()
                })
                
                stats.totalAssets++
                stats.storageUsed += stat_result.size
            }
            
            // Sort assets by size (largest first)
            stats.assets.sort((a, b) => b.size - a.size)
        } catch (error) {
            console.error('Error reading assets directory:', error)
        }

        return stats
    } catch (error) {
        console.error('Error getting asset statistics:', error)
        return { error: error.message }
    }
}

async function getSystemStatistics() {
    try {
        const stats = {
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            cpuUsage: process.cpuUsage(),
            nodeVersion: process.version,
            platform: process.platform,
            pid: process.pid,
            activeConnections: wss ? wss.clients.size : 0,
            environment: {
                port: PORT,
                roomsDir: DIR,
                assetsDir: ASSETS_DIR,
                cleanupConfig: CLEANUP_CONFIG
            },
            lastUpdated: new Date().toISOString()
        }

        return stats
    } catch (error) {
        console.error('Error getting system statistics:', error)
        return { error: error.message }
    }
}

function persistErrorIsRecent() {
    return !!lastPersistError && Date.now() - Date.parse(lastPersistError.time) < PERSIST_ERROR_WINDOW_MS
}

async function getHealthStatus() {
    try {
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            checks: {
                memory: { status: 'healthy', details: process.memoryUsage() },
                disk: { status: 'unknown', details: 'Disk check not implemented' },
                connections: { 
                    status: 'healthy', 
                    details: { active: wss ? wss.clients.size : 0 }
                }
            }
        }

        // Check memory usage (warn if over 95% of heap used or RSS over 512MB)
        const memUsage = process.memoryUsage()
        const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100
        const rssMB = memUsage.rss / (1024 * 1024)
        
        if (heapUsedPercent > 95) {
            health.checks.memory.status = 'warning'
            health.checks.memory.warning = `Critical heap usage: ${heapUsedPercent.toFixed(1)}%`
        } else if (rssMB > 512) {
            health.checks.memory.status = 'warning'
            health.checks.memory.warning = `High RSS memory: ${rssMB.toFixed(1)}MB`
        }

        // Check directories
        try {
            await mkdir(DIR, { recursive: true })
            await mkdir(ASSETS_DIR, { recursive: true })
            // mkdir -p on an existing root-owned directory succeeds; a write
            // probe is what actually tells us snapshots can be saved.
            const probe = join(DIR, `.health-${process.pid}`)
            await writeFile(probe, '')
            await unlink(probe)
            health.checks.storage = { status: 'healthy', details: 'Directories writable' }
        } catch (error) {
            health.checks.storage = { status: 'error', details: error.message }
            health.status = 'unhealthy'
        }

        health.checks.persistence = lastPersistError
            ? { status: persistErrorIsRecent() ? 'error' : 'warning', lastPersistError }
            : { status: 'healthy', lastPersistError: null }
        if (persistErrorIsRecent()) health.status = 'unhealthy'

        return health
    } catch (error) {
        console.error('Error getting health status:', error)
        return { 
            status: 'error', 
            timestamp: new Date().toISOString(),
            error: error.message 
        }
    }
}

// Create HTTP server for REST endpoints
const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`)

    // No CORS headers on purpose: every client reaches this server through
    // the hub on the same origin. A wildcard here let any web page drive
    // asset uploads and deletes from an intranet user's browser.
    if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
    }

    // Asset upload — size-limited, ID-validated, error-trapped.
    if (req.method === 'PUT' && url.pathname.startsWith('/uploads/')) {
        const id = safeDecode(url.pathname.slice('/uploads/'.length))
        if (!isSafeId(id) || isMetaFile(id)) {
            res.writeHead(400); res.end('Invalid asset id'); return
        }
        const chunks = []
        let totalBytes = 0
        let aborted = false
        req.on('data', chunk => {
            if (aborted) return
            totalBytes += chunk.length
            if (totalBytes > MAX_UPLOAD_BYTES) {
                aborted = true
                res.writeHead(413); res.end('Payload too large')
                req.destroy()
                return
            }
            chunks.push(chunk)
        })
        req.on('end', async () => {
            if (aborted) return
            const body = Buffer.concat(chunks)
            const contentType = sniffContentType(body)
            if (!contentType) {
                res.writeHead(415, { 'Content-Type': 'text/plain' })
                res.end('Unsupported media type: only PNG, JPEG, GIF, WebP, AVIF, SVG, MP4, WebM and QuickTime are accepted')
                return
            }
            try {
                await storeAsset(id, body, contentType)
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ ok: true }))
            } catch (err) {
                console.error(`Asset PUT failed for ${id}:`, err)
                if (!res.headersSent) {
                    res.writeHead(500); res.end('Store failed')
                }
            }
        })
        return
    }

    // Asset download.
    if (req.method === 'GET' && url.pathname.startsWith('/uploads/')) {
        const id = safeDecode(url.pathname.slice('/uploads/'.length))
        if (!isSafeId(id) || isMetaFile(id)) {
            res.writeHead(400); res.end('Invalid asset id'); return
        }
        const data = await loadAsset(id)
        if (data) {
            const contentType = await assetContentType(id, data)
            res.writeHead(200, {
                'Content-Type': contentType,
                'X-Content-Type-Options': 'nosniff',
                // SVG stays inline so tldraw can render it; the sandbox CSP
                // stops scripts in it if someone opens the URL directly.
                'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
                'Cache-Control': 'private, max-age=86400',
                'Content-Disposition': contentType === 'application/octet-stream' ? 'attachment' : 'inline',
            })
            res.end(data)
        } else {
            res.writeHead(404); res.end('Not found')
        }
        return
    }

    // Asset delete. The v1.11 client no longer calls this (unreferenced
    // assets are garbage-collected server-side); kept for older clients.
    // Idempotent — missing file is fine.
    if (req.method === 'DELETE' && url.pathname.startsWith('/uploads/')) {
        const id = safeDecode(url.pathname.slice('/uploads/'.length))
        if (!isSafeId(id) || isMetaFile(id)) {
            res.writeHead(400); res.end('Invalid asset id'); return
        }
        try {
            await unlink(join(ASSETS_DIR, id + META_SUFFIX)).catch(() => {})
            await unlink(join(ASSETS_DIR, id))
            res.writeHead(204); res.end()
        } catch (err) {
            if (err && err.code === 'ENOENT') {
                res.writeHead(204); res.end()
            } else {
                console.error(`Asset DELETE failed for ${id}:`, err)
                res.writeHead(500); res.end('Delete failed')
            }
        }
        return
    }

    // URL unfurling — public-host only; blocks SSRF to loopback/private/IMDS.
    if (req.method === 'GET' && url.pathname === '/unfurl') {
        const targetUrl = url.searchParams.get('url')
        if (!targetUrl) {
            res.writeHead(400); res.end('Missing url parameter'); return
        }
        try {
            await resolvePublicUrl(targetUrl)
        } catch (err) {
            // Unresolvable hosts fall through to the usual empty 200 result.
            if (err.code === 'NOT_PUBLIC') {
                res.writeHead(400); res.end('URL must point to a public http(s) host'); return
            }
        }
        const result = await unfurl(targetUrl)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
        return
    }

    // Monitoring endpoints
    if (req.method === 'GET' && url.pathname === '/api/rooms') {
        const roomStats = await getRoomStatistics()
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(roomStats))
        return
    }

    if (req.method === 'GET' && url.pathname === '/api/assets') {
        const assetStats = await getAssetStatistics()
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(assetStats))
        return
    }

    if (req.method === 'GET' && url.pathname === '/api/stats') {
        const stats = await getSystemStatistics()
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(stats))
        return
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
        const health = await getHealthStatus()
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(health))
        return
    }

    // Health check (Docker healthcheck). 503 while a snapshot write has
    // failed within the last 10 minutes — edits are not reaching disk.
    if (req.method === 'GET' && url.pathname === '/health') {
        if (persistErrorIsRecent()) {
            res.writeHead(503, { 'Content-Type': 'text/plain' })
            res.end(`PERSIST ERROR ${lastPersistError.time} room=${lastPersistError.room}: ${lastPersistError.message}`)
            return
        }
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('OK')
        return
    }

    res.writeHead(404)
    res.end('Not found')
})

// WebSocket upgrade — only the /connect/<roomId> path; everything else
// is rejected at the TCP layer before WS handshake completes.
server.on('upgrade', (request, socket, head) => {
    if (request.url.startsWith('/connect/')) {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request)
        })
    } else {
        socket.destroy()
    }
})

wss.on('connection', async (ws, req) => {
    const url = new URL(req.url, `http://localhost:${PORT}`)
    const pathParts = url.pathname.split('/')
    const roomId = safeDecode(pathParts[pathParts.length - 1] || '')
    const sessionId = url.searchParams.get('sessionId') || `session-${Date.now()}-${Math.random()}`

    // Reject path-traversal attempts (e.g. /connect/../../server.js) and
    // empty / overly-long roomIds. Same charset rule as asset IDs.
    // Temp/quarantine file names are reserved.
    if (!isSafeId(roomId) || isTmpFile(roomId) || isCorruptFile(roomId)) {
        console.log(`Closing connection: invalid room id "${roomId}"`)
        ws.close(1008, 'Invalid room id')
        return
    }

    try {
        const room = await makeOrLoadRoom(roomId)
        
        // Add connection error handling
        ws.on('error', (error) => {
            console.error(`WebSocket error for room=${roomId}, session=${sessionId}:`, error)
        })
        
        // Periodic ping keeps the connection alive through proxies.
        const pingInterval = setInterval(() => {
            if (ws.readyState === ws.OPEN) {
                ws.ping()
            } else {
                clearInterval(pingInterval)
            }
        }, 30000)

        ws.on('close', (code, reason) => {
            clearInterval(pingInterval)
            console.log(`WebSocket closed: room=${roomId}, session=${sessionId}, code=${code}, reason=${reason}`)
        })
        
        // Handle the socket connection with TLDraw room
        console.log(`Connecting socket to TLDraw room: ${roomId}`)
        room.handleSocketConnect({ sessionId, socket: ws })
        console.log(`Socket connected successfully to room: ${roomId}`)
        
    } catch (error) {
        console.error('Error handling WebSocket connection:', error)
        ws.close(1011, 'Server error')
    }
})

server.listen(PORT, '0.0.0.0', () => {
    console.log(`TLDraw sync server running on port ${PORT}`)
    console.log(`WebSocket endpoint: ws://localhost:${PORT}/connect/<roomId>`)
    console.log(`HTTP endpoints: http://localhost:${PORT}/uploads/, /unfurl, /health`)

    const DAY = 24 * 60 * 60 * 1000
    console.log('Effective CLEANUP_CONFIG:', JSON.stringify({
        ...CLEANUP_CONFIG,
        roomRetentionDays: CLEANUP_CONFIG.ROOM_RETENTION_PERIOD / DAY,
        assetRetentionDays: CLEANUP_CONFIG.ASSET_RETENTION_PERIOD / DAY,
        cleanupIntervalHours: CLEANUP_CONFIG.CLEANUP_INTERVAL / (60 * 60 * 1000),
    }))
    if (CLEANUP_CONFIG.CLEANUP_ENABLED) {
        console.log(`Storage cleanup enabled: rooms after ${CLEANUP_CONFIG.ROOM_RETENTION_PERIOD / DAY} days (unless loaded), unreferenced assets after ${CLEANUP_CONFIG.ASSET_RETENTION_PERIOD / DAY} days`)
        setTimeout(performCleanup, 30000)
        setInterval(performCleanup, CLEANUP_CONFIG.CLEANUP_INTERVAL)
    } else {
        console.log('Storage cleanup is disabled')
    }
})

// Graceful shutdown — flush any rooms whose 500 ms debounce hasn't fired
// before exiting, otherwise docker stop loses the last edits.
let shuttingDown = false
async function shutdown(signal) {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`Received ${signal}, flushing rooms...`)
    const pending = []
    for (const state of rooms.values()) {
        // Skip in-flight loads (Promise entries) and missing state.
        if (!state || typeof state.then === 'function') continue
        if (state.needsPersist && typeof state.persistData === 'function') {
            pending.push(state.persistData())
        }
    }
    try {
        await Promise.all(pending)
    } catch (err) {
        console.error('Error flushing rooms on shutdown:', err)
    }
    console.log('Shutdown complete')
    process.exit(0)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
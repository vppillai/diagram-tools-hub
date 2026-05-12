import { TLSocketRoom } from '@tldraw/sync-core'
import { WebSocketServer } from 'ws'
import { createServer } from 'http'
import { readFile, writeFile, mkdir, readdir, stat, unlink, rename } from 'fs/promises'
import { join } from 'path'
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

// Reject SSRF targets — only http(s) URLs to a *public* host. Blocks
// loopback, RFC-1918 private ranges, link-local (incl. cloud IMDS at
// 169.254.169.254), and IPv6 equivalents. Does not resolve DNS so it
// can still be bypassed via a controlled hostname that resolves to a
// private IP — for v1.4 we accept that risk. Full mitigation needs a
// per-request DNS resolve + IP-range check.
function isPublicUrl(rawUrl) {
    let parsed
    try { parsed = new URL(rawUrl) } catch { return false }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    const host = parsed.hostname.toLowerCase()
    if (!host) return false
    if (host === 'localhost' || host === '0.0.0.0') return false
    if (host.startsWith('127.') || host.startsWith('10.') || host.startsWith('192.168.')) return false
    if (host.startsWith('169.254.')) return false
    if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(host)) return false
    if (host === '::1' || host.startsWith('[::1]')) return false
    if (host.startsWith('fc') || host.startsWith('fd')) return false  // ULA
    if (host.startsWith('fe80')) return false  // link-local v6
    return true
}

// Cleanup configuration
const CLEANUP_CONFIG = {
    // Room files older than this will be deleted (in milliseconds)
    ROOM_RETENTION_PERIOD: parseInt(process.env.ROOM_RETENTION_DAYS || '7') * 24 * 60 * 60 * 1000, // 7 days default
    // Asset files older than this will be deleted (in milliseconds)  
    ASSET_RETENTION_PERIOD: parseInt(process.env.ASSET_RETENTION_DAYS || '30') * 24 * 60 * 60 * 1000, // 30 days default
    // How often to run cleanup (in milliseconds)
    CLEANUP_INTERVAL: parseInt(process.env.CLEANUP_INTERVAL_HOURS || '6') * 60 * 60 * 1000, // 6 hours default
    // Enable/disable cleanup
    CLEANUP_ENABLED: process.env.CLEANUP_ENABLED !== 'false' // Enabled by default
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
            // Skip orphan tmp files left from a crashed atomic write —
            // they'll be cleaned on the next saveSnapshot rename.
            if (file.endsWith('.tmp')) continue

            const filePath = join(DIR, file)
            const stats = await stat(filePath).catch(() => null)
            if (!stats || (now - stats.mtime.getTime()) <= CLEANUP_CONFIG.ROOM_RETENTION_PERIOD) continue

            // Resolve a possible in-flight load promise before checking
            // closed/active state. Without this, a Promise entry in the
            // map would crash with `.room` undefined.
            let roomState = rooms.get(file)
            if (roomState && typeof roomState.then === 'function') {
                try { roomState = await roomState } catch { roomState = null }
            }
            if (!roomState || roomState.room.isClosed() || roomState.room.getNumActiveSessions() === 0) {
                await unlink(filePath)
                rooms.delete(file)
                cleaned++
                console.log(`Cleaned up old room: ${file}`)
            }
        }
        
        console.log(`Room cleanup completed: ${cleaned} rooms removed`)
    } catch (error) {
        console.error('Error during room cleanup:', error)
    }
}

async function cleanupOldAssets() {
    if (!CLEANUP_CONFIG.CLEANUP_ENABLED) return

    try {
        console.log('Starting asset cleanup...')
        const assetFiles = await readdir(ASSETS_DIR).catch(() => [])
        const now = Date.now()
        let cleaned = 0

        for (const file of assetFiles) {
            const filePath = join(ASSETS_DIR, file)
            const stats = await stat(filePath).catch(() => null)
            
            if (stats && (now - stats.mtime.getTime()) > CLEANUP_CONFIG.ASSET_RETENTION_PERIOD) {
                await unlink(filePath)
                cleaned++
                console.log(`Cleaned up old asset: ${file}`)
            }
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

async function readSnapshotIfExists(roomId) {
    try {
        const data = await readFile(join(DIR, roomId))
        return JSON.parse(data.toString()) ?? undefined
    } catch {
        return undefined
    }
}

async function saveSnapshot(roomId, snapshot) {
    await mkdir(DIR, { recursive: true })
    // Atomic write: a process kill between writeFile and full sync would
    // otherwise leave a truncated file, which JSON.parse rejects on the
    // next load — silently losing the whole room. POSIX rename is atomic.
    const finalPath = join(DIR, roomId)
    const tmpPath = `${finalPath}.tmp`
    await writeFile(tmpPath, JSON.stringify(snapshot))
    await rename(tmpPath, finalPath)
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
        const state = { needsPersist: false, id: roomId, room: null }

        const persistData = async () => {
            if (!state.needsPersist) return
            state.needsPersist = false
            try {
                const snapshot = state.room.getSnapshot()
                await saveSnapshot(roomId, snapshot)
            } catch (error) {
                console.error(`Failed to save snapshot for room ${roomId}:`, error)
            }
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
                if (saveTimeout) {
                    clearTimeout(saveTimeout)
                    // Final flush guarantees data committed before the
                    // map entry is dropped.
                    await persistData()
                }
                rooms.delete(roomId)
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

// Asset storage
async function storeAsset(id, buffer) {
    await mkdir(ASSETS_DIR, { recursive: true })
    await writeFile(join(ASSETS_DIR, id), buffer)
}

async function loadAsset(id) {
    try {
        return await readFile(join(ASSETS_DIR, id))
    } catch {
        return null
    }
}

// URL unfurling
async function unfurl(url) {
    try {
        const { title, description, open_graph, twitter_card, favicon } = await _unfurl.unfurl(url)
        const image = open_graph?.images?.[0]?.url || twitter_card?.images?.[0]?.url

        return {
            title: title || '',
            description: description || '',
            image: image || '',
            favicon: favicon || '',
        }
    } catch (error) {
        console.error('Unfurl error:', error)
        return {
            title: '',
            description: '',
            image: '',
            favicon: '',
        }
    }
}

// Create WebSocket server that handles upgrade requests manually
const wss = new WebSocketServer({ noServer: true })

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
                if (file.endsWith('.tldr')) {
                    const filePath = join(DIR, file)
                    const stat_result = await stat(filePath)
                    const roomName = file.replace('.tldr', '')
                    
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
            health.checks.storage = { status: 'healthy', details: 'Directories accessible' }
        } catch (error) {
            health.checks.storage = { status: 'error', details: error.message }
            health.status = 'unhealthy'
        }

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

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200)
        res.end()
        return
    }

    // Asset upload — size-limited, ID-validated, error-trapped.
    if (req.method === 'PUT' && url.pathname.startsWith('/uploads/')) {
        const id = decodeURIComponent(url.pathname.slice('/uploads/'.length))
        if (!isSafeId(id)) {
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
            try {
                await storeAsset(id, Buffer.concat(chunks))
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
        const id = decodeURIComponent(url.pathname.slice('/uploads/'.length))
        if (!isSafeId(id)) {
            res.writeHead(400); res.end('Invalid asset id'); return
        }
        const data = await loadAsset(id)
        if (data) {
            res.writeHead(200); res.end(data)
        } else {
            res.writeHead(404); res.end('Not found')
        }
        return
    }

    // Asset delete (called by client TLAssetStore.remove on shape deletion).
    // Idempotent — missing file is fine.
    if (req.method === 'DELETE' && url.pathname.startsWith('/uploads/')) {
        const id = decodeURIComponent(url.pathname.slice('/uploads/'.length))
        if (!isSafeId(id)) {
            res.writeHead(400); res.end('Invalid asset id'); return
        }
        try {
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
        if (!isPublicUrl(targetUrl)) {
            res.writeHead(400); res.end('URL must point to a public http(s) host'); return
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

    // Health check
    if (req.method === 'GET' && url.pathname === '/health') {
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
    const roomId = decodeURIComponent(pathParts[pathParts.length - 1] || '')
    const sessionId = url.searchParams.get('sessionId') || `session-${Date.now()}-${Math.random()}`

    // Reject path-traversal attempts (e.g. /connect/../../server.js) and
    // empty / overly-long roomIds. Same charset rule as asset IDs.
    if (!isSafeId(roomId)) {
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
        
        ws.on('close', (code, reason) => {
            console.log(`WebSocket closed: room=${roomId}, session=${sessionId}, code=${code}, reason=${reason}`)
        })
        
        ws.on('pong', () => {
            console.log(`Pong received from room=${roomId}, session=${sessionId}`)
        })
        
        // Set up periodic ping to keep connection alive
        const pingInterval = setInterval(() => {
            if (ws.readyState === ws.OPEN) {
                ws.ping()
                console.log(`Ping sent to room=${roomId}, session=${sessionId}`)
            } else {
                clearInterval(pingInterval)
            }
        }, 30000) // Ping every 30 seconds
        
        ws.on('close', () => {
            clearInterval(pingInterval)
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

    if (CLEANUP_CONFIG.CLEANUP_ENABLED) {
        console.log(`Storage cleanup enabled: rooms after ${process.env.ROOM_RETENTION_DAYS || '7'} days, assets after ${process.env.ASSET_RETENTION_DAYS || '30'} days`)
        console.log(`Cleanup will run every ${process.env.CLEANUP_INTERVAL_HOURS || '6'} hours`)
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
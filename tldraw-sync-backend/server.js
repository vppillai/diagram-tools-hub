import { TLSocketRoom } from '@tldraw/sync-core'
import { WebSocketServer } from 'ws'
import { createServer } from 'http'
import { readFile, writeFile, mkdir, readdir, stat, unlink } from 'fs/promises'
import { join } from 'path'
import _unfurl from 'unfurl.js'

const PORT = process.env.PORT || 3001
const DIR = './.rooms'
const ASSETS_DIR = './.assets'

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
            const filePath = join(DIR, file)
            const stats = await stat(filePath).catch(() => null)
            
            if (stats && (now - stats.mtime.getTime()) > CLEANUP_CONFIG.ROOM_RETENTION_PERIOD) {
                // Check if room is currently active
                const roomState = rooms.get(file)
                if (!roomState || roomState.room.isClosed() || roomState.room.getNumActiveSessions() === 0) {
                    await unlink(filePath)
                    rooms.delete(file) // Remove from memory
                    cleaned++
                    console.log(`Cleaned up old room: ${file}`)
                }
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
    await writeFile(join(DIR, roomId), JSON.stringify(snapshot))
}

async function makeOrLoadRoom(roomId) {
    if (rooms.has(roomId)) {
        const roomState = rooms.get(roomId)
        if (!roomState.room.isClosed()) {
            console.log(`Reusing existing room: ${roomId}`)
            return roomState.room
        }
    }
    
    console.log('Loading room:', roomId)
    const initialSnapshot = await readSnapshotIfExists(roomId)
    console.log(`Initial snapshot for room ${roomId}:`, initialSnapshot ? 'found' : 'not found')

    // Initialize persistence helpers first
    let saveTimeout = null
    const roomState = {
        needsPersist: false,
        id: roomId,
        room: null // Will be set below
    }
    
    const persistData = async () => {
        if (roomState.needsPersist) {
            roomState.needsPersist = false
            try {
                const snapshot = roomState.room.getSnapshot()
                await saveSnapshot(roomId, snapshot)
                console.log(`Room ${roomId} snapshot saved successfully`)
            } catch (error) {
                console.error(`Failed to save snapshot for room ${roomId}:`, error)
            }
        }
    }

    // Create the room with proper callbacks
    roomState.room = new TLSocketRoom({
        initialSnapshot,
        onSessionRemoved(room, args) {
            console.log('Client disconnected:', args.sessionId, roomId)
            // Don't close room immediately - keep it alive for reconnections
            console.log(`Room ${roomId} has ${args.numSessionsRemaining} sessions remaining`)
            
            // Only close room after a delay to allow for reconnections
            if (args.numSessionsRemaining === 0) {
                setTimeout(() => {
                    if (room.getNumActiveSessions() === 0) {
                        console.log('Closing room after timeout:', roomId)
                        room.close()
                    }
                }, 30000) // 30 second grace period
            }
        },
        onDataChange() {
            console.log(`Data changed in room ${roomId}, saving immediately`)
            roomState.needsPersist = true
            
            // Debounce saves to avoid too many writes
            if (saveTimeout) clearTimeout(saveTimeout)
            saveTimeout = setTimeout(persistData, 500) // Save after 500ms of inactivity
        },
    })
    
    rooms.set(roomId, roomState)

    
    // Persist room data periodically as backup
    const persistInterval = setInterval(async () => {
        if (roomState.needsPersist) {
            await persistData()
        }
        if (roomState.room.isClosed()) {
            console.log(`Room ${roomId} is closed, cleaning up`)
            clearInterval(persistInterval)
            if (saveTimeout) clearTimeout(saveTimeout)
            rooms.delete(roomId)
        }
    }, 5000) // Check every 5 seconds

    return roomState.room
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

        // Check memory usage (warn if over 80% of heap used)
        const memUsage = process.memoryUsage()
        const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100
        if (heapUsedPercent > 80) {
            health.checks.memory.status = 'warning'
            health.checks.memory.warning = `High memory usage: ${heapUsedPercent.toFixed(1)}%`
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
    
    // Debug logging
    console.log(`HTTP Request: ${req.method} ${req.url}`)
    console.log('Headers:', JSON.stringify(req.headers, null, 2))
    
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200)
        res.end()
        return
    }

    // Asset upload
    if (req.method === 'PUT' && url.pathname.startsWith('/uploads/')) {
        const id = decodeURIComponent(url.pathname.slice('/uploads/'.length))
        const chunks = []
        
        req.on('data', chunk => chunks.push(chunk))
        req.on('end', async () => {
            const buffer = Buffer.concat(chunks)
            await storeAsset(id, buffer)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true }))
        })
        return
    }

    // Asset download
    if (req.method === 'GET' && url.pathname.startsWith('/uploads/')) {
        const id = decodeURIComponent(url.pathname.slice('/uploads/'.length))
        const data = await loadAsset(id)
        
        if (data) {
            res.writeHead(200)
            res.end(data)
        } else {
            res.writeHead(404)
            res.end('Not found')
        }
        return
    }

    // URL unfurling
    if (req.method === 'GET' && url.pathname === '/unfurl') {
        const targetUrl = url.searchParams.get('url')
        if (targetUrl) {
            const result = await unfurl(targetUrl)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(result))
        } else {
            res.writeHead(400)
            res.end('Missing url parameter')
        }
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

// Handle WebSocket upgrade requests
server.on('upgrade', (request, socket, head) => {
    console.log(`WebSocket upgrade request: ${request.url}`)
    console.log('Upgrade headers:', JSON.stringify(request.headers, null, 2))
    
    // Check if this is a connect request
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
    const roomId = pathParts[pathParts.length - 1] // Last part of the path
    const sessionId = url.searchParams.get('sessionId') || `session-${Date.now()}-${Math.random()}`
    
    console.log(`WebSocket connection established: ${req.url}`)
    console.log(`Parsed: room=${roomId}, session=${sessionId}`)
    
    if (!roomId) {
        console.log(`Closing connection: Missing room ID`)
        ws.close(1008, 'Missing room ID')
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
    
    // Start cleanup scheduler if enabled
    if (CLEANUP_CONFIG.CLEANUP_ENABLED) {
        console.log(`Storage cleanup enabled: rooms after ${process.env.ROOM_RETENTION_DAYS || '7'} days, assets after ${process.env.ASSET_RETENTION_DAYS || '30'} days`)
        console.log(`Cleanup will run every ${process.env.CLEANUP_INTERVAL_HOURS || '6'} hours`)
        
        // Run initial cleanup after startup
        setTimeout(performCleanup, 30000) // Wait 30 seconds after startup
        
        // Schedule periodic cleanup
        setInterval(performCleanup, CLEANUP_CONFIG.CLEANUP_INTERVAL)
    } else {
        console.log('Storage cleanup is disabled')
    }
})
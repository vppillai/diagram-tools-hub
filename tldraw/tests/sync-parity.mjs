// Real client <-> server round-trip between the FRONTEND's resolved
// @tldraw/sync-core (tldraw/node_modules) and a running tldraw-sync-backend.
// Catches the class of bug where the two sides drift (protocol/schema
// mismatch, or a server API like getCurrentSnapshot disappearing) that a
// build alone cannot see.
//
// Usage: start the backend (cd tldraw-sync-backend && PORT=3901 node server.js),
// then from tldraw/: node tests/sync-parity.mjs
//   SYNC_URL   ws base, default ws://127.0.0.1:3901
//   ROOMS_DIR  backend rooms dir, default ../tldraw-sync-backend/.rooms
//   ROOM_ID    room to use, default parity-<timestamp>
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Browser globals sync-core touches (ReconnectManager listens on window and
// document; the FPS throttle uses requestAnimationFrame).
globalThis.window ??= Object.assign(new EventTarget(), { location: { href: 'http://localhost/' }, devicePixelRatio: 1 })
globalThis.document ??= Object.assign(new EventTarget(), { hidden: false })
globalThis.requestAnimationFrame ??= (cb) => setTimeout(() => cb(Date.now()), 16)
globalThis.cancelAnimationFrame ??= (id) => clearTimeout(id)

const { TLSyncClient, ClientWebSocketAdapter } = await import('@tldraw/sync-core')
const { Store } = await import('@tldraw/store')
const { createTLSchema, PageRecordType } = await import('@tldraw/tlschema')
const { atom } = await import('@tldraw/state')

const here = dirname(fileURLToPath(import.meta.url))
const SYNC_URL = process.env.SYNC_URL || 'ws://127.0.0.1:3901'
const ROOMS_DIR = process.env.ROOMS_DIR || join(here, '..', '..', 'tldraw-sync-backend', '.rooms')
const ROOM_ID = process.env.ROOM_ID || `parity-${Date.now()}`
const TIMEOUT_MS = 20000

const fail = (msg) => { console.error(`FAIL: ${msg}`); process.exit(1) }
setTimeout(() => fail(`timed out after ${TIMEOUT_MS / 1000}s (room ${ROOM_ID} never persisted the page)`), TIMEOUT_MS).unref()

const store = new Store({
    schema: createTLSchema(),
    props: { defaultName: '', assets: { upload: async () => ({ src: '' }), resolve: (a) => a.props.src }, onMount: () => {} },
})
const pageId = PageRecordType.createId(`parity-${Math.random().toString(36).slice(2)}`)
const socket = new ClientWebSocketAdapter(() => `${SYNC_URL}/connect/${ROOM_ID}?sessionId=parity-${Date.now()}`)

let client
client = new TLSyncClient({
    store,
    socket,
    presence: atom('presence', null),
    onLoad() {
        store.put([PageRecordType.create({ id: pageId, name: 'Parity check', index: 'a9' })])
        pollForPersist()
    },
    onSyncError(reason) { fail(`onSyncError: ${reason}`) },
})

async function pollForPersist() {
    const file = join(ROOMS_DIR, ROOM_ID)
    for (;;) {
        const text = await readFile(file, 'utf8').catch(() => '')
        if (text.includes(pageId)) {
            console.log(`OK: room ${ROOM_ID} round-tripped and persisted ${pageId} to ${file}`)
            client.close()
            socket.close()
            process.exit(0)
        }
        await new Promise((r) => setTimeout(r, 250))
    }
}

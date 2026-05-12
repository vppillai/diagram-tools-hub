import React from 'react'
import ReactDOM from 'react-dom/client'
import { useSync } from '@tldraw/sync'
import {
    AssetRecordType,
    atom,
    computed,
    createUserId,
    DefaultColorStyle,
    DefaultFontStyle,
    DefaultSizeStyle,
    defaultShapeUtils,
    createTLStore,
    getDefaultUserPresence,
    getHashForString,
    getSnapshot,
    loadSnapshot,
    Tldraw,
    TldrawUiIcon,
    TldrawUiMenuGroup,
    TldrawUiMenuItem,
    TldrawUiMenuSubmenu,
    UserRecordType,
    uniqueId,
    useEditor,
    useTldrawCurrentUser,
    DefaultContextMenu,
    DefaultContextMenuContent,
    GeoShapeGeoStyle,
} from 'tldraw'
import 'tldraw/tldraw.css'

// Get the current protocol and host
const getBaseUrl = () => {
    const protocol = window.location.protocol
    const host = window.location.host
    return `${protocol}//${host}`
}

// Get WebSocket URL
const getWebSocketUrl = (roomId) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const wsUrl = `${protocol}//${host}/tldraw-sync/connect/${roomId}`
    return wsUrl
}

// Generate room ID from URL path, return null if no room specified
const getRoomId = () => {
    const path = window.location.pathname
    
    // Extract room name from /tldraw/room-name pattern
    const pathParts = path.split('/')
    const tldrawIndex = pathParts.indexOf('tldraw')
    
    if (tldrawIndex !== -1 && pathParts.length > tldrawIndex + 1) {
        const roomId = pathParts[tldrawIndex + 1]
        if (roomId && roomId.trim() && roomId !== '') {
            return roomId
        }
    }
    
    return null
}

// Asset store implementation (TLAssetStore).
// v5: upload returns { src, meta? }, not bare URL.
// v5: optional remove(assetIds) fires when shapes referencing the asset are
// deleted. We look up each asset in the editor store, pull its URL, and call
// DELETE on the upload endpoint. Event-driven cleanup augments the server's
// periodic sweep.
const multiplayerAssets = {
    async upload(_asset, file) {
        const id = uniqueId()
        const objectName = `${id}-${file.name}`
        const url = `${getBaseUrl()}/tldraw-sync/uploads/${encodeURIComponent(objectName)}`

        try {
            const response = await fetch(url, {
                method: 'PUT',
                body: file,
            })

            if (!response.ok) {
                throw new Error(`Failed to upload asset: ${response.statusText}`)
            }

            return { src: url }
        } catch (error) {
            console.error('Asset upload failed:', error)
            throw error
        }
    },
    resolve(asset) {
        return asset.props.src
    },
    // v5 TLAssetStore.remove — fired when shapes are deleted. Best-effort
    // cleanup: looks up each asset in the live editor store, extracts the
    // upload URL, and fires DELETE. Failures are logged, not surfaced —
    // the server's periodic cleanup catches anything missed.
    async remove(assetIds) {
        const editor = typeof window !== 'undefined' ? window.editor : null
        if (!editor) return
        for (const id of assetIds) {
            try {
                const asset = editor.store.get(id)
                const src = asset?.props?.src
                if (src && src.includes('/tldraw-sync/uploads/')) {
                    fetch(src, { method: 'DELETE' }).catch((err) => {
                        console.warn(`Asset cleanup DELETE failed for ${id}:`, err)
                    })
                }
            } catch (err) {
                console.warn(`Asset cleanup lookup failed for ${id}:`, err)
            }
        }
    },
}

// Custom right-click context menu — visual quick-pick. Pattern mirrors
// vppillai/whiteboard's right-click: color swatches as a 4×3 grid at the
// TOP of the menu (the most-frequent action), tool pills directly below
// (Draw / Eraser / Select), then a "More tools…" submenu for the long-tail
// tools, then tldraw's default cut/copy/paste/delete items.
//
// Pen-on-Intuos workflow: side-button right-click → tap a swatch or pill →
// done. Replaces "go to the corner of the toolbar" with "tap at cursor".
//
// 12 most-used colors are surfaced as visual swatches (4×3 grid); the 13th
// (white) stays available via tldraw's standard style panel — drawing white
// on a white canvas isn't a primary use case.

// 12 most-used colors as a 4×3 grid. Order matters: black sits in the last
// cell because tldraw's default canvas background is white *but* dark theme
// flips it, and "black-first" creates a visually-confusing dark spot in the
// top-left swatch position. Reds and warm colors lead; black is the
// fall-back not the headline.
const QUICK_COLORS_12 = [
    'grey',
    'light-violet',
    'violet',
    'blue',
    'light-blue',
    'yellow',
    'orange',
    'red',
    'light-red',
    'green',
    'light-green',
    'black',
]

// Approximations of tldraw's default palette. Used purely to render the
// visual swatch; the *actual* stored shape color is the tldraw name token
// (set via setStyleForNextShapes) and is theme-aware at render time.
const QUICK_COLOR_HEX = {
    'black': '#1d1d1d',
    'grey': '#9ea6b0',
    'light-violet': '#e085f4',
    'violet': '#ae3ec9',
    'blue': '#4263eb',
    'light-blue': '#4dabf7',
    'yellow': '#f1ac4b',
    'orange': '#f76707',
    'green': '#41a755',
    'light-green': '#4cb05e',
    'light-red': '#f87171',
    'red': '#e03131',
}

// Tool grid — all 9 quick-pick tools share one visual treatment (icon-only
// squares in a 3x3 grid). Matches tldraw's own toolbar idiom and the
// swatch grid above. Less-frequent tools (highlighter, note, frame, hand)
// remain in the "More tools" submenu below.
//
// Layout convention: most-used 3 in the top row, drawing/text in the
// middle row, board/geo at the bottom. Tooltips via `title` carry the
// label for keyboard / discovery / accessibility users.
const QUICK_TOOLS_9 = [
    { id: 'draw',          icon: 'tool-pencil',    label: 'Draw' },
    { id: 'eraser',        icon: 'tool-eraser',    label: 'Erase' },
    // Select uses the pointer icon (mouse cursor) in tldraw v5 — there's no
    // 'tool-select'; that name renders as a placeholder question mark.
    { id: 'select',        icon: 'tool-pointer',   label: 'Select' },
    { id: 'text',          icon: 'tool-text',      label: 'Text' },
    { id: 'arrow',         icon: 'tool-arrow',     label: 'Arrow' },
    { id: 'line',          icon: 'tool-line',      label: 'Line' },
    { id: 'laser',         icon: 'tool-laser',     label: 'Laser pointer' },
    { id: 'geo:rectangle', icon: 'geo-rectangle',  label: 'Rectangle' },
    { id: 'geo:ellipse',   icon: 'geo-ellipse',    label: 'Ellipse' },
]

// Stylesheet for the quick-pick panel — injected once into <head> on first
// component mount, NOT rendered inline inside the menu. Why: a <style> tag
// inline inside Radix's ContextMenu.Portal counts as a non-menu child of
// the menu wrapper, which seems to confuse tldraw's child-shape heuristics
// and the menu wrapper's vertical layout (DefaultContextMenuContent items
// end up below the fold or omitted on first render). Hoisting to <head>
// makes the menu's children purely TldrawUiMenuGroup-shaped.
//
// Sizes are deliberately compact so the whole panel takes ~140 px of
// vertical space — leaves room for tldraw's ~12 default items below
// before any menu clipping kicks in.
const QUICKPICK_STYLE_ID = 'qp-quickpick-css'
const QUICKPICK_CSS = `
.qp-root {
    padding: 6px;
    min-width: 200px;
}
.qp-swatches {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    margin-bottom: 6px;
}
.qp-swatch {
    aspect-ratio: 1 / 1;
    width: 100%;
    border-radius: 50%;
    border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
    cursor: pointer;
    padding: 0;
    transition: transform 0.08s ease-out;
}
.qp-swatch:hover {
    transform: scale(1.12);
}
.qp-swatch:focus-visible {
    outline: 2px solid var(--color-selected, #3b82f6);
    outline-offset: 2px;
}

/* Tool grid: 9 icon-only squares in a 3x3 layout. Matches the swatch
   grid's symmetry and tldraw's own toolbar idiom. Tooltips carry labels. */
.qp-tools {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 3px;
}
.qp-tool {
    appearance: none;
    aspect-ratio: 1 / 1;
    padding: 0;
    border-radius: 6px;
    border: 1px solid transparent;
    background: color-mix(in srgb, currentColor 6%, transparent);
    color: inherit;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 0.08s ease-out, border-color 0.08s ease-out;
}
.qp-tool:hover {
    background: color-mix(in srgb, currentColor 12%, transparent);
    border-color: color-mix(in srgb, currentColor 10%, transparent);
}
.qp-tool:active {
    background: color-mix(in srgb, currentColor 18%, transparent);
}
.qp-tool:focus-visible {
    outline: 2px solid var(--color-selected, #3b82f6);
    outline-offset: 1px;
}
.qp-tool .tlui-icon,
.qp-tool svg {
    width: 16px;
    height: 16px;
    color: inherit;
    fill: currentColor;
}
`

// Inject the quickpick CSS into <head> exactly once. Idempotent across
// component re-renders, across multiple Tldraw instances on the page, and
// across StrictMode double-invocation.
function useInjectQuickpickCSS() {
    React.useEffect(() => {
        if (typeof document === 'undefined') return
        if (document.getElementById(QUICKPICK_STYLE_ID)) return
        const style = document.createElement('style')
        style.id = QUICKPICK_STYLE_ID
        style.textContent = QUICKPICK_CSS
        document.head.appendChild(style)
    }, [])
}

function QuickPickContextMenu(props) {
    const editor = useEditor()
    useInjectQuickpickCSS()

    // Plain <button> elements aren't Radix menu items, so they don't auto-close
    // the context menu on click. Radix listens for Escape to close — dispatch
    // a keydown to body so the menu collapses after a quick-pick action.
    const closeMenu = React.useCallback(() => {
        try {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        } catch {
            // Some test runners (jsdom) reject KeyboardEvent construction; ignore.
        }
    }, [])

    // The Escape keydown dispatched by closeMenu() is seen by both Radix
    // (closes the menu — what we want) AND tldraw's document-level key
    // handler (which can cancel the current tool back to 'select' — what
    // we don't want). For color picks the user expects the current tool
    // to persist; for tool picks the user expects the just-selected tool
    // to persist. Both wrap a save-and-restore around closeMenu so the
    // Escape side-effect doesn't leak.
    //
    // queueMicrotask runs after the synchronous Escape handlers complete
    // but before the next paint, so the restore happens in the same frame.
    const restoreToolIfChanged = React.useCallback(
        (expectedTool, info) => {
            queueMicrotask(() => {
                try {
                    if (editor.getCurrentToolId() !== expectedTool) {
                        editor.setCurrentTool(expectedTool, info)
                    }
                } catch (err) {
                    console.warn('Failed to restore tool after menu close:', err)
                }
            })
        },
        [editor]
    )

    const pickColor = React.useCallback(
        (color) => {
            const toolBefore = editor.getCurrentToolId()
            editor.setStyleForNextShapes(DefaultColorStyle, color)
            closeMenu()
            restoreToolIfChanged(toolBefore)
        },
        [editor, closeMenu, restoreToolIfChanged]
    )

    const pickTool = React.useCallback(
        (tool, info) => {
            editor.setCurrentTool(tool, info)
            closeMenu()
            restoreToolIfChanged(tool, info)
        },
        [editor, closeMenu, restoreToolIfChanged]
    )

    // Tool ids prefixed 'geo:' map to geo-shape variants. The geo tool's
    // second-arg `info` ({ geo: '...' }) is NOT respected in v5 — the tool
    // reads its variant from the GeoShapeGeoStyle style prop instead. So
    // we set the style FIRST, then activate the tool. This is the same
    // pattern used for color (setStyleForNextShapes + setCurrentTool).
    //
    // Bug repro before this fix: with bottom toolbar set to 'heart', both
    // Rectangle and Ellipse buttons drew hearts — because only the tool
    // was being switched, not the variant.
    const dispatchTool = React.useCallback(
        (id) => {
            if (id.startsWith('geo:')) {
                const variant = id.slice(4)
                try {
                    editor.setStyleForNextShapes(GeoShapeGeoStyle, variant)
                } catch (err) {
                    console.warn(`Failed to set geo variant ${variant}:`, err)
                }
                pickTool('geo')
            } else {
                pickTool(id)
            }
        },
        [editor, pickTool]
    )

    return (
        <DefaultContextMenu {...props}>
            {/* Custom panel wrapped in TldrawUiMenuGroup so the menu wrapper's
                child-shape expectation (only menu primitives) is satisfied.
                CSS is injected into <head> separately (see
                useInjectQuickpickCSS above) — keeping it out of the menu's
                child tree avoids any layout / hoisting weirdness with
                inline <style> inside Radix portals. */}
            <TldrawUiMenuGroup id="qp-quick">
                <div className="qp-root">
                    <div className="qp-swatches" role="group" aria-label="Quick colors">
                        {QUICK_COLORS_12.map((color) => (
                            <button
                                key={color}
                                type="button"
                                className="qp-swatch"
                                style={{ background: QUICK_COLOR_HEX[color] }}
                                title={color}
                                aria-label={`Color ${color}`}
                                onClick={() => pickColor(color)}
                            />
                        ))}
                    </div>
                    <div className="qp-tools" role="group" aria-label="Quick tools">
                        {QUICK_TOOLS_9.map((tool) => (
                            <button
                                key={tool.id}
                                type="button"
                                className="qp-tool"
                                title={tool.label}
                                aria-label={tool.label}
                                onClick={() => dispatchTool(tool.id)}
                            >
                                <TldrawUiIcon icon={tool.icon} />
                            </button>
                        ))}
                    </div>
                </div>
            </TldrawUiMenuGroup>
            <TldrawUiMenuGroup id="qp-more">
                <TldrawUiMenuSubmenu id="qp-more-tools" label="More tools">
                    <TldrawUiMenuItem
                        id="qp-tool-highlight"
                        label="Highlighter"
                        icon="tool-highlight"
                        readonlyOk
                        onSelect={() => editor.setCurrentTool('highlight')}
                    />
                    <TldrawUiMenuItem
                        id="qp-tool-note"
                        label="Sticky note"
                        icon="tool-note"
                        readonlyOk
                        onSelect={() => editor.setCurrentTool('note')}
                    />
                    <TldrawUiMenuItem
                        id="qp-tool-frame"
                        label="Frame"
                        icon="tool-frame"
                        readonlyOk
                        onSelect={() => editor.setCurrentTool('frame')}
                    />
                    <TldrawUiMenuItem
                        id="qp-tool-hand"
                        label="Hand (pan)"
                        icon="tool-hand"
                        readonlyOk
                        onSelect={() => editor.setCurrentTool('hand')}
                    />
                </TldrawUiMenuSubmenu>
            </TldrawUiMenuGroup>
            <DefaultContextMenuContent />
        </DefaultContextMenu>
    )
}

const TLDRAW_COMPONENTS = { ContextMenu: QuickPickContextMenu }

// Number-key shortcuts mapped to valid v5 DefaultColorStyle tokens.
// '8' was 'indigo' before — that isn't a real tldraw token, so the keypress
// silently no-op'd; 'light-violet' is the closest valid value.
const COLOR_HOTKEYS = {
    '1': 'black',
    '2': 'grey',
    '3': 'green',
    '4': 'yellow',
    '5': 'red',
    '6': 'blue',
    '7': 'orange',
    '8': 'light-violet',
    '9': 'violet',
}

// Sync status → status-pill emoji. Field is `store.status` (v5), not the
// legacy `store.connectionStatus` which doesn't exist on the sync store.
const SYNC_STATUS_BADGE = {
    'synced-remote': '🟢',
    'synced-local': '🟡',
    'error': '🔴',
    'loading': '⚪',
    'not-connected': '⚪',
}

// Style preferences management
const STYLE_PREFS_KEY = 'tldraw-style-preferences'

function getStylePreferences() {
    try {
        const saved = localStorage.getItem(STYLE_PREFS_KEY)
        return saved ? JSON.parse(saved) : {}
    } catch (e) {
        return {}
    }
}

function saveStylePreference(toolId, styleProp, value) {
    try {
        const prefs = getStylePreferences()
        if (!prefs[toolId]) prefs[toolId] = {}
        prefs[toolId][styleProp] = value
        localStorage.setItem(STYLE_PREFS_KEY, JSON.stringify(prefs))
    } catch (e) {
        console.warn('Failed to save style preference:', e)
    }
}

const STORAGE_KEY_LOCAL = 'tldraw-local-document'

// Common editor wiring shared by SyncTldraw and LocalTldraw. Replaces ~140
// lines of duplicated onMount body that had drifted between the two — fixes
// already happened in one copy but not the other (e.g. the LocalTldraw
// store.listen leak). Returns a cleanup that releases all timers / listeners.
//
// Replaces three v1.3 anti-patterns:
//   - 100 ms setInterval polling for tool changes → sideEffects handler
//   - 60-line `findColorButton` DOM-scrape on every color hotkey → direct
//     editor.setStyleForNextShapes call
//   - Each call to `applyToolPreferences` reads style prefs fresh, so manual
//     changes via the style panel are picked up without remount.
function setupCanvasDefaults(editor) {
    if (typeof window !== 'undefined') {
        window.editor = editor
    }

    // Pen-first canvas: draw is the default; selection is secondary.
    editor.setCurrentTool('draw')

    // Tool stays locked across shape/text creation — without this tldraw
    // auto-reverts to 'select' after each commit. The tldraw toolbar pin
    // can still toggle this off mid-session.
    try {
        editor.updateInstanceState({ isToolLocked: true })
    } catch (err) {
        console.warn('Failed to set isToolLocked:', err)
    }

    try {
        editor.setOpacityForNextShapes?.(1)
    } catch {
        // older/future versions may not have this method.
    }

    // Camera isn't synchronously ready on first mount in some sync paths,
    // so the 75% zoom is deferred a frame. Cleanup clears the timer.
    const zoomTimer = setTimeout(() => {
        try {
            const camera = editor.getCamera()
            editor.setCamera({ ...camera, z: 0.75 })
        } catch {
            // Camera replaced by sync handoff; safe to ignore.
        }
    }, 100)

    const applyToolPreferences = (toolId) => {
        const prefs = getStylePreferences()[toolId]
        if (toolId === 'draw' || toolId === 'highlight') {
            const size = prefs?.size ?? 's'
            editor.setStyleForNextShapes(DefaultSizeStyle, size)
            if (!prefs?.size) saveStylePreference(toolId, 'size', size)
        }
        if (toolId === 'text' || toolId === 'note') {
            const font = prefs?.font ?? 'mono'
            editor.setStyleForNextShapes(DefaultFontStyle, font)
            if (!prefs?.font) saveStylePreference(toolId, 'font', font)
        }
    }
    applyToolPreferences(editor.getCurrentToolId())

    // Reactive tool/style tracking — replaces the v1.3 100 ms setInterval.
    let lastTool = editor.getCurrentToolId()
    const removeInstanceHandler = editor.sideEffects.registerAfterChangeHandler(
        'instance',
        (_prev, next) => {
            if (next.currentToolId !== lastTool) {
                lastTool = next.currentToolId
                applyToolPreferences(lastTool)
            }
            const styles = next.stylesForNextShape || {}
            if (lastTool === 'draw' || lastTool === 'highlight') {
                const size = styles[DefaultSizeStyle.id]
                if (size) saveStylePreference(lastTool, 'size', size)
            }
            if (lastTool === 'text' || lastTool === 'note') {
                const font = styles[DefaultFontStyle.id]
                if (font) saveStylePreference(lastTool, 'font', font)
            }
        },
    )

    // 1-9 → next-shape color. Direct API call — no DOM scraping.
    const handleKeydown = (e) => {
        if (
            e.target.tagName === 'INPUT' ||
            e.target.tagName === 'TEXTAREA' ||
            e.target.isContentEditable ||
            e.ctrlKey || e.metaKey || e.altKey
        ) {
            return
        }
        const color = COLOR_HOTKEYS[e.key]
        if (!color) return
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        try {
            editor.setStyleForNextShapes(DefaultColorStyle, color)
        } catch (err) {
            console.warn('Failed to apply color hotkey:', err)
        }
    }
    document.addEventListener('keydown', handleKeydown, true)

    return () => {
        clearTimeout(zoomTimer)
        removeInstanceHandler()
        document.removeEventListener('keydown', handleKeydown, true)
    }
}

// URL unfurling for bookmarks
async function unfurlBookmarkUrl({ url }) {
    const asset = {
        id: AssetRecordType.createId(getHashForString(url)),
        typeName: 'asset',
        type: 'bookmark',
        meta: {},
        props: {
            src: url,
            description: '',
            image: '',
            favicon: '',
            title: '',
        },
    }

    try {
        const response = await fetch(`${getBaseUrl()}/tldraw-sync/unfurl?${new URLSearchParams({ url })}`)
        if (response.ok) {
            const data = await response.json()
            asset.props.description = data?.description || ''
            asset.props.image = data?.image || ''
            asset.props.favicon = data?.favicon || ''
            asset.props.title = data?.title || ''
        }
    } catch (error) {
        console.error(`Failed to unfurl URL ${url}:`, error)
    }

    return asset
}

export default function App() {
    const roomId = getRoomId()
    return (
        <div style={{ position: 'fixed', inset: 0 }}>
            {roomId ? <SyncTldraw roomId={roomId} /> : <LocalTldraw />}
        </div>
    )
}

// Component for sync-enabled TLDraw
function SyncTldraw({ roomId }) {
    // Simple tab visibility tracking only
    const [isTabActive, setIsTabActive] = React.useState(!document.hidden)
    
    // Generate consistent user preferences for this session
    const [userPreferences, setUserPreferences] = React.useState(() => {
        // Try to get existing user data from localStorage (room-specific if in a room)
        const storageKey = roomId ? `tldraw-user-preferences-${roomId}` : 'tldraw-user-preferences'
        const stored = localStorage.getItem(storageKey)
        if (stored) {
            try {
                return JSON.parse(stored)
            } catch (e) {
                // Failed to parse stored preferences, will generate new ones
            }
        }
        
        // Generate new user preferences with unique name generation
        const colors = ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet', 'pink', 'grey']
        const baseNames = ['Superman', 'Batman', 'Wonder Woman', 'Spider-Man', 'Iron Man', 'Captain America', 'Thor', 'Hulk', 'Flash', 'Aquaman', 'Joker', 'Lex Luthor', 'Magneto', 'Loki', 'Green Goblin', 'Venom', 'Thanos', 'Ultron', 'Harley Quinn', 'Catwoman']
        
        // Generate a consistent user ID
        const userId = 'user-' + Math.random().toString(36).substring(2, 11)
        
        // Use a simple hash of the user ID to determine color and name indices
        const hashCode = (str) => {
            let hash = 0
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i)
                hash = ((hash << 5) - hash) + char
                hash = hash & hash // Convert to 32-bit integer
            }
            return Math.abs(hash)
        }
        
        const userHash = hashCode(userId)
        
        // Generate unique name by checking existing names in localStorage
        const generateUniqueName = () => {
            const baseNameIndex = userHash % baseNames.length
            const baseName = baseNames[baseNameIndex]
            
            // Get all existing user preferences from localStorage to avoid collisions
            const existingNames = new Set()
            
            // Check localStorage for other user names in this room
            const roomPrefix = roomId ? `tldraw-user-preferences-${roomId}` : 'tldraw-user-preferences'
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i)
                if (key && key.startsWith(roomPrefix)) {
                    try {
                        const prefs = JSON.parse(localStorage.getItem(key))
                        if (prefs && prefs.name) {
                            existingNames.add(prefs.name)
                        }
                    } catch (e) {
                        // Ignore invalid entries
                    }
                }
            }
            
            // Also add some randomness to the base selection to spread out name collisions
            const fallbackIndex = (userHash + Date.now()) % baseNames.length
            const fallbackName = baseNames[fallbackIndex]
            
            // Try base name first
            if (!existingNames.has(baseName)) {
                return baseName
            }
            
            // Try fallback name if different from base name
            if (fallbackName !== baseName && !existingNames.has(fallbackName)) {
                return fallbackName
            }
            
            // Try numbered variations of the base name
            for (let i = 2; i <= 20; i++) {
                const numberedName = `${baseName} ${i}`
                if (!existingNames.has(numberedName)) {
                    return numberedName
                }
            }
            
            // Try numbered variations of the fallback name
            for (let i = 2; i <= 20; i++) {
                const numberedName = `${fallbackName} ${i}`
                if (!existingNames.has(numberedName)) {
                    return numberedName
                }
            }
            
            // Final fallback to timestamp-based unique name
            const timestamp = Date.now().toString().slice(-4)
            return `${baseName} ${timestamp}`
        }
        
        return {
            id: userId,
            name: generateUniqueName(),
            color: colors[userHash % colors.length],
            colorScheme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        }
    })

    // Save user preferences to localStorage when they change (room-specific)
    React.useEffect(() => {
        const storageKey = roomId ? `tldraw-user-preferences-${roomId}` : 'tldraw-user-preferences'
        localStorage.setItem(storageKey, JSON.stringify(userPreferences))
    }, [userPreferences, roomId])
    
    // Handle tab visibility changes only
    React.useEffect(() => {
        const handleVisibilityChange = () => {
            setIsTabActive(!document.hidden)
        }
        
        document.addEventListener('visibilitychange', handleVisibilityChange)
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    }, [])
    
    // No complex activity tracking - keep it simple

    // Create sync store. tldraw v5: `userInfo` and `pingUrl` are gone.
    // Identity for presence/attribution comes from `users` (a TLUserStore).
    const wsUrl = getWebSocketUrl(roomId)

    // Bridge React userPreferences state into a tldraw reactive atom so the
    // TLUserStore's `currentUser` signal recomputes when name/color change.
    const prefsAtom = React.useRef(atom('userPrefs', userPreferences)).current
    React.useEffect(() => { prefsAtom.set(userPreferences) }, [prefsAtom, userPreferences])

    const users = React.useMemo(() => ({
        currentUser: computed('currentUser', () => {
            const p = prefsAtom.get()
            return UserRecordType.create({
                id: createUserId(p.id),
                name: p.name ?? '',
                color: p.color ?? undefined,
            })
        }),
    }), [prefsAtom])

    // Bridge isTabActive React state into a ref so getUserPresence below can
    // read the current value without re-rendering useSync on every flip.
    const isTabActiveRef = React.useRef(isTabActive)
    React.useEffect(() => { isTabActiveRef.current = isTabActive }, [isTabActive])

    const store = useSync({
        uri: wsUrl,
        assets: multiplayerAssets,
        users,
        // v5: restores the isTabActive peer broadcast that v2's userInfo carried.
        // Spreads the default presence (cursor, color, name) and adds isTabActive
        // in meta so peers can render a "💤" indicator on idle tabs.
        getUserPresence: (s, u) => {
            const base = getDefaultUserPresence(s, u)
            if (!base) return null
            return {
                ...base,
                meta: { ...(base.meta ?? {}), isTabActive: isTabActiveRef.current },
            }
        },
    })

    // Debounced name update — coalesces per-character edits to one state
    // update after 800 ms of inactivity. useMemo+empty deps captures
    // `timeoutId` in one stable closure; setUserPreferences is React-stable
    // so no deps are needed. (Was useCallback(useMemo()) — recreated the
    // closure on every render, so the debounce never actually debounced.)
    const debouncedNameUpdate = React.useMemo(() => {
        let timeoutId
        return (newName) => {
            clearTimeout(timeoutId)
            timeoutId = setTimeout(() => {
                setUserPreferences(prev => ({ ...prev, name: newName }))
            }, 800)
        }
    }, [])
    
    // Create user object for Tldraw component with simple debounced name updates.
    // v5: useTldrawUser was removed; useTldrawCurrentUser takes the same shape
    // and returns a TLCurrentUser to pass via the <Tldraw user={...}> prop.
    const user = useTldrawCurrentUser({
        userPreferences,
        setUserPreferences: (update) => {
            if (typeof update === 'function') {
                const newPrefs = update(userPreferences)
                
                // Check if this is a name change
                if (newPrefs.name !== userPreferences.name) {
                    // Use debounced update for name changes to prevent per-character sync
                    debouncedNameUpdate(newPrefs.name)
                } else {
                    // Non-name changes apply immediately
                    setUserPreferences(newPrefs)
                }
            } else {
                // Handle direct object updates
                if (update.name && update.name !== userPreferences.name) {
                    // Use debounced update for name changes
                    debouncedNameUpdate(update.name)
                } else {
                    setUserPreferences(prev => ({ ...prev, ...update }))
                }
            }
        }
    })

    // Simple store status monitoring
    React.useEffect(() => {
        // Basic connection monitoring - no complex optimizations
    }, [store?.status])

    return (
        <>
            <Tldraw
                store={store}
                user={user}
                components={TLDRAW_COMPONENTS}
                options={{
                    maxImageDimension: 5000,
                    maxAssetSize: 10 * 1024 * 1024, // 10mb
                }}
                colorScheme={userPreferences?.colorScheme ?? 'system'}
                onMount={(editor) => {
                    editor.registerExternalAssetHandler('url', unfurlBookmarkUrl)
                    return setupCanvasDefaults(editor)
                }}
            />
            
            {/* Room status indicator - positioned above debug bar */}
            <div style={{
                position: 'absolute',
                bottom: 50,
                right: 10,
                background: 'rgba(0,0,0,0.8)',
                color: 'white',
                padding: '6px 10px',
                borderRadius: '4px',
                fontSize: '11px',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                pointerEvents: 'none',
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
            }}>
                <span>Room: {roomId}</span>
                <span style={{ 
                    color: userPreferences.color,
                    opacity: isTabActive ? 1 : 0.6
                }}>
                    ({userPreferences.name}{!isTabActive ? ' 💤' : ''})
                </span>
                <span>{SYNC_STATUS_BADGE[store?.status] ?? '⚪'}</span>
                {!isTabActive && <span title="Tab is inactive">📱</span>}
            </div>
            
            
        </>
    )
}

// Local-only canvas with localStorage persistence. Used when no room is
// in the URL; collaborative path is SyncTldraw.
function LocalTldraw() {
    const store = React.useMemo(
        () => createTLStore({ shapeUtils: defaultShapeUtils }),
        [],
    )

    return (
        <Tldraw
            store={store}
            components={TLDRAW_COMPONENTS}
            options={{
                maxImageDimension: 5000,
                maxAssetSize: 10 * 1024 * 1024, // 10mb
            }}
            colorScheme="system"
            onMount={(editor) => {
                const cleanupDefaults = setupCanvasDefaults(editor)

                // Restore persisted state BEFORE attaching the save listener.
                // Doing it the other way around (the v1.3 ordering) opens a
                // window where a tldraw-internal store change can fire the
                // save listener with the blank initial store, clobbering the
                // user's saved canvas.
                try {
                    const saved = localStorage.getItem(STORAGE_KEY_LOCAL)
                    if (saved) {
                        loadSnapshot(editor.store, JSON.parse(saved))
                    }
                } catch (error) {
                    console.warn('Failed to load saved document:', error)
                }

                let saveTimeout
                const unsubscribe = editor.store.listen(() => {
                    clearTimeout(saveTimeout)
                    saveTimeout = setTimeout(() => {
                        try {
                            const snapshot = getSnapshot(editor.store)
                            localStorage.setItem(STORAGE_KEY_LOCAL, JSON.stringify(snapshot))
                        } catch (error) {
                            console.warn('Failed to save document:', error)
                        }
                    }, 100)
                })

                return () => {
                    cleanupDefaults()
                    clearTimeout(saveTimeout)
                    unsubscribe()
                }
            }}
        />
    )
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
) 
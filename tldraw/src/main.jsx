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

// Inline stylesheet for the quick-pick panel. Lives in the component so
// it's self-contained; React reconciles a single <style> tag across renders.
//
// Theme-awareness via `currentColor`: tldraw sets the appropriate text color
// on the menu container per theme (black-ish in light, white-ish in dark).
// We INHERIT — never hard-code — so the icons, text, hover backgrounds, and
// borders all flip with the theme automatically. The one rule that locked
// us into black-on-black before was anchoring to var(--color-text, #1d1d1d):
// when tldraw's actual var name differs (which it does on v5), the #1d1d1d
// fallback kicked in for dark mode → invisible.
const QUICKPICK_CSS = `
.qp-root {
    padding: 10px 10px 6px;
    min-width: 220px;
    /* color: inherit from menu container — tldraw sets this per theme. */
}
.qp-swatches {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    margin-bottom: 10px;
}
.qp-swatch {
    aspect-ratio: 1 / 1;
    width: 100%;
    border-radius: 50%;
    border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
    cursor: pointer;
    padding: 0;
    transition: transform 0.08s ease-out, box-shadow 0.08s ease-out;
}
.qp-swatch:hover {
    transform: scale(1.12);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18), inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}
.qp-swatch:focus-visible {
    outline: 2px solid var(--color-selected, #3b82f6);
    outline-offset: 2px;
}

/* Tool grid: all 9 quick-pick tools share one icon-only square style.
   3x3 layout, matching the swatch grid's symmetry and tldraw's own
   toolbar idiom. Tooltips (title=) provide the label for discovery. */
.qp-tools {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    margin-bottom: 4px;
}
.qp-tool {
    appearance: none;
    aspect-ratio: 1 / 1;
    padding: 0;
    border-radius: 7px;
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
    width: 18px;
    height: 18px;
    color: inherit;
    fill: currentColor;
}
`

function QuickPickContextMenu(props) {
    const editor = useEditor()

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

    const pickColor = React.useCallback(
        (color) => {
            editor.setStyleForNextShapes(DefaultColorStyle, color)
            closeMenu()
        },
        [editor, closeMenu]
    )

    const pickTool = React.useCallback(
        (tool, info) => {
            editor.setCurrentTool(tool, info)
            closeMenu()
        },
        [editor, closeMenu]
    )

    // Tool ids in QUICK_TOOLS_9 may be 'geo:rectangle' style; split into
    // (tool, info) for setCurrentTool's second-arg signature.
    const dispatchTool = React.useCallback(
        (id) => {
            if (id.startsWith('geo:')) {
                pickTool('geo', { geo: id.slice(4) })
            } else {
                pickTool(id)
            }
        },
        [pickTool]
    )

    return (
        <DefaultContextMenu {...props}>
            <style>{QUICKPICK_CSS}</style>
            {/* Wrap custom JSX in TldrawUiMenuGroup so DefaultContextMenu's
                child-shape expectation (menu primitives) is satisfied. Raw
                divs as direct children break the menu context's setup,
                which in turn prevents DefaultContextMenuContent from
                rendering cut/copy/paste/export/etc. below. */}
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

// Shared color configuration for keyboard shortcuts
const COLOR_SHORTCUTS = {
    colorMap: {
        '1': 'black',
        '2': 'grey', 
        '3': 'green',
        '4': 'yellow',
        '5': 'red',
        '6': 'blue',
        '7': 'orange', 
        '8': 'indigo',
        '9': 'violet'
    },
    colorRgbMap: {
        'red': 'rgb(224, 51, 51)',
        'blue': 'rgb(51, 102, 204)', 
        'green': 'rgb(68, 170, 68)',
        'yellow': 'rgb(255, 193, 61)',
        'orange': 'rgb(255, 127, 0)',
        'indigo': 'rgb(68, 90, 158)',
        'violet': 'rgb(142, 68, 173)',
        'grey': 'rgb(153, 153, 153)',
        'black': 'rgb(0, 0, 0)',
        // Alternative color names
        'light-blue': 'rgb(68, 90, 158)',
        'purple': 'rgb(142, 68, 173)',
        'gray': 'rgb(153, 153, 153)'
    },
    // Alternative names TLDraw might use
    colorAliases: {
        'indigo': ['purple', 'light-blue', 'navy', 'dark-blue'],
        'violet': ['purple', 'magenta', 'pink'],
        'grey': ['gray']
    }
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
    const [isReady, setIsReady] = React.useState(false)
    
    // Always render TLDraw immediately, but defer sync connection
    React.useEffect(() => {
        // Short delay to let initial render complete
        const timer = setTimeout(() => {
            setIsReady(true)
        }, 50)
        return () => clearTimeout(timer)
    }, [])

    if (roomId) {
        // Room-based collaborative mode
        if (!isReady) {
            // Loading with local store for faster startup
        } else {
            // Ready to establish sync connection
        }
    } else {
        // Standalone mode - no synchronization
    }

    return (
        <div style={{ position: 'fixed', inset: 0 }}>
            {roomId && isReady ? (
                <SyncTldraw roomId={roomId} />
            ) : (
                <LocalTldraw roomId={roomId} />
            )}
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
    console.log('TLDraw sync connecting to:', wsUrl)

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

    // Simple debounced name update - only update state after delay
    const debouncedNameUpdate = React.useCallback(
        React.useMemo(() => {
            let timeoutId
            return (newName) => {
                clearTimeout(timeoutId)
                timeoutId = setTimeout(() => {
                    setUserPreferences(prev => ({ ...prev, name: newName }))
                }, 800) // Shorter delay for better responsiveness
            }
        }, []),
        []
    )
    
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
                    // External asset handler registered for URL unfurling

                    if (typeof window !== 'undefined') {
                        window.editor = editor
                    }

                    // Default to the draw (pen) tool on page load — matches
                    // the vppillai/whiteboard mental model where the canvas
                    // is for drawing first; selection is a secondary mode.
                    editor.setCurrentTool('draw')

                    // Set default zoom to 75%
                    setTimeout(() => {
                        try {
                            const camera = editor.getCamera()
                            editor.setCamera({ ...camera, z: 0.75 })
                        } catch (error) {
                            console.log('Could not set initial zoom level')
                        }
                    }, 100)
                    
                    // Tool change handling for default styles
                    let currentTool = editor.getCurrentToolId()
                    const stylePrefs = getStylePreferences()
                    
                    // Apply saved preferences for the current tool
                    const applyToolPreferences = (toolId) => {
                        const prefs = stylePrefs[toolId]
                        if (prefs) {
                            if (prefs.size && (toolId === 'draw' || toolId === 'highlight')) {
                                editor.setStyleForNextShapes(DefaultSizeStyle, prefs.size)
                            }
                            if (prefs.font && (toolId === 'text' || toolId === 'note')) {
                                editor.setStyleForNextShapes(DefaultFontStyle, prefs.font)
                            }
                        } else {
                            // Set defaults for first time
                            if (toolId === 'draw' || toolId === 'highlight') {
                                editor.setStyleForNextShapes(DefaultSizeStyle, 's')
                                saveStylePreference(toolId, 'size', 's')
                            }
                            if (toolId === 'text' || toolId === 'note') {
                                editor.setStyleForNextShapes(DefaultFontStyle, 'mono')
                                saveStylePreference(toolId, 'font', 'mono')
                            }
                        }
                    }
                    
                    // Monitor tool changes
                    const checkToolChange = () => {
                        const newTool = editor.getCurrentToolId()
                        if (newTool !== currentTool) {
                            currentTool = newTool
                            applyToolPreferences(newTool)
                        }
                    }
                    
                    // Initial application
                    applyToolPreferences(currentTool)
                    
                    // Check for tool changes periodically
                    const toolCheckInterval = setInterval(checkToolChange, 100)
                    
                    // Listen for style changes to save preferences
                    editor.sideEffects.registerAfterChangeHandler('instance', () => {
                        const toolId = editor.getCurrentToolId()
                        const instanceState = editor.getInstanceState()
                        if (toolId === 'draw' || toolId === 'highlight') {
                            const currentSize = instanceState.stylesForNextShape[DefaultSizeStyle.id]
                            if (currentSize) {
                                saveStylePreference(toolId, 'size', currentSize)
                            }
                        }
                        if (toolId === 'text' || toolId === 'note') {
                            const currentFont = instanceState.stylesForNextShape[DefaultFontStyle.id]
                            if (currentFont) {
                                saveStylePreference(toolId, 'font', currentFont)
                            }
                        }
                    })
                    
                    // Use shared color configuration
                    const { colorMap, colorRgbMap, colorAliases } = COLOR_SHORTCUTS
                    
                    const findColorButton = (color) => {
                        // Get all possible names for this color
                        const colorNames = [color, ...(colorAliases[color] || [])]
                        
                        
                        // Priority 1: Direct color button selectors
                        for (const colorName of colorNames) {
                            const directSelectors = [
                                `[data-testid="style.color.${colorName}"]`,
                                `[data-testid*="color"][data-testid*="${colorName}"]`,
                                `[aria-label*="color ${colorName}"]`,
                                `[aria-label*="${colorName}"]`,
                                `[title*="${colorName}"]`
                            ]
                            
                            for (const selector of directSelectors) {
                                const button = document.querySelector(selector)
                                if (button) {
                                    return button
                                }
                            }
                        }
                        
                        // Priority 2: Style panel buttons with matching background color
                        const styleButtons = document.querySelectorAll('.tl-style-panel [role="button"], [data-testid*="style"] button, [data-testid*="color"] button')
                        
                        // Try multiple RGB values for this color
                        const possibleRgbValues = [
                            colorRgbMap[color],
                            ...colorNames.map(name => colorRgbMap[name]).filter(Boolean)
                        ]
                        
                        for (const targetRgb of possibleRgbValues) {
                            if (targetRgb) {
                                for (const button of styleButtons) {
                                    const bgColor = window.getComputedStyle(button).backgroundColor
                                    if (bgColor === targetRgb) {
                                        return button
                                    }
                                }
                            }
                        }
                        
                        // Priority 3: Broader search by color name in attributes
                        const allButtons = document.querySelectorAll('button, [role="button"]')
                        for (const colorName of colorNames) {
                            for (const button of allButtons) {
                                const testId = button.getAttribute('data-testid') || ''
                                const ariaLabel = button.getAttribute('aria-label') || ''
                                const title = button.getAttribute('title') || ''
                                
                                if (testId.includes(colorName) || ariaLabel.toLowerCase().includes(colorName) || title.toLowerCase().includes(colorName)) {
                                    // Make sure it's likely a color button
                                    if (testId.includes('color') || ariaLabel.includes('color') || title.includes('color') || 
                                        button.closest('[data-testid*="color"], .tl-style-panel')) {
                                        return button
                                    }
                                }
                            }
                        }
                        
                        return null
                    }
                    
                    const handleKeydown = (e) => {
                        // Skip if typing in input fields or using modifiers
                        if (e.target.tagName === 'INPUT' || 
                            e.target.tagName === 'TEXTAREA' || 
                            e.target.isContentEditable ||
                            e.ctrlKey || e.metaKey || e.altKey) {
                            return
                        }
                        
                        const color = colorMap[e.key]
                        if (!color) return // Let TLDraw handle non-color keys (like Delete, Arrow keys, etc.)
                        
                        
                        // Only block TLDraw from processing color shortcut keys
                        e.preventDefault()
                        e.stopPropagation()
                        e.stopImmediatePropagation()
                        
                        // Use requestAnimationFrame for better performance than setTimeout
                        requestAnimationFrame(() => {
                            const button = findColorButton(color)
                            if (button) {
                                button.click()
                            }
                        })
                        
                        return false
                    }
                    
                    // Add event listener with capture phase to intercept before TLDraw
                    document.addEventListener('keydown', handleKeydown, true)
                    
                    // Cleanup function to remove event listener and interval
                    return () => {
                        document.removeEventListener('keydown', handleKeydown, true)
                        clearInterval(toolCheckInterval)
                    }
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
                <span>
                    {store?.connectionStatus === 'online' ? '🟢' : 
                     store?.connectionStatus === 'offline' ? '🔴' : 
                     store?.status === 'loading' ? '🟡' : '⚪'}
                </span>
                {!isTabActive && <span title="Tab is inactive">📱</span>}
            </div>
            
            
        </>
    )
}

// Component for local-only TLDraw with persistence
function LocalTldraw({ roomId }) {
    const STORAGE_KEY = 'tldraw-local-document'
    
    // Use a simple store without complex persistence setup
    const store = React.useMemo(() => {
        return createTLStore({
            shapeUtils: defaultShapeUtils,
        })
    }, [])

    return (
        <>
            <Tldraw
                store={store}
                components={TLDRAW_COMPONENTS}
                options={{
                    maxImageDimension: 5000,
                    maxAssetSize: 10 * 1024 * 1024, // 10mb
                }}
                colorScheme="system"
                onMount={(editor) => {
                    if (typeof window !== 'undefined') {
                        window.editor = editor
                    }

                    // Default to the draw (pen) tool on page load — matches
                    // the vppillai/whiteboard mental model.
                    editor.setCurrentTool('draw')

                    // Set default zoom to 75%
                    setTimeout(() => {
                        try {
                            const camera = editor.getCamera()
                            editor.setCamera({ ...camera, z: 0.75 })
                        } catch (error) {
                            console.log('Could not set initial zoom level')
                        }
                    }, 100)

                    // Tool change handling for default styles
                    let currentTool = editor.getCurrentToolId()
                    const stylePrefs = getStylePreferences()
                    
                    // Apply saved preferences for the current tool
                    const applyToolPreferences = (toolId) => {
                        const prefs = stylePrefs[toolId]
                        if (prefs) {
                            if (prefs.size && (toolId === 'draw' || toolId === 'highlight')) {
                                editor.setStyleForNextShapes(DefaultSizeStyle, prefs.size)
                            }
                            if (prefs.font && (toolId === 'text' || toolId === 'note')) {
                                editor.setStyleForNextShapes(DefaultFontStyle, prefs.font)
                            }
                        } else {
                            // Set defaults for first time
                            if (toolId === 'draw' || toolId === 'highlight') {
                                editor.setStyleForNextShapes(DefaultSizeStyle, 's')
                                saveStylePreference(toolId, 'size', 's')
                            }
                            if (toolId === 'text' || toolId === 'note') {
                                editor.setStyleForNextShapes(DefaultFontStyle, 'mono')
                                saveStylePreference(toolId, 'font', 'mono')
                            }
                        }
                    }
                    
                    // Monitor tool changes
                    const checkToolChange = () => {
                        const newTool = editor.getCurrentToolId()
                        if (newTool !== currentTool) {
                            currentTool = newTool
                            applyToolPreferences(newTool)
                        }
                    }
                    
                    // Initial application
                    applyToolPreferences(currentTool)
                    
                    // Check for tool changes periodically
                    const toolCheckInterval = setInterval(checkToolChange, 100)
                    
                    // Listen for style changes to save preferences
                    editor.sideEffects.registerAfterChangeHandler('instance', () => {
                        const toolId = editor.getCurrentToolId()
                        const instanceState = editor.getInstanceState()
                        if (toolId === 'draw' || toolId === 'highlight') {
                            const currentSize = instanceState.stylesForNextShape[DefaultSizeStyle.id]
                            if (currentSize) {
                                saveStylePreference(toolId, 'size', currentSize)
                            }
                        }
                        if (toolId === 'text' || toolId === 'note') {
                            const currentFont = instanceState.stylesForNextShape[DefaultFontStyle.id]
                            if (currentFont) {
                                saveStylePreference(toolId, 'font', currentFont)
                            }
                        }
                    })
                    
                    // Use shared color configuration
                    const { colorMap, colorRgbMap, colorAliases } = COLOR_SHORTCUTS
                    
                    const findColorButton = (color) => {
                        // Get all possible names for this color
                        const colorNames = [color, ...(colorAliases[color] || [])]
                        
                        
                        // Priority 1: Direct color button selectors
                        for (const colorName of colorNames) {
                            const directSelectors = [
                                `[data-testid="style.color.${colorName}"]`,
                                `[data-testid*="color"][data-testid*="${colorName}"]`,
                                `[aria-label*="color ${colorName}"]`,
                                `[aria-label*="${colorName}"]`,
                                `[title*="${colorName}"]`
                            ]
                            
                            for (const selector of directSelectors) {
                                const button = document.querySelector(selector)
                                if (button) {
                                    return button
                                }
                            }
                        }
                        
                        // Priority 2: Style panel buttons with matching background color
                        const styleButtons = document.querySelectorAll('.tl-style-panel [role="button"], [data-testid*="style"] button, [data-testid*="color"] button')
                        
                        // Try multiple RGB values for this color
                        const possibleRgbValues = [
                            colorRgbMap[color],
                            ...colorNames.map(name => colorRgbMap[name]).filter(Boolean)
                        ]
                        
                        for (const targetRgb of possibleRgbValues) {
                            if (targetRgb) {
                                for (const button of styleButtons) {
                                    const bgColor = window.getComputedStyle(button).backgroundColor
                                    if (bgColor === targetRgb) {
                                        return button
                                    }
                                }
                            }
                        }
                        
                        // Priority 3: Broader search by color name in attributes
                        const allButtons = document.querySelectorAll('button, [role="button"]')
                        for (const colorName of colorNames) {
                            for (const button of allButtons) {
                                const testId = button.getAttribute('data-testid') || ''
                                const ariaLabel = button.getAttribute('aria-label') || ''
                                const title = button.getAttribute('title') || ''
                                
                                if (testId.includes(colorName) || ariaLabel.toLowerCase().includes(colorName) || title.toLowerCase().includes(colorName)) {
                                    // Make sure it's likely a color button
                                    if (testId.includes('color') || ariaLabel.includes('color') || title.includes('color') || 
                                        button.closest('[data-testid*="color"], .tl-style-panel')) {
                                        return button
                                    }
                                }
                            }
                        }
                        
                        return null
                    }
                    
                    const handleKeydown = (e) => {
                        // Skip if typing in input fields or using modifiers
                        if (e.target.tagName === 'INPUT' || 
                            e.target.tagName === 'TEXTAREA' || 
                            e.target.isContentEditable ||
                            e.ctrlKey || e.metaKey || e.altKey) {
                            return
                        }
                        
                        const color = colorMap[e.key]
                        if (!color) return // Let TLDraw handle non-color keys (like Delete, Arrow keys, etc.)
                        
                        
                        // Only block TLDraw from processing color shortcut keys
                        e.preventDefault()
                        e.stopPropagation()
                        e.stopImmediatePropagation()
                        
                        // Use requestAnimationFrame for better performance than setTimeout
                        requestAnimationFrame(() => {
                            const button = findColorButton(color)
                            if (button) {
                                button.click()
                            }
                        })
                        
                        return false
                    }
                    
                    // Add event listener with capture phase to intercept before TLDraw
                    document.addEventListener('keydown', handleKeydown, true)
                    
                    // Set up persistence using editor events
                    let saveTimeout
                    const handleChange = () => {
                        clearTimeout(saveTimeout)
                        saveTimeout = setTimeout(() => {
                            try {
                                const snapshot = getSnapshot(editor.store)
                                localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
                            } catch (error) {
                                console.warn('Failed to save document:', error)
                            }
                        }, 100)
                    }
                    
                    // Listen for changes using editor events
                    editor.store.listen(handleChange)
                    
                    // Load saved data after editor is ready
                    setTimeout(() => {
                        try {
                            const saved = localStorage.getItem(STORAGE_KEY)
                            if (saved) {
                                const snapshot = JSON.parse(saved)
                                loadSnapshot(editor.store, snapshot)
                            }
                        } catch (error) {
                            console.warn('Failed to load saved document:', error)
                        }
                    }, 100)
                    
                    // Cleanup function to remove event listener and interval
                    return () => {
                        document.removeEventListener('keydown', handleKeydown, true)
                        clearInterval(toolCheckInterval)
                    }
                }}
            />
            
            
            {/* Loading indicator for room mode */}
            {roomId && (
                <div style={{
                    position: 'absolute',
                    bottom: 10,
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
                    <span>🟡 Connecting...</span>
                </div>
            )}
        </>
    )
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
) 
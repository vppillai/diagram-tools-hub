import React from 'react'
import ReactDOM from 'react-dom/client'
import PropTypes from 'prop-types'
import { useSync } from '@tldraw/sync'
import {
    AssetRecordType,
    getHashForString,
    getSnapshot,
    loadSnapshot,
    Tldraw,
    uniqueId,
    useTldrawUser,
    createTLStore,
    defaultShapeUtils,
} from '@tldraw/tldraw'
import '@tldraw/tldraw/tldraw.css'

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

// Asset store implementation
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

            // Return just the URL string, not an object
            return url
        } catch (error) {
            console.error('Asset upload failed:', error)
            throw error
        }
    },
    resolve(asset) {
        return asset.props.src
    },
}

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

    // Create sync store with basic tab visibility info
    const wsUrl = getWebSocketUrl(roomId)
    console.log('TLDraw sync connecting to:', wsUrl)
    
    const store = useSync({
        uri: wsUrl,
        assets: multiplayerAssets,
        userInfo: {
            ...userPreferences,
            // Only track tab visibility - simple and non-intrusive
            isTabActive: isTabActive
        },
        // Prevent direct HTTP calls by providing explicit URLs
        pingUrl: `${getBaseUrl()}/tldraw-sync/ping`,
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
    
    // Create user object for Tldraw component with simple debounced name updates
    const user = useTldrawUser({ 
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
                options={{
                    maxImageDimension: 5000,
                    maxAssetSize: 10 * 1024 * 1024, // 10mb
                }}
                inferDarkMode
                onMount={(editor) => {
                    editor.registerExternalAssetHandler('url', unfurlBookmarkUrl)
                    // External asset handler registered for URL unfurling
                    
                    if (typeof window !== 'undefined') {
                        window.editor = editor
                    }
                    
                    // Set default zoom to 50%
                    setTimeout(() => {
                        try {
                            const camera = editor.getCamera()
                            editor.setCamera({ ...camera, z: 0.25 })
                        } catch (error) {
                            console.log('Could not set initial zoom level')
                        }
                    }, 100)
                    
                    
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
                    
                    // Cleanup function to remove event listener
                    return () => {
                        document.removeEventListener('keydown', handleKeydown, true)
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

SyncTldraw.propTypes = {
    roomId: PropTypes.string.isRequired
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
                options={{
                    maxImageDimension: 5000,
                    maxAssetSize: 10 * 1024 * 1024, // 10mb
                }}
                inferDarkMode
                onMount={(editor) => {
                    if (typeof window !== 'undefined') {
                        window.editor = editor
                    }
                    
                    // Set default zoom to 50%
                    setTimeout(() => {
                        try {
                            const camera = editor.getCamera()
                            editor.setCamera({ ...camera, z: 0.25 })
                        } catch (error) {
                            console.log('Could not set initial zoom level')
                        }
                    }, 100)
                    
                    
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
                    
                    // Cleanup function to remove event listener
                    return () => {
                        document.removeEventListener('keydown', handleKeydown, true)
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

LocalTldraw.propTypes = {
    roomId: PropTypes.string
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
) 
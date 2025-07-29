import React from 'react'
import ReactDOM from 'react-dom/client'
import { useSync } from '@tldraw/sync'
import {
    AssetRecordType,
    getHashForString,
    Tldraw,
    uniqueId,
    useTldrawUser,
} from '@tldraw/tldraw'
import '@tldraw/tldraw/tldraw.css'

// Get the current protocol and host
const getBaseUrl = () => {
    const protocol = window.location.protocol
    const host = window.location.host
    console.log('Current protocol:', protocol)
    console.log('Current host:', host)
    return `${protocol}//${host}`
}

// Get WebSocket URL
const getWebSocketUrl = (roomId) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const wsUrl = `${protocol}//${host}/tldraw-sync/connect/${roomId}`
    console.log('WebSocket protocol:', protocol)
    console.log('TLDraw Sync URI:', wsUrl)
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
        if (roomId && roomId.trim()) {
            console.log('Room ID from path:', roomId)
            return roomId
        }
    }
    
    console.log('No room ID in path - using standalone mode')
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

            return { src: url }
        } catch (error) {
            console.error('Asset upload failed:', error)
            throw error
        }
    },
    resolve(asset) {
        return asset.props.src
    },
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

function App() {
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
        console.log('SYNC MODE - Room:', roomId)
        if (!isReady) {
            console.log('Loading TLDraw with local store first...')
        } else {
            console.log('Ready to establish sync connection')
        }
    } else {
        console.log('STANDALONE MODE - No sync')
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
    // Generate consistent user preferences for this session
    const [userPreferences, setUserPreferences] = React.useState(() => {
        // Try to get existing user data from localStorage
        const stored = localStorage.getItem('tldraw-user-preferences')
        if (stored) {
            try {
                return JSON.parse(stored)
            } catch (e) {
                console.warn('Failed to parse stored user preferences:', e)
            }
        }
        
        // Generate new user preferences
        const colors = ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet', 'pink', 'grey']
        const names = ['Superman', 'Batman', 'Wonder Woman', 'Spider-Man', 'Iron Man', 'Captain America', 'Thor', 'Hulk', 'Flash', 'Aquaman', 'Joker', 'Lex Luthor', 'Magneto', 'Loki', 'Green Goblin', 'Venom', 'Thanos', 'Ultron', 'Harley Quinn', 'Catwoman']
        
        // Generate a consistent user ID
        const userId = 'user-' + Math.random().toString(36).substring(2, 11)
        
        // Use a simple hash of the user ID to determine color and name indices
        // This ensures the same user gets the same color/name across sessions
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
        
        return {
            id: userId,
            name: names[userHash % names.length],
            color: colors[userHash % colors.length],
            colorScheme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        }
    })

    // Save user preferences to localStorage when they change
    React.useEffect(() => {
        localStorage.setItem('tldraw-user-preferences', JSON.stringify(userPreferences))
    }, [userPreferences])

    const store = useSync({
        uri: getWebSocketUrl(roomId),
        assets: multiplayerAssets,
        userInfo: userPreferences, // Pass user info for presence sync
    })

    // State to track pending name during editing
    const [pendingName, setPendingName] = React.useState(null)
    
    // Debounced name update to prevent per-character syncing
    const debouncedNameUpdate = React.useCallback(
        React.useMemo(() => {
            let timeoutId
            return (newName) => {
                setPendingName(newName) // Immediately show the new name
                clearTimeout(timeoutId)
                timeoutId = setTimeout(() => {
                    setUserPreferences(prev => ({ ...prev, name: newName }))
                    setPendingName(null) // Clear pending name after commit
                }, 1000) // 1 second delay after user stops typing
            }
        }, []),
        []
    )
    
    // Function to immediately commit name changes (for enter/blur)
    const commitNameChange = React.useCallback((newName) => {
        setUserPreferences(prev => ({ ...prev, name: newName }))
        setPendingName(null)
    }, [])
    
    // Create user object for Tldraw component with proper name handling
    const user = useTldrawUser({ 
        userPreferences: pendingName ? { ...userPreferences, name: pendingName } : userPreferences,
        setUserPreferences: (update) => {
            if (typeof update === 'function') {
                const currentPrefs = pendingName ? { ...userPreferences, name: pendingName } : userPreferences
                const newPrefs = update(currentPrefs)
                
                // Check if this is a name change
                if (newPrefs.name !== userPreferences.name) {
                    // Check if this looks like a "commit" (like from enter/blur)
                    // TLDraw might signal this by calling with the same name twice
                    if (newPrefs.name === pendingName) {
                        // This is a commit - apply immediately
                        commitNameChange(newPrefs.name)
                    } else {
                        // This is typing - use debounced update
                        debouncedNameUpdate(newPrefs.name)
                    }
                } else {
                    // Non-name changes apply immediately
                    setUserPreferences(newPrefs)
                }
            } else {
                // Handle direct object updates
                if (update.name && update.name !== userPreferences.name) {
                    // Check if this looks like a commit
                    if (update.name === pendingName) {
                        // This is a commit - apply immediately
                        commitNameChange(update.name)
                    } else {
                        // This is typing - use debounced update
                        debouncedNameUpdate(update.name)
                    }
                } else {
                    setUserPreferences(prev => ({ ...prev, ...update }))
                }
            }
        }
    })

    console.log('SyncTldraw - Store status:', store?.status || 'undefined')
    console.log('SyncTldraw - Store object:', store)
    console.log('SyncTldraw - User preferences:', userPreferences)
    
    React.useEffect(() => {
        if (store) {
            console.log('Sync store status changed to:', store.status)
        }
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
                    console.log('TLDraw sync mode - external asset handler registered')
                    console.log('TLDraw user info:', userPreferences)
                    
                    if (typeof window !== 'undefined') {
                        window.editor = editor
                        console.log('TLDraw editor mounted (sync mode)')
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
                <span style={{ color: userPreferences.color }}>({userPreferences.name})</span>
                <span>{store?.connectionStatus === 'online' ? '🟢' : store?.connectionStatus === 'offline' ? '🔴' : store?.status === 'loading' ? '🟡' : '⚪'}</span>
            </div>
        </>
    )
}

// Component for local-only TLDraw
function LocalTldraw({ roomId }) {
    console.log(roomId ? 'LocalTldraw - Room mode (transitioning to sync)' : 'LocalTldraw - Standalone mode')

    return (
        <>
            <Tldraw
                options={{
                    maxImageDimension: 5000,
                    maxAssetSize: 10 * 1024 * 1024, // 10mb
                }}
                inferDarkMode
                onMount={(editor) => {
                    console.log('TLDraw standalone mode - no external handlers')
                    
                    if (typeof window !== 'undefined') {
                        window.editor = editor
                        console.log(`TLDraw editor mounted (${roomId ? 'local-transitioning' : 'standalone'} mode)`)
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
import React from 'react'
import ReactDOM from 'react-dom/client'
import { useSync } from '@tldraw/sync'
import {
    AssetRecordType,
    getHashForString,
    Tldraw,
    uniqueId,
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
    const store = useSync({
        uri: getWebSocketUrl(roomId),
        assets: multiplayerAssets,
    })

    console.log('SyncTldraw - Store status:', store?.status || 'undefined')
    console.log('SyncTldraw - Store object:', store)
    
    React.useEffect(() => {
        if (store) {
            console.log('Sync store status changed to:', store.status)
        }
    }, [store?.status])

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
                    editor.registerExternalAssetHandler('url', unfurlBookmarkUrl)
                    console.log('TLDraw sync mode - external asset handler registered')
                    
                    if (typeof window !== 'undefined') {
                        window.editor = editor
                        console.log('TLDraw editor mounted (sync mode)')
                    }
                }}
            />
            
            {/* Room status indicator */}
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
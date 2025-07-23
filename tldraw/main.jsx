import React from 'react'
import ReactDOM from 'react-dom/client'
import { Tldraw } from '@tldraw/tldraw'
import '@tldraw/tldraw/tldraw.css'

function App() {
    return (
        <div style={{ position: 'fixed', inset: 0 }}>
            <Tldraw
                options={{
                    maxImageDimension: 5000,
                    maxAssetSize: 10 * 1024 * 1024, // 10mb
                }}
                inferDarkMode
            />
        </div>
    )
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
) 
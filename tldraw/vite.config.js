import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    base: '/tldraw/',
    server: {
        host: '0.0.0.0',
        port: 3000,
        strictPort: true,
        hmr: {
            port: 3000
        }
    }
}) 
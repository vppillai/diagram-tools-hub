import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
    const isProduction = mode === 'production'
    
    return {
        plugins: [react()],
        base: '/tldraw/',
        server: {
            host: '0.0.0.0',
            port: 3000,
            strictPort: true,
            allowedHosts: true,
            hmr: isProduction ? false : {
                port: 3000
            }
        },
        build: {
            sourcemap: false,
            minify: 'esbuild' // Use esbuild instead of terser (faster and included by default)
        }
    }
}) 
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { config } from 'dotenv'
import path from 'path'

// Load environment variables from the top-level .env file
config({ path: path.resolve(__dirname, '../.env') })

// Get allowed hosts from environment variable or use default
const getAllowedHosts = () => {
    const envHosts = process.env.VITE_ALLOWED_HOSTS
    if (envHosts) {
        return envHosts.split(',').map(host => host.trim())
    }
    // Default hosts 
    return ['localhost', '127.0.0.1']
}

export default defineConfig({
    plugins: [react()],
    base: '/tldraw/',
    server: {
        host: '0.0.0.0',
        port: 3000,
        strictPort: true,
        allowedHosts: getAllowedHosts(),
        hmr: {
            port: 3000
        }
    }
}) 
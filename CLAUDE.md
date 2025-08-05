# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **Diagram Tools Hub** - a unified Docker-based platform that integrates three diagramming tools:
- **Draw.io** - Professional diagrams and flowcharts  
- **Excalidraw** - Hand-drawn style diagrams and wireframes
- **TLDraw** - Modern collaborative drawing canvas

The project uses Docker Compose to orchestrate multiple services behind an Nginx reverse proxy with HTTPS support.

## Common Commands

### Service Management
- `./manage-config.sh start` - Start all services with auto-generated HTTPS
- `./manage-config.sh stop` - Stop all services
- `./manage-config.sh restart` - Restart all services
- `./manage-config.sh rebuild` - Rebuild containers and restart
- `./manage-config.sh status` - Show container status and resource usage
- `./manage-config.sh logs [service]` - View logs for all services or specific service

### Configuration Commands
- `./manage-config.sh show` - Display current configuration
- `./manage-config.sh http-only` - Switch to HTTP-only mode (disable SSL)
- `./manage-config.sh cleanup` - Remove conflicting containers/networks

### Monitoring Commands
- `./manage-config.sh tldraw-monitor` - Comprehensive TLDraw system dashboard
- `./manage-config.sh tldraw-rooms` - TLDraw room statistics and collaboration usage
- `./manage-config.sh tldraw-health` - TLDraw sync backend health and API status
- `./manage-config.sh system-metrics` - Docker container performance metrics
- `./manage-config.sh system-stats` - Real-time container resource usage

### System Service
- `sudo ./manage-config.sh install-service` - Install as systemd service for auto-start
- `sudo ./manage-config.sh uninstall-service` - Remove systemd service
- `./manage-config.sh service-status` - Check systemd service status

### TLDraw Development
- `cd tldraw && npm run dev` - Start TLDraw in development mode (port 3000)
- `cd tldraw && npm run build` - Build TLDraw for production
- `cd tldraw && npm run preview` - Preview production build
- `cd tldraw-sync-backend && npm run dev` - Start sync backend with --watch
- `cd tldraw-sync-backend && npm start` - Run sync backend in production mode
- `docker-compose build --no-cache tldraw` - Rebuild TLDraw container
- `docker-compose build --no-cache tldraw-sync` - Rebuild sync backend container

## Architecture

### Service Structure
- **Engine** (Nginx) - Main reverse proxy and landing page server
  - Handles HTTPS termination and SSL certificate management
  - Routes traffic to backend services via upstream blocks
  - Serves unified dashboard at root path
- **Draw.io** - Runs on port 8081, proxied to `/drawio/`
- **Excalidraw** - Runs on port 8082, proxied to `/excalidraw/`  
- **TLDraw** - Custom built React app on port 8083, proxied to `/tldraw/`
- **TLDraw Sync** - WebSocket collaboration backend on port 3001 (internal only)

### Key Configuration Files
- `docker-compose.yml` - Service orchestration with configurable ports
- `engine/nginx.conf` - Reverse proxy configuration with HTTPS support  
- `tldraw/vite.config.js` - Vite dev server config with `allowedHosts: true`
- `tldraw/main.jsx` - Main TLDraw React app with sync integration
- `tldraw-sync-backend/server.js` - WebSocket collaboration server
- `.env` - Environment variables for ports and SSL configuration
- `manage-config.sh` - Main management script with comprehensive operations

### SSL/HTTPS Configuration
- Auto-generates self-signed certificates if none exist
- Supports custom certificates via command line arguments
- HTTP traffic automatically redirects to HTTPS
- Configurable ports via environment variables

### Environment Variables
Key variables in `.env`:
```bash
HTTP_PORT=8080              # HTTP port (when HTTPS disabled)
HTTPS_PORT=8080             # HTTPS port (currently set to 8080)
HTTP_REDIRECT_PORT=80       # HTTP redirect port
SSL_DOMAIN=localhost        # SSL certificate domain
TLDRAW_DEBUG_PANEL=true     # TLDraw debug panel (enabled)
NODE_ENV=production         # Node.js environment
COMPOSE_PROJECT_NAME=diagram-tools-hub  # Docker Compose project name
```

## Development Notes

### TLDraw Specifics
- Uses Vite as build system with React
- Built from source using custom Dockerfile
- Configured with `base: '/tldraw/'` for reverse proxy support
- `allowedHosts: true` prevents "Blocked request" errors in dev mode
- **Collaboration Features:**
  - Room-based real-time collaboration via WebSocket
  - Automatic superhero/villain name assignment with collision prevention
  - Deterministic color assignment based on user ID hash
  - Custom keyboard shortcuts (1-9 keys) for quick color switching
  - File-based room persistence in `.rooms` and `.assets` directories
- **Dual Mode Support:**
  - Standalone mode: `/tldraw/` (no server sync)
  - Collaborative mode: `/tldraw/room-name` (real-time multi-user)

### Docker Network
- All services use shared network: `diagram-tools-network`
- Internal communication uses container names as hostnames
- External access through Nginx reverse proxy only

### SSL Certificate Management
- Certificates stored in `./certs/` directory
- Auto-generated with 365-day validity and SAN entries
- Can be regenerated by removing `./certs/` and restarting services

## Access Points

- **Main Hub**: https://localhost:8080 (or configured HTTPS_PORT)
- **Draw.io**: https://localhost:8080/drawio/
- **Excalidraw**: https://localhost:8080/excalidraw/  
- **TLDraw**: https://localhost:8080/tldraw/
- **TLDraw Collaborative Room**: https://localhost:8080/tldraw/room-name
- **Health Check**: https://localhost:8080/health

## Technology Stack

### TLDraw Dependencies
- **Frontend**: React 18, Vite 5, @tldraw/tldraw ^2.0.0, @tldraw/sync ^2.0.0
- **Backend**: Node.js, @tldraw/sync-core ^2.0.0, WebSocket (ws ^8.18.0)
- **Additional**: unfurl.js ^6.4.0 for URL preview functionality

## Troubleshooting

### Port Conflicts
Check what's using ports: `lsof -i :80-8083`
Update `.env` with custom ports and restart services

### Container Issues
- `./manage-config.sh cleanup` - Remove conflicting resources
- `./manage-config.sh clean-rebuild` - Complete rebuild from scratch
- `docker-compose logs -f [service]` - Debug specific service

### SSL Issues  
- Browser security warnings are normal for self-signed certificates
- Remove `./certs/` directory to regenerate certificates
- Use `./manage-config.sh http-only` to disable SSL entirely
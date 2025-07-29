# Diagram Tools Hub

[![CI/CD Pipeline](https://github.com/vppillai/diagram-tools-hub/workflows/CI/CD%20Pipeline/badge.svg)](https://github.com/vppillai/diagram-tools-hub/actions/workflows/ci-cd.yml)
[![Security Scan](https://github.com/vppillai/diagram-tools-hub/workflows/Security%20Scan/badge.svg)](https://github.com/vppillai/diagram-tools-hub/actions/workflows/security.yml)
[![Release Management](https://github.com/vppillai/diagram-tools-hub/workflows/🚀%20Release%20Management/badge.svg)](https://github.com/vppillai/diagram-tools-hub/actions/workflows/release.yml)

A unified Docker-based platform that integrates three powerful diagramming tools behind an Nginx reverse proxy with HTTPS support:

- **Draw.io** - Professional diagrams and flowcharts
- **Excalidraw** - Hand-drawn style diagrams and wireframes  
- **TLDraw** - Modern collaborative drawing canvas with real-time multi-user collaboration

## Quick Start

```bash
git clone https://github.com/vppillai/diagram-tools-hub.git
cd diagram-tools-hub
./manage-config.sh start
```

Then open https://localhost:8080 in your browser.

## Access Points

- **Main Hub**: https://localhost:8080 (or configured HTTPS_PORT)
- **Draw.io**: https://localhost:8080/drawio/
- **Excalidraw**: https://localhost:8080/excalidraw/  
- **TLDraw**: https://localhost:8080/tldraw/
- **TLDraw Collaborative Room**: https://localhost:8080/tldraw/room-name
- **Health Check**: https://localhost:8080/health

## Service Management

The `manage-config.sh` script handles all operations:

### Basic Operations
```bash
./manage-config.sh start      # Start all services with auto-generated HTTPS
./manage-config.sh stop       # Stop all services
./manage-config.sh restart    # Restart all services
./manage-config.sh rebuild    # Rebuild containers and restart
./manage-config.sh status     # Show container status and resource usage
```

### Configuration Commands
```bash
./manage-config.sh show           # Display current configuration  
./manage-config.sh http-only      # Switch to HTTP-only mode (disable SSL)
./manage-config.sh cleanup        # Remove conflicting containers/networks
./manage-config.sh clean-rebuild  # Complete rebuild from scratch
```

### Individual Service Management
```bash
./manage-config.sh restart tldraw        # Restart specific service
./manage-config.sh rebuild tldraw-sync   # Rebuild and restart specific service
./manage-config.sh logs tldraw          # View logs for specific service
./manage-config.sh stop drawio          # Stop specific service

# Available services: engine, drawio, excalidraw, tldraw, tldraw-sync
```

### TLDraw Monitoring Commands
```bash
./manage-config.sh tldraw-monitor    # Comprehensive TLDraw system dashboard
./manage-config.sh tldraw-rooms      # TLDraw room statistics and collaboration usage
./manage-config.sh tldraw-health     # TLDraw sync backend health and API status  
./manage-config.sh system-metrics    # Docker container performance metrics
./manage-config.sh system-stats      # Real-time container resource usage
```

## Auto-Start System Service

Install as a systemd service for automatic startup on server reboot:

```bash
# Install service (requires sudo)
sudo ./manage-config.sh install-service

# Check service status
./manage-config.sh service-status

# Uninstall service (requires sudo)
sudo ./manage-config.sh uninstall-service
```

Once installed, manage with systemctl:
```bash
sudo systemctl start/stop/restart drawapp
sudo journalctl -u drawapp -f  # View service logs
```

The service automatically handles SSL generation, container management, and restart on failure.

## HTTPS Support

### Automatic HTTPS (Default)
HTTPS is enabled by default with auto-generated self-signed certificates:
- RSA 2048-bit keys with 365-day validity
- Subject Alternative Names for localhost and IP addresses
- HTTP automatically redirects to HTTPS
- Modern security headers and TLS configuration

### Custom Certificates
```bash
./manage-config.sh start /path/to/cert.pem /path/to/key.pem
```

### HTTP-Only Mode
```bash
./manage-config.sh http-only
```

## TLDraw Real-time Collaboration

TLDraw features a powerful WebSocket-based collaboration system supporting multiple simultaneous users.

### Usage Modes

**Standalone Mode:**
- URL: `https://localhost:8080/tldraw/`
- Single-user experience, no server sync

**Collaborative Mode:**
- URL: `https://localhost:8080/tldraw/your-room-name`
- Real-time multi-user collaboration
- Live cursors and presence indicators
- Instant synchronization across all users

### Collaboration Features

🎨 **Smart User Management:**
- Automatic superhero/villain name assignment (Superman, Batman, Joker, etc.)
- Deterministic color assignment based on user ID hash (prevents collisions)
- Editable names and colors via user avatar
- Room-specific user preferences with localStorage persistence

👥 **Real-time Presence:**
- Live collaborative cursors with user identification
- Real-time drawing updates and shape modifications
- Connection status indicators (🟢 online, 🔴 offline, 🟡 loading)
- User avatars showing active collaborators

💾 **Intelligent Persistence:**
- File-based room storage with automatic cleanup
- Progressive loading with fallback to local store
- Tab visibility tracking for idle user optimization
- Automatic reconnection handling

🔧 **System Architecture:**
- **Frontend**: React with @tldraw/sync integration
- **Backend**: Node.js WebSocket server using @tldraw/sync-core  
- **Storage**: File-based persistence in `.rooms` and `.assets` directories
- **Monitoring**: REST API endpoints for room statistics and health checks

### Monitoring & Analytics

The TLDraw system includes comprehensive monitoring capabilities:

**Room Statistics:**
- Total and active room counts
- Storage usage analysis
- Recent room activity (last 24 hours)
- Room-specific collaboration metrics

**Health Monitoring:**
- API endpoint responsiveness checks
- WebSocket connection health
- Memory usage warnings
- System performance metrics

**Real-time Insights:**
- Active user counts per room
- Asset storage and management
- Connection status tracking
- Performance bottleneck identification

## Configuration

### Environment Variables

Key variables in `.env`:
```bash
# Port Configuration
HTTP_PORT=8080                      # HTTP port (when HTTPS disabled)
HTTPS_PORT=8080                     # HTTPS port (currently set to 8080)
HTTP_REDIRECT_PORT=80               # HTTP redirect port
SSL_DOMAIN=localhost                # SSL certificate domain

# TLDraw Settings
TLDRAW_DEBUG_PANEL=true             # TLDraw debug panel (enabled)

# Application Settings
NODE_ENV=production                 # Node.js environment
ENABLE_ANALYTICS=false              # Analytics feature flag
ENABLE_TELEMETRY=false              # Telemetry feature flag
COMPOSE_PROJECT_NAME=diagram-tools-hub  # Docker Compose project name
```

### TLDraw Development

```bash
# Frontend development
cd tldraw && npm run dev    # Development mode (port 3000)
cd tldraw && npm run build  # Production build
cd tldraw && npm run preview # Preview production build

# Sync backend development  
cd tldraw-sync-backend && npm run dev   # Development with --watch
cd tldraw-sync-backend && npm start     # Production mode

# Container rebuilds
./manage-config.sh rebuild tldraw       # Rebuild frontend
./manage-config.sh rebuild tldraw-sync  # Rebuild sync backend
```

## Architecture

### Service Structure
- **Engine** (Nginx) - Reverse proxy, SSL termination, and landing page server
- **Draw.io** - Professional diagramming tool (port 8081 → `/drawio/`)
- **Excalidraw** - Hand-drawn diagrams (port 8082 → `/excalidraw/`)  
- **TLDraw** - Collaborative canvas (port 8083 → `/tldraw/`)
- **TLDraw Sync** - WebSocket collaboration backend (port 3001, internal)

### Network Architecture
- Shared Docker network: `diagram-tools-network`
- Internal communication via container hostnames
- External access through Nginx reverse proxy only
- SSL/TLS termination at proxy level

### TLDraw Collaboration Stack
- **Frontend**: React with Vite build system, @tldraw/sync integration
- **Backend**: Node.js with WebSocket server (@tldraw/sync-core)
- **Storage**: File-based persistence with automatic cleanup
- **Assets**: Upload/download system with size management
- **Monitoring**: REST API for statistics and health checks

## Troubleshooting

### Port Conflicts
```bash
# Check port usage
lsof -i :80-8083

# Use custom ports in .env
HTTPS_PORT=8443
HTTP_REDIRECT_PORT=8080
```

### Container Issues
```bash
./manage-config.sh cleanup       # Remove conflicts
./manage-config.sh clean-rebuild # Complete rebuild
./manage-config.sh logs [service] # Debug specific service
```

### SSL Issues
```bash
# Regenerate certificates
rm -rf ./certs/
./manage-config.sh restart

# Switch to HTTP-only
./manage-config.sh http-only
```

### TLDraw Issues
```bash
# Rebuild from scratch
docker-compose build --no-cache tldraw
docker-compose build --no-cache tldraw-sync

# Check collaboration health
./manage-config.sh tldraw-health
```

## Requirements

- **Docker & Docker Compose** - Container orchestration
- **2GB+ RAM** - For all services running simultaneously  
- **Available Ports** - 80, 443, 8080 (or configured alternatives)
- **Modern Browser** - For accessing the diagramming tools

## Development & Contributing

### Local Development
```bash
NODE_ENV=development docker-compose up -d
docker-compose logs -f tldraw
```

### Adding New Tools
1. Add service to `docker-compose.yml`
2. Update `engine/nginx.conf` with proxy rules
3. Add tool card to `engine/html/index.html`

### Contributing
Found a bug or have an idea? Open an issue or submit a PR!

## Releases

Docker images are automatically built and published:
```bash
docker pull ghcr.io/vppillai/diagram-tools-hub/tldraw:latest
docker pull ghcr.io/vppillai/diagram-tools-hub/engine:latest
```

## License

This project is open source. Individual tools retain their original licenses:
- **Draw.io**: Apache 2.0
- **Excalidraw**: MIT  
- **TLDraw**: Apache 2.0
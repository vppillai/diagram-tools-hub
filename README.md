# Diagram Tools Hub

[![CI/CD Pipeline](https://github.com/vppillai/diagram-tools-hub/workflows/CI/CD%20Pipeline/badge.svg)](https://github.com/vppillai/diagram-tools-hub/actions/workflows/ci-cd.yml)
[![Security Scan](https://github.com/vppillai/diagram-tools-hub/workflows/Security%20Scan/badge.svg)](https://github.com/vppillai/diagram-tools-hub/actions/workflows/security.yml)
[![Release Management](https://github.com/vppillai/diagram-tools-hub/workflows/🚀%20Release%20Management/badge.svg)](https://github.com/vppillai/diagram-tools-hub/actions/workflows/release.yml)

A unified Docker-based platform that integrates three powerful diagramming tools behind an Nginx reverse proxy with HTTPS support:

- **Draw.io** - Professional diagrams and flowcharts
- **Excalidraw** - Hand-drawn style diagrams and wireframes  
- **TLDraw** - Modern collaborative drawing canvas with real-time multi-user collaboration

## ✨ Key Features

### 🚀 **Production-Ready Architecture**
- **HTTPS by Default**: Auto-generated SSL certificates with modern TLS configuration
- **Reverse Proxy**: Nginx-based routing with WebSocket support
- **Docker Orchestration**: Multi-service deployment with health checks
- **Auto-Start Service**: Systemd integration for server deployments

### 🎨 **Advanced TLDraw Collaboration**
- **Real-time Multi-user**: Live cursors, instant synchronization, presence indicators
- **Smart User Management**: Auto-assigned superhero names with collision prevention
- **Keyboard Shortcuts**: Number keys (1-9) for instant color switching
- **Asset Handling**: Image uploads with URL unfurling for bookmarks
- **Room Persistence**: File-based storage with automatic cleanup

### 🔧 **Developer Experience**
- **Dual Mode Support**: Production (optimized) and Development (hot-reload) builds
- **Comprehensive Monitoring**: Room statistics, health checks, system metrics
- **Easy Management**: Single script for all operations (`manage-config.sh`)
- **CI/CD Ready**: GitHub Actions with automated testing and releases

## 🆕 What's New

### Recent Enhancements
- **🛠️ Development Mode**: Added `start-dev` and `rebuild-dev` commands for hot-reload development
- **⌨️ Keyboard Shortcuts**: Custom number key shortcuts (1-9) for instant color switching in TLDraw  
- **🔧 Smart Key Handling**: Fixed Delete key functionality while preserving color shortcuts
- **📊 Enhanced Monitoring**: Comprehensive TLDraw health checks and room statistics
- **🏗️ Production Builds**: Optimized Vite builds with minification and static serving
- **🔄 Asset Management**: Fixed image paste functionality in collaborative rooms
- **📱 Mobile Optimization**: Better responsive design and touch support

## Quick Start

**Production Mode (Default):**
```bash
git clone https://github.com/vppillai/diagram-tools-hub.git
cd diagram-tools-hub
./manage-config.sh start        # Optimized production build
```

**Development Mode:**
```bash
git clone https://github.com/vppillai/diagram-tools-hub.git
cd diagram-tools-hub
./manage-config.sh start-dev    # Development with hot-reload
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
./manage-config.sh start      # Start all services in production mode (optimized, minified)
./manage-config.sh start-dev  # Start all services in development mode (hot-reload, debugging)
./manage-config.sh stop       # Stop all services
./manage-config.sh restart    # Restart all services
./manage-config.sh rebuild    # Rebuild containers and restart (production mode)
./manage-config.sh rebuild-dev # Rebuild containers and restart (development mode)
./manage-config.sh status     # Show container status and resource usage
```

### Configuration Commands
```bash
./manage-config.sh show           # Display current configuration  
./manage-config.sh http-only      # Switch to HTTP-only mode (disable SSL)
./manage-config.sh cleanup        # Remove conflicting containers/networks
./manage-config.sh clean-rebuild  # Complete rebuild from scratch
```

### Maintenance Commands
```bash
./manage-config.sh prune                    # Remove unused Docker resources
./manage-config.sh backup-config           # Backup current configuration
./manage-config.sh restore-config [FILE]   # Restore configuration from backup
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
- **Asset Management**: Image upload/download with size limits (10MB max, 5000px max dimension)
- **URL Unfurling**: Automatic bookmark previews with title, description, and thumbnails

⌨️ **Enhanced User Experience:**
- **Custom Keyboard Shortcuts**: Quick color switching with number keys (1-9)
  - `1` = Black, `2` = Grey, `3` = Green, `4` = Yellow, `5` = Red
  - `6` = Blue, `7` = Orange, `8` = Indigo, `9` = Violet
- **Optimized Drawing**: Default small pen size for precise drawing
- **Smart Key Handling**: Shortcuts don't interfere with Delete, Arrow keys, or text input

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

**Containerized Development (Recommended):**
```bash
# Development mode - Hot reload, debugging, live editing
./manage-config.sh start-dev    # Start all services with TLDraw in dev mode

# Production mode - Optimized build, minified assets  
./manage-config.sh start        # Start all services with TLDraw production build

# Container rebuilds (production mode - default)
./manage-config.sh rebuild tldraw       # Rebuild TLDraw container (production)
./manage-config.sh rebuild tldraw-sync  # Rebuild sync backend container

# Container rebuilds (development mode)
./manage-config.sh rebuild-dev tldraw   # Rebuild TLDraw container (development)
./manage-config.sh rebuild-dev          # Rebuild all containers (development)
```

**Manual Development (Advanced):**
```bash
# Frontend development (outside containers)
cd tldraw && npm run dev    # Development mode (port 3000)
cd tldraw && npm run build  # Production build
cd tldraw && npm run preview # Preview production build

# Sync backend development (outside containers)
cd tldraw-sync-backend && npm run dev   # Development with --watch
cd tldraw-sync-backend && npm start     # Production mode
```

**Development vs Production Modes:**

| Mode | Commands | Features | Use Case |
|------|----------|----------|----------|
| **Development** | `./manage-config.sh start-dev`<br>`./manage-config.sh rebuild-dev` | • Hot Module Reload<br>• Source maps<br>• Live code editing<br>• Debugging tools | Active development, testing changes |
| **Production** | `./manage-config.sh start`<br>`./manage-config.sh rebuild` | • Minified bundles<br>• Optimized assets<br>• Static file serving<br>• Better performance | Deployment, production use |

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

### Technology Stack

**Frontend Technologies:**
- **TLDraw**: React 18 + Vite 5 + @tldraw/tldraw ^2.0.0 + @tldraw/sync ^2.0.0
- **Draw.io**: Official jgraph/drawio Docker image
- **Excalidraw**: Official excalidraw/excalidraw Docker image
- **Nginx**: Alpine-based reverse proxy with HTTPS termination

**Backend Technologies:**
- **TLDraw Sync**: Node.js 20 + @tldraw/sync-core ^2.0.0 + WebSocket (ws ^8.18.0)
- **URL Unfurling**: unfurl.js ^6.4.0 for bookmark previews
- **File Storage**: Persistent volumes for rooms (.rooms) and assets (.assets)

**Infrastructure:**
- **Containerization**: Docker & Docker Compose with multi-service orchestration
- **Networking**: Isolated Docker network with internal service communication
- **SSL/TLS**: Auto-generated certificates with SAN support and HTTP → HTTPS redirect
- **Process Management**: Systemd service integration for production deployments

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

## Performance & Security

### Security Features
- **HTTPS by Default**: TLS 1.2+ with secure cipher suites
- **Security Headers**: HSTS, X-Frame-Options, CSP, XSS Protection
- **Container Isolation**: Services run in isolated Docker network
- **No Exposed Secrets**: Environment-based configuration management
- **Regular Updates**: Automated dependency scanning via GitHub Actions

### Performance Optimizations
- **Production Builds**: Minified JavaScript (350KB gzipped), optimized CSS
- **Static Asset Serving**: Nginx-based file serving with proper MIME types
- **WebSocket Efficiency**: Binary protocol for real-time collaboration
- **Resource Management**: Health checks and automatic cleanup of old data
- **Development Mode**: Hot Module Reload for instant code changes

## Requirements

- **Docker & Docker Compose** - Container orchestration
- **2GB+ RAM** - For all services running simultaneously  
- **Available Ports** - 80, 443, 8080 (or configured alternatives)
- **Modern Browser** - For accessing the diagramming tools

## Development & Contributing

### Local Development

**For Active Development:**
```bash
# Start in development mode with hot-reload
./manage-config.sh start-dev

# View logs for debugging
./manage-config.sh logs tldraw

# Make changes to source files - they'll be reflected immediately
# Files are in: ./tldraw/ and ./tldraw-sync-backend/
```

**For Testing/Production Deployment:**
```bash
# Start in production mode (optimized builds)
./manage-config.sh start

# View container status
./manage-config.sh status
```

### Adding New Tools
1. Add service to `docker-compose.yml`
2. Update `engine/nginx.conf` with proxy rules
3. Add tool card to `engine/html/index.html`

### Contributing
Found a bug or have an idea? Open an issue or submit a PR!

## 💡 Usage Tips & Best Practices

### TLDraw Collaboration Tips
- **Room Names**: Use descriptive room names like `/tldraw/project-design` or `/tldraw/team-brainstorm`
- **Color Shortcuts**: Press number keys 1-9 for instant color changes while drawing
- **Asset Sharing**: Paste images directly - they're automatically uploaded and shared with collaborators
- **URL Bookmarks**: Paste URLs to create rich bookmark cards with previews
- **Performance**: Use production mode (`./manage-config.sh start`) for best performance with multiple users

### Deployment Best Practices
- **Production**: Always use `./manage-config.sh start` for production deployments
- **Development**: Use `./manage-config.sh start-dev` only for active development
- **Monitoring**: Regularly check `./manage-config.sh tldraw-health` for system status
- **Maintenance**: Run `./manage-config.sh prune` periodically to clean up unused Docker resources
- **Backups**: Use `./manage-config.sh backup-config` before major updates

### Security Recommendations
- **Custom Certificates**: Replace self-signed certificates with proper SSL certificates for production
- **Firewall**: Restrict access to port 8080 to authorized users only
- **Updates**: Keep the system updated by pulling latest releases regularly
- **Room Cleanup**: Old rooms and assets are automatically cleaned up (configurable retention periods)

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
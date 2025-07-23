# Diagram Tools Hub

[![CI/CD Pipeline](https://github.com/vppillai/diagram-tools-hub/workflows/CI/CD%20Pipeline/badge.svg)](https://github.com/vppillai/diagram-tools-hub/actions/workflows/ci-cd.yml)
[![Security Scan](https://github.com/vppillai/diagram-tools-hub/workflows/Security%20Scan/badge.svg)](https://github.com/vppillai/diagram-tools-hub/actions/workflows/security.yml)
[![Release Management](https://github.com/vppillai/diagram-tools-hub/workflows/🚀%20Release%20Management/badge.svg)](https://github.com/vppillai/diagram-tools-hub/actions/workflows/release.yml)

A unified Docker setup that brings together three powerful diagramming tools under one roof:
- **Draw.io** - Professional diagrams and flowcharts
- **Excalidraw** - Hand-drawn style diagrams and wireframes  
- **TLDraw** - Modern collaborative drawing canvas

## Quick Start

Clone and run:

```bash
git clone https://github.com/vppillai/diagram-tools-hub.git
cd diagram-tools-hub
./manage-config.sh start
```

Then open http://localhost:8080 in your browser.

## What's Included

- **Unified Dashboard** - Single page to access all tools
- **Direct Links** - Each tool available at its own path
- **Real-time Status** - See which tools are online
- **Easy Management** - Simple scripts to start/stop/restart

## Access Points

- **Main Hub**: http://localhost:8080
- **Draw.io**: http://localhost:8080/drawio/
- **Excalidraw**: http://localhost:8080/excalidraw/
- **TLDraw**: http://localhost:8080/tldraw/

## Requirements

- Docker & Docker Compose
- 2GB+ RAM
- Port 8080 available

## Management

The `manage-config.sh` script handles most operations:

```bash
./manage-config.sh start      # Start all services
./manage-config.sh stop       # Stop all services  
./manage-config.sh restart    # Restart everything
./manage-config.sh status     # Check service status
./manage-config.sh logs       # View logs
./manage-config.sh rebuild    # Rebuild containers
```

## Auto-Start Service

Install as a systemd service for automatic startup on server reboot:

### Quick Installation

```bash
# Simple installation (recommended)
sudo ./install-service.sh

# Or use the management script directly
sudo ./manage-config.sh install-service
```

### Service Management

```bash
# Check service status
./manage-config.sh service-status

# Uninstall service (requires sudo)
sudo ./manage-config.sh uninstall-service
```

### Service Management

Once installed, you can manage the service using systemctl:

```bash
# Start the service
sudo systemctl start drawapp

# Stop the service
sudo systemctl stop drawapp

# Restart the service
sudo systemctl restart drawapp

# Check status
sudo systemctl status drawapp

# View logs
sudo journalctl -u drawapp -f

# Enable/disable auto-start
sudo systemctl enable drawapp   # Enable auto-start
sudo systemctl disable drawapp  # Disable auto-start
```

The service will automatically:
- Start on system boot
- Restart on failure
- Handle SSL certificate generation
- Manage Docker containers
- Provide proper logging

## HTTPS Support

### Automatic HTTPS

HTTPS is enabled by default with auto-generated self-signed certificates:

```bash
./manage-config.sh start
# Automatically generates SSL certificates and starts with HTTPS
# Access: https://localhost (HTTP redirects to HTTPS)
```

The system automatically:
- Generates RSA 2048-bit private keys
- Creates X.509 certificates valid for 365 days
- Uses Canada (CA) as the certificate country
- Includes Subject Alternative Names (SAN) for localhost and IP addresses
- Sets proper file permissions (600 for keys, 644 for certificates)

### Custom Certificate

Use your own SSL certificate:

```bash
./manage-config.sh start /path/to/cert.pem /path/to/key.pem
# Uses your custom certificates
```

Custom certificates are copied to `./certs/` directory and configured automatically.

### HTTP-Only Mode

Switch to HTTP-only (no SSL):

```bash
./manage-config.sh http-only
# Switches to HTTP-only mode on configured HTTP_PORT
```

### Certificate Details

#### Auto-Generated Certificates:
- **Country**: CA (Canada)
- **Organization**: Diagram Tools Hub
- **Validity**: 365 days
- **Key Size**: RSA 2048-bit
- **Extensions**: Subject Alternative Names for localhost, *.localhost, 127.0.0.1, ::1
- **Location**: `./certs/cert.pem` and `./certs/key.pem`

#### Certificate Configuration:
The SSL domain can be configured in `.env`:
```bash
SSL_DOMAIN=your-domain.com
```

### HTTPS Features

- **Automatic Setup** - SSL certificates generated automatically if not present
- **HTTP → HTTPS Redirect** - All HTTP traffic redirects to HTTPS  
- **Security Headers** - HSTS, X-Frame-Options, X-Content-Type-Options, X-XSS-Protection
- **Modern TLS** - TLS 1.2/1.3 with secure cipher suites
- **Configurable Ports** - HTTPS_PORT and HTTP_REDIRECT_PORT via .env
- **Certificate Management** - Auto-generation, custom certificates, or HTTP-only mode
- **Browser Compatibility** - Works with all modern browsers (accept security warning for self-signed)

## Configuration

### Environment Variables

The `.env` file allows you to customize ports and other settings:

```bash
# External Port Configuration
HTTP_PORT=8080              # HTTP port (when HTTPS is disabled)
HTTPS_PORT=443              # HTTPS port
HTTP_REDIRECT_PORT=80       # HTTP redirect port (when HTTPS is enabled)

# SSL Configuration
SSL_DOMAIN=localhost        # Domain for SSL certificate generation

# TLDraw settings
TLDRAW_DEBUG_PANEL=false

# Development settings  
NODE_ENV=production
ENABLE_ANALYTICS=false
ENABLE_TELEMETRY=false

# Vite Development Server (TLDraw)
VITE_ALLOWED_HOSTS=draw.embeddedinn.ca,localhost,127.0.0.1
```

### Vite Development Server Configuration

The TLDraw application uses Vite as its development server. To allow access from specific hostnames, configure the `VITE_ALLOWED_HOSTS` environment variable:

```bash
# Comma-separated list of allowed hostnames
VITE_ALLOWED_HOSTS=draw.embeddedinn.ca,localhost,127.0.0.1,your-domain.com
```

**Default allowed hosts**: `localhost`, `127.0.0.1`

**Note**: If you encounter "Blocked request" errors when accessing the development server from external hostnames, add the hostname to this list.

### Custom Ports

Simply update the `.env` file to use different ports:

```bash
# Use custom ports
HTTP_PORT=9000
HTTPS_PORT=8443
HTTP_REDIRECT_PORT=8080
```

Then restart the services:
```bash
./manage-config.sh restart
```

## Architecture

- **Engine** (Nginx) - Serves the dashboard and routes traffic
- **Draw.io** - Professional diagramming tool
- **Excalidraw** - Hand-drawn style diagrams
- **TLDraw** - Modern collaborative canvas

## Troubleshooting

### Services won't start

Check if ports are in use:
```bash
lsof -i :8080-8083
```

### View logs

```bash
./manage-config.sh logs
# or
docker-compose logs -f
```

### HTTPS Issues

**Browser security warning:**
```bash
# Normal for self-signed certificates
# Click "Advanced" → "Proceed to localhost"
```

**Port conflicts:**
```bash
# Check what's using your ports
sudo lsof -i :80
sudo lsof -i :443

# Use custom ports in .env
HTTPS_PORT=8443
HTTP_REDIRECT_PORT=8080
```

**Certificate regeneration:**
```bash
# Remove existing certificates to regenerate
rm -rf ./certs/
./manage-config.sh restart
```

**Container conflicts:**
```bash
# Clean up conflicting containers
./manage-config.sh cleanup
./manage-config.sh start
```

### Rebuild containers

```bash
./manage-config.sh rebuild
```

### TLDraw build issues

TLDraw builds from source. If it fails:

```bash
docker-compose build --no-cache tldraw
```

## Development

### Local development

```bash
# Start with development settings
NODE_ENV=development docker-compose up -d

# View logs
docker-compose logs -f tldraw
```

### Adding new tools

1. Add service to `docker-compose.yml`
2. Update `engine/nginx.conf` with proxy rules
3. Add tool card to `engine/html/index.html`

## Releases

Docker images are automatically built and published on releases:

```bash
# Pull latest images
docker pull ghcr.io/vppillai/diagram-tools-hub/tldraw:latest
docker pull ghcr.io/vppillai/diagram-tools-hub/engine:latest
```

## Contributing

Found a bug or have an idea? Open an issue or submit a PR!

## License

This project is open source. The individual tools have their own licenses:
- Draw.io: Apache 2.0
- Excalidraw: MIT  
- TLDraw: Apache 2.0 
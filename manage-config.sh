#!/bin/bash

# Diagram Tools Hub Configuration Manager

set -e  # Exit on any error

# Load environment variables
load_env() {
    if [ -f ".env" ]; then
        export $(grep -v '^#' .env | xargs)
    fi
    
    # Set defaults if not specified
    export HTTP_PORT=${HTTP_PORT:-8080}
    export HTTPS_PORT=${HTTPS_PORT:-443}
    export SSL_DOMAIN=${SSL_DOMAIN:-localhost}
}

# Load environment variables at startup
load_env

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_help() {
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "Container Management Commands:"
    echo "  start [CERT] [KEY]      Start all services in production mode (auto-generates SSL if not provided)"
    echo "  start-dev [CERT] [KEY]  Start all services in development mode"
    echo "  stop [SERVICE]          Stop all services or specific service"
    echo "  restart [SERVICE]       Restart all services or specific service"
    echo "  rebuild [SERVICE]       Rebuild and restart all services or specific service (production)"
    echo "  rebuild-dev [SERVICE]   Rebuild and restart all services or specific service (development)"
    echo "  rebuild-only [SERVICE]  Rebuild specific service without restarting"
    echo "  clean                   Stop and remove all containers, networks, and images"
    echo "  clean-rebuild           Clean everything and rebuild from scratch"
    echo "  status                  Show status of all containers"
    echo "  logs [SERVICE]          Show logs for all services or specific service"
    echo ""
    echo "Service Management Commands:"
    echo "  install-service         Install as systemd service for auto-start on boot"
    echo "  uninstall-service       Remove systemd service"
    echo "  service-status          Show systemd service status"
    echo ""
    echo "Configuration Commands:"
    echo "  show                    Show current configuration"
    echo "  http-only               Disable HTTPS and use HTTP only"
    echo "  cleanup                 Remove conflicting containers and networks"
    echo ""
    echo "Maintenance Commands:"
    echo "  prune                   Remove unused Docker resources"
    echo "  backup-config           Backup current configuration"
    echo "  restore-config [FILE]   Restore configuration from backup"
    echo ""
    echo "TLDraw Monitoring Commands:"
    echo "  tldraw-monitor           Show comprehensive TLDraw system monitoring dashboard"
    echo "  tldraw-rooms             Show TLDraw room statistics and collaboration usage"
    echo "  tldraw-health            Show TLDraw sync backend health and API status"
    echo "  system-metrics           Show detailed Docker container performance metrics"
    echo "  system-stats             Show real-time container resource usage"
    echo ""
    echo "Examples:"
    echo "  $0 start                        # Start in production mode with auto-generated SSL"
    echo "  $0 start-dev                    # Start in development mode with hot-reload"
    echo "  $0 start cert.pem key.pem       # Start with custom certificates"
    echo "  $0 restart tldraw               # Restart only TLDraw service"
    echo "  $0 rebuild tldraw-sync          # Rebuild and restart TLDraw sync service (production)"
    echo "  $0 rebuild-dev tldraw           # Rebuild and restart TLDraw service (development)"
    echo "  $0 rebuild-only engine          # Rebuild engine without restarting"
    echo "  $0 stop drawio                  # Stop only Draw.io service"
    echo "  $0 logs tldraw                  # Show tldraw logs"
    echo "  $0 status                       # Show container status"
    echo "  sudo $0 install-service         # Install as systemd service"
    echo "  sudo $0 uninstall-service       # Remove systemd service"
    echo ""
    echo "Available services: engine, drawio, excalidraw, tldraw, tldraw-sync"
    echo ""
    echo "Note: SSL certificates are automatically generated if not present."
    echo "      Use 'http-only' command to disable HTTPS."
    echo "      Service installation requires root privileges (sudo)."
}

show_config() {
    echo "Current Configuration:"
    echo "====================="
    if [ -f .env ]; then
        cat .env
    else
        echo "No .env file found. Using default settings."
        if [ -f .env.example ]; then
            cat .env.example
        else
            echo "No .env.example file found."
        fi
    fi
}

start_services() {
    local cert_file="$2"
    local key_file="$3"
    
    # Handle SSL setup automatically
    setup_ssl_auto "$cert_file" "$key_file"
    
    log_info "Starting all services..."
    
    # Stop any existing containers first to avoid conflicts
    sudo docker compose down 2>/dev/null || true
    
    # Ensure all configuration files exist
    ensure_configs_exist
    
    sudo docker compose up -d
    log_success "All services started successfully!"
    
    # Show access information
    if [ -f "./certs/cert.pem" ] && [ -f "./certs/key.pem" ]; then
        log_info "HTTPS is configured. Services available at:"
        if [ "$HTTPS_PORT" = "443" ]; then
            log_info "  🔒 https://localhost (Main hub)"
        else
            log_info "  🔒 https://localhost:$HTTPS_PORT (Main hub)"
        fi
        log_warning "If using self-signed certificates, accept the browser security warning."
    else
        log_info "Services available at:"
        log_info "  🌐 http://localhost:$HTTP_PORT (Main hub)"
    fi
    
    show_status
}

start_dev_services() {
    local cert_file="$2"
    local key_file="$3"
    
    # Handle SSL setup automatically
    setup_ssl_auto "$cert_file" "$key_file"
    
    log_info "Starting all services in development mode..."
    log_warning "Development mode: TLDraw will have hot-reload enabled and serve from source"
    
    # Stop any existing containers first to avoid conflicts
    sudo docker compose down 2>/dev/null || true
    
    # Ensure all configuration files exist
    ensure_configs_exist
    
    # Use both compose files - main + dev overrides
    sudo docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
    log_success "All services started successfully in development mode!"
    
    # Show access information
    if [ -f "./certs/cert.pem" ] && [ -f "./certs/key.pem" ]; then
        log_info "HTTPS is configured. Services available at:"
        if [ "$HTTPS_PORT" = "443" ]; then
            log_info "  🔒 https://localhost (Main hub)"
        else
            log_info "  🔒 https://localhost:$HTTPS_PORT (Main hub)"
        fi
        log_info "  🔧 TLDraw: Development mode with hot-reload"
        log_warning "If using self-signed certificates, accept the browser security warning."
    else
        log_info "Services available at:"
        log_info "  🌐 http://localhost:$HTTP_PORT (Main hub)"
        log_info "  🔧 TLDraw: Development mode with hot-reload"
    fi
    
    show_status
}

stop_services() {
    local service="$2"
    
    if [ -n "$service" ]; then
        log_info "Stopping $service service..."
        sudo docker compose stop "$service"
        log_success "$service service stopped successfully!"
    else
        log_info "Stopping all services..."
        sudo docker compose down
        log_success "All services stopped successfully!"
    fi
}

restart_services() {
    local service="$2"
    local cert_file="$3"
    local key_file="$4"
    
    if [ -n "$service" ]; then
        log_info "Restarting $service service..."
        sudo docker compose restart "$service"
        log_success "$service service restarted successfully!"
        show_status
    else
        log_info "Restarting all services..."
        sudo docker compose down
        
        # Handle SSL setup automatically
        setup_ssl_auto "$cert_file" "$key_file"
        
        # Ensure all configuration files exist
        ensure_configs_exist
        
        sudo docker compose up -d
        log_success "All services restarted successfully!"
        
        # Show access information
        if [ -f "./certs/cert.pem" ] && [ -f "./certs/key.pem" ]; then
            log_info "HTTPS is configured. Services available at:"
            if [ "$HTTPS_PORT" = "443" ]; then
                log_info "  🔒 https://localhost (Main hub)"
            else
                log_info "  🔒 https://localhost:$HTTPS_PORT (Main hub)"
            fi
            log_warning "If using self-signed certificates, accept the browser security warning."
        else
            log_info "Services available at:"
            log_info "  🌐 http://localhost:$HTTP_PORT (Main hub)"
        fi
        
        show_status
    fi
}

rebuild_services() {
    local service="$2"
    local cert_file="$3"
    local key_file="$4"
    
    if [ -n "$service" ]; then
        log_info "Rebuilding and restarting $service service..."
        sudo docker compose build --no-cache "$service"
        sudo docker compose up -d "$service"
        log_success "$service service rebuilt and started successfully!"
        show_status
    else
        log_info "Rebuilding and restarting all services..."
        sudo docker compose down
        
        # Handle SSL setup automatically
        setup_ssl_auto "$cert_file" "$key_file"
        
        # Ensure all configuration files exist
        ensure_configs_exist
        
        sudo docker compose build --no-cache
        sudo docker compose up -d
        log_success "All services rebuilt and started successfully!"
        
        # Show access information
        if [ -f "./certs/cert.pem" ] && [ -f "./certs/key.pem" ]; then
            log_info "HTTPS is configured. Services available at:"
            if [ "$HTTPS_PORT" = "443" ]; then
                log_info "  🔒 https://localhost (Main hub)"
            else
                log_info "  🔒 https://localhost:$HTTPS_PORT (Main hub)"
            fi
            log_warning "If using self-signed certificates, accept the browser security warning."
        else
            log_info "Services available at:"
            log_info "  🌐 http://localhost:$HTTP_PORT (Main hub)"
        fi
        
        show_status
    fi
}

rebuild_dev_services() {
    local service="$2"
    local cert_file="$3"
    local key_file="$4"
    
    if [ -n "$service" ]; then
        log_info "Rebuilding and restarting $service service in development mode..."
        sudo docker compose -f docker-compose.yml -f docker-compose.dev.yml build --no-cache "$service"
        sudo docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d "$service"
        log_success "$service service rebuilt and started successfully in development mode!"
        show_status
    else
        log_info "Rebuilding and restarting all services in development mode..."
        log_warning "Development mode: TLDraw will have hot-reload enabled and serve from source"
        sudo docker compose down
        
        # Handle SSL setup automatically
        setup_ssl_auto "$cert_file" "$key_file"
        
        # Ensure all configuration files exist
        ensure_configs_exist
        
        sudo docker compose -f docker-compose.yml -f docker-compose.dev.yml build --no-cache
        sudo docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
        log_success "All services rebuilt and started successfully in development mode!"
        
        # Show access information
        if [ -f "./certs/cert.pem" ] && [ -f "./certs/key.pem" ]; then
            log_info "HTTPS is configured. Services available at:"
            if [ "$HTTPS_PORT" = "443" ]; then
                log_info "  🔒 https://localhost (Main hub)"
            else
                log_info "  🔒 https://localhost:$HTTPS_PORT (Main hub)"
            fi
            log_info "  🔧 TLDraw: Development mode with hot-reload"
            log_warning "If using self-signed certificates, accept the browser security warning."
        else
            log_info "Services available at:"
            log_info "  🌐 http://localhost:$HTTP_PORT (Main hub)"
            log_info "  🔧 TLDraw: Development mode with hot-reload"
        fi
        
        show_status
    fi
}

rebuild_only() {
    local service="$2"
    
    if [ -z "$service" ]; then
        log_error "Service name required for rebuild-only command"
        echo "Usage: $0 rebuild-only <service>"
        echo "Available services: engine, drawio, excalidraw, tldraw, tldraw-sync"
        exit 1
    fi
    
    log_info "Rebuilding $service service without restarting..."
    sudo docker compose build --no-cache "$service"
    log_success "$service service rebuilt successfully! Use 'restart $service' to apply changes."
}

clean_containers() {
    log_warning "This will stop and remove ALL containers, networks, and images!"
    read -p "Are you sure you want to continue? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Cleaning all Docker resources..."
        
        # Stop and remove containers
        sudo docker compose down --remove-orphans --volumes --rmi all
        
        # Remove any remaining containers
        sudo docker container prune -f
        
        # Remove any remaining networks
        sudo docker network prune -f
        
        # Remove any remaining images
        sudo docker image prune -a -f
        
        log_success "All Docker resources cleaned successfully!"
    else
        log_info "Clean operation cancelled."
    fi
}

clean_rebuild() {
    log_warning "This will completely clean everything and rebuild from scratch!"
    read -p "Are you sure you want to continue? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Performing complete clean and rebuild..."
        
        # Clean everything
        sudo docker compose down --remove-orphans --volumes --rmi all
        sudo docker system prune -a -f --volumes
        
        # Ensure all configuration files exist before rebuild
        ensure_configs_exist
        
        # Rebuild from scratch
        sudo docker compose build --no-cache
        sudo docker compose up -d
        
        log_success "Complete clean and rebuild completed successfully!"
        show_status
    else
        log_info "Clean rebuild operation cancelled."
    fi
}

show_status() {
    log_info "Container Status:"
    echo "=================="
    sudo docker compose ps
    echo ""
    
    # Show resource usage
    log_info "Resource Usage:"
    echo "================"
    sudo docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"
}

show_logs() {
    local service="$2"
    if [ -n "$service" ]; then
        log_info "Showing logs for $service..."
        sudo docker compose logs -f "$service"
    else
        log_info "Showing logs for all services..."
        sudo docker compose logs -f
    fi
}

setup_ssl_auto() {
    local cert_file="$1"
    local key_file="$2"
    local cert_dir="./certs"
    local domain="$SSL_DOMAIN"
    
    # Create certificates directory
    mkdir -p "$cert_dir"
    
    # If custom cert and key provided, use them
    if [ -n "$cert_file" ] && [ -n "$key_file" ]; then
        if [ ! -f "$cert_file" ]; then
            log_error "Certificate file not found: $cert_file"
            exit 1
        fi
        
        if [ ! -f "$key_file" ]; then
            log_error "Key file not found: $key_file"
            exit 1
        fi
        
        log_info "Using custom SSL certificates..."
        
        # Copy certificate files
        cp "$cert_file" "$cert_dir/cert.pem"
        cp "$key_file" "$cert_dir/key.pem"
        
        # Set proper permissions
        chmod 600 "$cert_dir/key.pem"
        chmod 644 "$cert_dir/cert.pem"
        
        log_success "Custom SSL certificates installed successfully!"
        
    # If certificates don't exist, generate them automatically
    elif [ ! -f "$cert_dir/cert.pem" ] || [ ! -f "$cert_dir/key.pem" ]; then
        log_info "SSL certificates not found. Generating self-signed certificate for $domain..."
        
        # Generate private key
        openssl genrsa -out "$cert_dir/key.pem" 2048 2>/dev/null
        
        # Generate certificate
        openssl req -new -x509 -key "$cert_dir/key.pem" -out "$cert_dir/cert.pem" -days 365 \
            -subj "/C=CA/ST=Local/L=Local/O=Diagram Tools Hub/OU=IT/CN=$domain" \
            -extensions v3_req \
            -config <(echo "
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
C=CA
ST=Local
L=Local
O=Diagram Tools Hub
OU=IT
CN=$domain

[v3_req]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = $domain
DNS.2 = *.${domain}
DNS.3 = localhost
IP.1 = 127.0.0.1
IP.2 = ::1
") 2>/dev/null || openssl req -new -x509 -key "$cert_dir/key.pem" -out "$cert_dir/cert.pem" -days 365 \
            -subj "/C=CA/ST=Local/L=Local/O=Diagram Tools Hub/OU=IT/CN=$domain" 2>/dev/null
        
        # Set proper permissions
        chmod 600 "$cert_dir/key.pem"
        chmod 644 "$cert_dir/cert.pem"
        
        log_success "SSL certificate generated successfully!"
        log_info "Certificate: $cert_dir/cert.pem"
        log_info "Private Key: $cert_dir/key.pem"
        log_info "Valid for: 365 days"
        
    else
        log_info "Using existing SSL certificates."
    fi
    
    # Always ensure HTTPS configuration is enabled
    enable_https_config
    
    # Force reload environment variables in case they changed
    load_env
}

enable_https_config() {
    log_info "Enabling HTTPS configuration..."
    
    # Create or update nginx configuration for HTTPS
    create_https_nginx_config
    
    # Update docker-compose for HTTPS
    update_docker_compose_https
    
    log_success "HTTPS configuration enabled!"
    log_info "Services will be available at:"
    log_info "  - https://localhost:$HTTPS_PORT (Main hub)"
    log_warning "If using self-signed certificates, you'll need to accept the security warning in your browser."
}

http_only() {
    log_info "Switching to HTTP-only mode..."
    
    # Restore original nginx configuration
    if [ -f "./engine/nginx.conf.backup" ]; then
        cp "./engine/nginx.conf.backup" "./engine/nginx.conf"
        log_info "Restored original nginx configuration"
    else
        log_warning "No backup nginx configuration found. Creating HTTP-only configuration."
        create_http_only_config
    fi
    
    # Restore original docker-compose configuration
    if [ -f "./docker-compose.yml.backup" ]; then
        cp "./docker-compose.yml.backup" "./docker-compose.yml"
        log_info "Restored original docker-compose configuration"
    else
        log_warning "No backup docker-compose configuration found. Creating HTTP-only configuration."
        create_http_only_docker_compose
    fi
    
    # Restart services
    log_info "Restarting services in HTTP-only mode..."
    sudo docker compose down 2>/dev/null || true
    sudo docker compose up -d
    
    log_success "Switched to HTTP-only mode successfully!"
    log_info "Services available at:"
    log_info "  🌐 http://localhost:$HTTP_PORT (Main hub)"
}

cleanup_containers() {
    log_info "Cleaning up conflicting containers and networks..."
    
    # Stop and remove containers
    sudo docker compose down --remove-orphans 2>/dev/null || true
    
    # Remove specific containers that might conflict
    sudo docker rm -f diagram-engine drawio-app excalidraw-app tldraw-app tldraw-sync-app 2>/dev/null || true
    
    # Remove networks that might conflict
    sudo docker network rm diagram-tools-network 2>/dev/null || true
    
    # Clean up any dangling resources
    sudo docker container prune -f 2>/dev/null || true
    sudo docker network prune -f 2>/dev/null || true
    
    log_success "Cleanup completed! You can now start services normally."
}

create_https_nginx_config() {
    local nginx_conf="./engine/nginx.conf"
    
    # Backup original configuration only if it exists
    if [ -f "$nginx_conf" ] && [ ! -f "$nginx_conf.backup" ]; then
        cp "$nginx_conf" "$nginx_conf.backup"
        log_info "Backed up original nginx configuration"
    fi
    
    # Create HTTPS nginx configuration
    cat > "$nginx_conf" << 'EOF'
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # SSL Configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-SHA384:ECDHE-RSA-AES128-SHA256;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    upstream drawio_backend {
        server drawio:8080;
    }

    upstream excalidraw_backend {
        server excalidraw:80;
    }

    upstream tldraw_backend {
        server tldraw:3000;
    }

    upstream tldraw_sync_backend {
        server tldraw-sync:3001;
    }

    # HTTPS server
    server {
        listen 443 ssl http2;
        server_name _;

        # SSL certificates
        ssl_certificate /etc/ssl/certs/cert.pem;
        ssl_certificate_key /etc/ssl/private/key.pem;

        # Security headers
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header X-Frame-Options DENY always;
        add_header X-Content-Type-Options nosniff always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;

        # Main landing page
        location / {
            root /usr/share/nginx/html;
            index index.html;
        }

        # Draw.io reverse proxy
        location /drawio {
            return 301 /drawio/;
        }

        location /drawio/ {
            proxy_pass http://drawio_backend/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # WebSocket support
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }

        # Excalidraw reverse proxy
        location /excalidraw {
            return 301 /excalidraw/;
        }

        location /excalidraw/ {
            proxy_pass http://excalidraw_backend/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # WebSocket support
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }

        # Handle Excalidraw assets that are requested from root (not under /tldraw)
        location ~ ^/(?!tldraw)(assets|manifest\.webmanifest) {
            proxy_pass http://excalidraw_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # TLDraw reverse proxy - handle both /tldraw/ and /tldraw/room-name
        location /tldraw {
            return 301 /tldraw/;
        }

        # Handle TLDraw production assets (static files need path rewriting)
        location ~ ^/tldraw/assets/.*\.(js|css)$ {
            rewrite ^/tldraw(.*)$ $1 break;
            proxy_pass http://tldraw_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Handle all other TLDraw requests (dev server needs full path)
        location /tldraw/ {
            proxy_pass http://tldraw_backend/tldraw/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # WebSocket support (for Vite dev server)
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }

        # TLDraw Sync reverse proxy for all endpoints
        location /tldraw-sync/ {
            # Rewrite /tldraw-sync/ to / for the backend
            rewrite ^/tldraw-sync/(.*)$ /$1 break;
            proxy_pass http://tldraw_sync_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # WebSocket support
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }

        # Handle favicon.ico requests
        location = /favicon.ico {
            return 204;
            add_header Content-Type image/x-icon;
        }

        # Health check endpoint
        location /health {
            return 200 "OK\n";
            add_header Content-Type text/plain;
        }
        
    }
}
EOF

    log_info "Created HTTPS nginx configuration"
}

update_docker_compose_https() {
    local compose_file="./docker-compose.yml"
    
    # Backup original configuration only if backup doesn't exist
    if [ -f "$compose_file" ] && [ ! -f "$compose_file.backup" ]; then
        cp "$compose_file" "$compose_file.backup"
        log_info "Backed up original docker-compose configuration"
    fi
    
    # Create HTTPS docker-compose configuration
    cat > "$compose_file" << EOF
services:
  # Engine server - Nginx with HTTPS support
  engine:
    image: nginx:alpine
    container_name: diagram-engine
    ports:
      - "$HTTPS_PORT:443"  # HTTPS only
    volumes:
      - ./engine/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./engine/html:/usr/share/nginx/html:ro
      - ./certs/cert.pem:/etc/ssl/certs/cert.pem:ro
      - ./certs/key.pem:/etc/ssl/private/key.pem:ro
    depends_on:
      - drawio
      - excalidraw
      - tldraw
      - tldraw-sync
    restart: unless-stopped

  # Draw.io container
  drawio:
    image: jgraph/drawio
    container_name: drawio-app
    environment:
      - DRAWIO_BASE_URL=/drawio
    restart: unless-stopped

  # Excalidraw container
  excalidraw:
    image: excalidraw/excalidraw:latest
    container_name: excalidraw-app
    restart: unless-stopped

  # TLDraw container - using a custom build since there's no official image
  tldraw:
    build:
      context: ./tldraw
      dockerfile: Dockerfile
    container_name: tldraw-app
    restart: unless-stopped

  # TLDraw Sync backend - real-time collaboration server
  tldraw-sync:
    build:
      context: ./tldraw-sync-backend
      dockerfile: Dockerfile
    container_name: tldraw-sync-app
    volumes:
      - ./tldraw-sync-backend/.rooms:/app/.rooms
      - ./tldraw-sync-backend/.assets:/app/.assets
    restart: unless-stopped

networks:
  default:
    name: diagram-tools-network
EOF

    log_info "Updated docker-compose configuration for HTTPS"
}

create_http_only_config() {
    local nginx_conf="./engine/nginx.conf"
    
    # Create HTTP-only nginx configuration (fallback to original design)
    cat > "$nginx_conf" << 'EOF'
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    upstream drawio_backend {
        server drawio:8080;
    }

    upstream excalidraw_backend {
        server excalidraw:80;
    }

    upstream tldraw_backend {
        server tldraw:3000;
    }

    upstream tldraw_sync_backend {
        server tldraw-sync:3001;
    }

    server {
        listen 80;
        server_name localhost;

        # Main landing page
        location / {
            root /usr/share/nginx/html;
            index index.html;
        }

        # Draw.io reverse proxy
        location /drawio {
            return 301 /drawio/;
        }

        location /drawio/ {
            proxy_pass http://drawio_backend/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # WebSocket support
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }

        # Excalidraw reverse proxy
        location /excalidraw {
            return 301 /excalidraw/;
        }

        location /excalidraw/ {
            proxy_pass http://excalidraw_backend/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # WebSocket support
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }

        # Handle Excalidraw assets that are requested from root (not under /tldraw)
        location ~ ^/(?!tldraw)(assets|manifest\.webmanifest) {
            proxy_pass http://excalidraw_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # TLDraw reverse proxy - handle both /tldraw/ and /tldraw/room-name
        location /tldraw {
            return 301 /tldraw/;
        }

        # Handle TLDraw production assets (static files need path rewriting)
        location ~ ^/tldraw/assets/.*\.(js|css)$ {
            rewrite ^/tldraw(.*)$ $1 break;
            proxy_pass http://tldraw_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Handle all other TLDraw requests (dev server needs full path)
        location /tldraw/ {
            proxy_pass http://tldraw_backend/tldraw/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # WebSocket support (for Vite dev server)
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }

        # TLDraw Sync reverse proxy for all endpoints
        location /tldraw-sync/ {
            # Rewrite /tldraw-sync/ to / for the backend
            rewrite ^/tldraw-sync/(.*)$ /$1 break;
            proxy_pass http://tldraw_sync_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # WebSocket support
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }

        # Handle favicon.ico requests
        location = /favicon.ico {
            return 204;
            add_header Content-Type image/x-icon;
        }

        # Health check endpoint
        location /health {
            return 200 "OK\n";
            add_header Content-Type text/plain;
        }
    }
}
EOF

    log_info "Created HTTP-only nginx configuration"
}

create_http_only_docker_compose() {
    local compose_file="./docker-compose.yml"
    
    # Create HTTP-only docker-compose configuration
    cat > "$compose_file" << EOF
services:
  # Engine server - Nginx with custom landing page
  engine:
    image: nginx:alpine
    container_name: diagram-engine
    ports:
      - "$HTTP_PORT:80"
    volumes:
      - ./engine/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./engine/html:/usr/share/nginx/html:ro
    depends_on:
      - drawio
      - excalidraw
      - tldraw
      - tldraw-sync
    restart: unless-stopped

  # Draw.io container
  drawio:
    image: jgraph/drawio
    container_name: drawio-app
    environment:
      - DRAWIO_BASE_URL=/drawio
    restart: unless-stopped

  # Excalidraw container
  excalidraw:
    image: excalidraw/excalidraw:latest
    container_name: excalidraw-app
    restart: unless-stopped

  # TLDraw container - using a custom build since there's no official image
  tldraw:
    build:
      context: ./tldraw
      dockerfile: Dockerfile
    container_name: tldraw-app
    restart: unless-stopped

  # TLDraw Sync backend - real-time collaboration server
  tldraw-sync:
    build:
      context: ./tldraw-sync-backend
      dockerfile: Dockerfile
    container_name: tldraw-sync-app
    volumes:
      - ./tldraw-sync-backend/.rooms:/app/.rooms
      - ./tldraw-sync-backend/.assets:/app/.assets
    restart: unless-stopped

networks:
  default:
    name: diagram-tools-network
EOF

    log_info "Created HTTP-only docker-compose configuration"
}

ensure_configs_exist() {
    log_info "Ensuring all configuration files exist..."
    
    # Check if nginx.conf exists
    if [ ! -f "./engine/nginx.conf" ]; then
        log_info "nginx.conf not found, creating configuration..."
        if [ -f "./certs/cert.pem" ] && [ -f "./certs/key.pem" ]; then
            create_https_nginx_config
        else
            create_http_only_config
        fi
    fi
    
    # Check if docker-compose.yml exists or needs regeneration
    if [ ! -f "./docker-compose.yml" ]; then
        log_error "docker-compose.yml not found. This file should exist in the project."
        exit 1
    fi
    
    # Ensure environment variables are used in compose file
    ensure_env_variables_in_compose
    
    log_info "Configuration files validated."
}

ensure_env_variables_in_compose() {
    local compose_file="./docker-compose.yml"
    
    # Check if docker-compose.yml uses hardcoded ports and fix them
    if grep -q '"80:80"' "$compose_file" || grep -q '"443:443"' "$compose_file"; then
        log_info "Updating docker-compose.yml to use environment variables..."
        
        # Update hardcoded ports to use environment variables
        sed -i 's/"80:80"/"${HTTP_REDIRECT_PORT:-80}:80"/g' "$compose_file"
        sed -i 's/"443:443"/"${HTTPS_PORT:-443}:443"/g' "$compose_file"
        
        log_info "Docker-compose.yml updated to use configurable ports"
    fi
}



prune_docker() {
    log_info "Removing unused Docker resources..."
    sudo docker system prune -f
    log_success "Docker resources pruned successfully!"
}

backup_config() {
    local backup_file="config-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
    log_info "Creating configuration backup: $backup_file"
    
    tar -czf "$backup_file" \
        --exclude='.git' \
        --exclude='node_modules' \
        --exclude='*.log' \
        --exclude='*.tmp' \
        .env docker-compose.yml engine/ tldraw/ 2>/dev/null || true
    
    if [ -f "$backup_file" ]; then
        log_success "Configuration backed up to: $backup_file"
    else
        log_error "Failed to create backup"
        exit 1
    fi
}

restore_config() {
    local backup_file="$2"
    if [ -z "$backup_file" ]; then
        log_error "Please specify a backup file to restore from"
        echo "Usage: $0 restore-config <backup-file>"
        exit 1
    fi
    
    if [ ! -f "$backup_file" ]; then
        log_error "Backup file not found: $backup_file"
        exit 1
    fi
    
    log_warning "This will overwrite current configuration!"
    read -p "Are you sure you want to restore from $backup_file? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Restoring configuration from $backup_file..."
        tar -xzf "$backup_file"
        log_success "Configuration restored successfully!"
    else
        log_info "Restore operation cancelled."
    fi
}

# Check if docker-compose.yml exists
if [ ! -f "docker-compose.yml" ]; then
    log_error "docker-compose.yml not found. Please run this script from the project root directory."
    exit 1
fi

# Check if Docker is running
if ! sudo docker info >/dev/null 2>&1; then
    log_error "Docker is not running. Please start Docker and try again."
    exit 1
fi


# Service management functions
install_service() {
    local service_file="drawapp.service"
    local systemd_dir="/etc/systemd/system"
    local current_dir=$(pwd)
    local current_user=$(whoami)
    
    log_info "Installing DrawApp systemd service..."
    
    # Check if running as root or with sudo
    if [ "$EUID" -ne 0 ]; then
        log_error "Service installation requires root privileges. Please run with sudo."
        echo "Usage: sudo $0 install-service"
        exit 1
    fi
    
    # Check if service file exists
    if [ ! -f "$service_file" ]; then
        log_error "Service file not found: $service_file"
        exit 1
    fi
    
    # Update service file with current paths
    log_info "Updating service file with current paths..."
    sed -i "s|WorkingDirectory=.*|WorkingDirectory=$current_dir|g" "$service_file"
    sed -i "s|ExecStart=.*|ExecStart=$current_dir/manage-config.sh start|g" "$service_file"
    sed -i "s|ExecStop=.*|ExecStop=$current_dir/manage-config.sh stop|g" "$service_file"
    sed -i "s|ExecReload=.*|ExecReload=$current_dir/manage-config.sh restart|g" "$service_file"
    sed -i "s|ReadWritePaths=.*|ReadWritePaths=$current_dir|g" "$service_file"
    
    # Copy service file to systemd directory
    log_info "Copying service file to $systemd_dir..."
    cp "$service_file" "$systemd_dir/"
    chmod 644 "$systemd_dir/$service_file"
    
    # Reload systemd and enable service
    log_info "Reloading systemd daemon..."
    systemctl daemon-reload
    
    log_info "Enabling DrawApp service for auto-start..."
    systemctl enable drawapp.service
    
    log_success "DrawApp service installed and enabled successfully!"
    log_info "Service will auto-start on system boot."
    log_info "Use 'sudo systemctl start drawapp' to start now"
    log_info "Use 'sudo systemctl status drawapp' to check status"
    log_info "Use 'sudo systemctl stop drawapp' to stop"
    log_info "Use 'sudo systemctl restart drawapp' to restart"
}

uninstall_service() {
    log_info "Uninstalling DrawApp systemd service..."
    
    # Check if running as root or with sudo
    if [ "$EUID" -ne 0 ]; then
        log_error "Service uninstallation requires root privileges. Please run with sudo."
        echo "Usage: sudo $0 uninstall-service"
        exit 1
    fi
    
    # Stop and disable service
    log_info "Stopping and disabling service..."
    systemctl stop drawapp.service 2>/dev/null || true
    systemctl disable drawapp.service 2>/dev/null || true
    
    # Remove service file
    log_info "Removing service file..."
    rm -f /etc/systemd/system/drawapp.service
    
    # Reload systemd
    log_info "Reloading systemd daemon..."
    systemctl daemon-reload
    
    log_success "DrawApp service uninstalled successfully!"
}

service_status() {
    if systemctl is-active --quiet drawapp.service; then
        log_success "DrawApp service is running"
        systemctl status drawapp.service --no-pager -l
    elif systemctl is-enabled --quiet drawapp.service; then
        log_warning "DrawApp service is enabled but not running"
        systemctl status drawapp.service --no-pager -l
    else
        log_info "DrawApp service is not installed or not enabled"
    fi
}

# Simple JSON parsing helper
parse_json_value() {
    local json="$1"
    local key="$2"
    echo "$json" | grep -o "\"$key\":[^,}]*" | cut -d':' -f2 | sed 's/^"\|"$//g'
}

# TLDraw Monitoring Functions
show_comprehensive_tldraw_monitor() {
    log_info "=== TLDraw Collaboration System - Monitoring Dashboard ==="
    echo ""
    
    # System Info
    echo "🖥️  System Information:"
    echo "   Date: $(date)"
    echo "   Uptime: $(uptime -p 2>/dev/null || uptime)"
    echo "   Load: $(cat /proc/loadavg 2>/dev/null || echo 'N/A')"
    echo ""
    
    # Docker Status
    echo "🐳 Docker Status:"
    if docker info >/dev/null 2>&1; then
        echo "   ✅ Docker is running"
        echo "   Version: $(docker --version | cut -d' ' -f3 | tr -d ',')"
    else
        echo "   ❌ Docker is not running"
        return 1
    fi
    echo ""
    
    # Container Status
    echo "📦 Container Status:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" --filter "label=com.docker.compose.project=diagram-tools-hub"
    echo ""
    
    # Resource Usage
    echo "📊 Resource Usage:"
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}" $(docker ps -q --filter "label=com.docker.compose.project=diagram-tools-hub")
    echo ""
    
    # TLDraw Room Statistics
    show_tldraw_room_stats
    echo ""
    
    # TLDraw Health Status
    show_tldraw_health_status
}

show_tldraw_room_stats() {
    log_info "=== TLDraw Collaboration Room Statistics ==="
    
    # Get sync backend container ID
    local sync_container=$(docker ps -q --filter "name=tldraw-sync")
    
    if [ -z "$sync_container" ]; then
        log_warning "TLDraw sync backend container not found"
        return 1
    fi
    
    echo "📁 Room Storage Analysis:"
    
    # Use internal API call within container for detailed stats
    local api_data=$(docker exec "$sync_container" wget -q -O - http://localhost:3001/api/rooms 2>/dev/null)
    if [ $? -eq 0 ] && [ -n "$api_data" ]; then
        # Parse JSON data using helper function
        local total_rooms=$(parse_json_value "$api_data" "totalRooms")
        local active_rooms=$(parse_json_value "$api_data" "activeRooms")
        local storage_used=$(parse_json_value "$api_data" "storageUsed")
        
        echo "   Total rooms: ${total_rooms:-0}"
        echo "   Active rooms (24h): ${active_rooms:-0}"
        if [ -n "$storage_used" ] && [ "$storage_used" -gt 0 ]; then
            echo "   Storage used: $((storage_used / 1024)) KB"
        else
            echo "   Storage used: 0 KB"
        fi
        echo ""
        echo "   Recent rooms:"
        echo "$api_data" | grep -o '"name":"[^"]*"' | head -5 | cut -d'"' -f4 | sed 's/^/     - /'
    else
        # Fallback to direct file system analysis
        if docker exec "$sync_container" test -d .rooms 2>/dev/null; then
            # Count rooms
            local room_count=$(docker exec "$sync_container" find .rooms -name "*.tldr" 2>/dev/null | wc -l)
            echo "   Total rooms: $room_count"
            
            # Room sizes
            echo "   Storage usage:"
            docker exec "$sync_container" du -sh .rooms 2>/dev/null || echo "   Unable to calculate room storage"
            
            # Recent rooms (last 24 hours)
            local recent_rooms=$(docker exec "$sync_container" find .rooms -name "*.tldr" -mtime -1 2>/dev/null | wc -l)
            echo "   Active rooms (24h): $recent_rooms"
            
            # Top 5 largest rooms
            echo ""
            echo "   Largest rooms:"
            docker exec "$sync_container" find .rooms -name "*.tldr" -exec du -h {} \; 2>/dev/null | sort -hr | head -5 | sed 's/^/   /'
        else
            echo "   No room data found (.rooms directory not present)"
        fi
    fi
    
    echo ""
    echo "🖼️  Asset Storage Analysis:"
    
    # Use internal API call within container
    local asset_data=$(docker exec "$sync_container" wget -q -O - http://localhost:3001/api/assets 2>/dev/null)
    if [ $? -eq 0 ] && [ -n "$asset_data" ]; then
        # Parse asset JSON data
        local total_assets=$(parse_json_value "$asset_data" "totalAssets")
        local asset_storage=$(parse_json_value "$asset_data" "storageUsed")
        
        echo "   Total assets: ${total_assets:-0}"
        if [ -n "$asset_storage" ] && [ "$asset_storage" -gt 0 ]; then
            echo "   Storage used: $((asset_storage / 1024)) KB"
        else
            echo "   Storage used: 0 KB"
        fi
        
        # Show largest assets if any exist
        if [ -n "$total_assets" ] && [ "$total_assets" -gt 0 ]; then
            echo ""
            echo "   Largest assets:"
            echo "$asset_data" | grep -o '"name":"[^"]*","size":[0-9]*' | head -5 | while IFS= read -r line; do
                local name=$(echo "$line" | cut -d'"' -f4)
                local size=$(echo "$line" | grep -o '[0-9]*$')
                echo "     - $name ($((size / 1024)) KB)"
            done
        fi
    else
        # Fallback to direct file system analysis
        if docker exec "$sync_container" test -d .assets 2>/dev/null; then
            local asset_count=$(docker exec "$sync_container" find .assets -type f 2>/dev/null | wc -l)
            echo "   Total assets: $asset_count"
            echo "   Storage usage:"
            docker exec "$sync_container" du -sh .assets 2>/dev/null || echo "   Unable to calculate asset storage"
        else
            echo "   No asset data found (.assets directory not present)"
        fi
    fi
}

show_system_metrics() {
    log_info "=== Docker Container Performance Metrics ==="
    echo ""
    
    # Memory usage breakdown
    echo "🧠 Memory Usage Breakdown:"
    docker stats --no-stream --format "{{.Container}}: {{.MemUsage}} ({{.MemPerc}})" $(docker ps -q --filter "label=com.docker.compose.project=diagram-tools-hub") | sort
    echo ""
    
    # CPU usage breakdown
    echo "⚡ CPU Usage Breakdown:"
    docker stats --no-stream --format "{{.Container}}: {{.CPUPerc}}" $(docker ps -q --filter "label=com.docker.compose.project=diagram-tools-hub") | sort
    echo ""
    
    # Network I/O
    echo "🌐 Network I/O:"
    docker stats --no-stream --format "{{.Container}}: {{.NetIO}}" $(docker ps -q --filter "label=com.docker.compose.project=diagram-tools-hub") | sort
    echo ""
    
    # Disk I/O
    echo "💾 Disk I/O:"
    docker stats --no-stream --format "{{.Container}}: {{.BlockIO}}" $(docker ps -q --filter "label=com.docker.compose.project=diagram-tools-hub") | sort
    echo ""
    
    # Container logs size
    echo "📝 Log File Sizes:"
    for container in $(docker ps --format "{{.Names}}" --filter "label=com.docker.compose.project=diagram-tools-hub"); do
        local log_file=$(docker inspect --format='{{.LogPath}}' "$container" 2>/dev/null)
        if [ -n "$log_file" ] && [ -f "$log_file" ]; then
            local size=$(du -h "$log_file" 2>/dev/null | cut -f1)
            echo "   $container: $size"
        else
            echo "   $container: No log file found"
        fi
    done
}

show_tldraw_health_status() {
    log_info "=== TLDraw Sync Backend Health Status ==="
    echo ""
    
    # Focus on TLDraw-specific services first
    echo "🎨 TLDraw Services:"
    local tldraw_services=("tldraw-app" "tldraw-sync-app")
    
    for service in "${tldraw_services[@]}"; do
        local container_id=$(docker ps -q --filter "name=$service")
        if [ -n "$container_id" ]; then
            local status=$(docker inspect --format='{{.State.Status}}' "$container_id")
            local health=$(docker inspect --format='{{.State.Health.Status}}' "$container_id" 2>/dev/null || echo "none")
            local started=$(docker inspect --format='{{.State.StartedAt}}' "$container_id" | cut -d'T' -f1)
            
            case $health in
                "healthy")
                    echo "   ✅ $service: $status (healthy) - Started: $started"
                    ;;
                "unhealthy")
                    echo "   ❌ $service: $status (unhealthy) - Started: $started"
                    ;;
                "starting")
                    echo "   🟡 $service: $status (health check starting) - Started: $started"
                    ;;
                *)
                    if [ "$status" = "running" ]; then
                        echo "   🟢 $service: $status (no health check) - Started: $started"
                    else
                        echo "   🔴 $service: $status - Started: $started"
                    fi
                    ;;
            esac
        else
            echo "   ⚪ $service: not running"
        fi
    done
    
    echo ""
    echo "🌐 Supporting Services:"
    local services=("diagram-engine" "drawio-app" "excalidraw-app")
    
    for service in "${services[@]}"; do
        local container_id=$(docker ps -q --filter "name=$service")
        if [ -n "$container_id" ]; then
            local status=$(docker inspect --format='{{.State.Status}}' "$container_id")
            local health=$(docker inspect --format='{{.State.Health.Status}}' "$container_id" 2>/dev/null || echo "none")
            local started=$(docker inspect --format='{{.State.StartedAt}}' "$container_id" | cut -d'T' -f1)
            
            case $health in
                "healthy")
                    echo "   ✅ $service: $status (healthy) - Started: $started"
                    ;;
                "unhealthy")
                    echo "   ❌ $service: $status (unhealthy) - Started: $started"
                    ;;
                "starting")
                    echo "   🟡 $service: $status (health check starting) - Started: $started"
                    ;;
                *)
                    if [ "$status" = "running" ]; then
                        echo "   🟢 $service: $status (no health check) - Started: $started"
                    else
                        echo "   🔴 $service: $status - Started: $started"
                    fi
                    ;;
            esac
        else
            echo "   ⚪ $service: not running"
        fi
    done
    
    echo ""
    echo "📡 TLDraw API Health Checks:"
    
    # Test TLDraw sync backend APIs
    local sync_container=$(docker ps -q --filter "name=tldraw-sync")
    if [ -n "$sync_container" ]; then
        # Test health endpoint
        if docker exec "$sync_container" wget -q -O /dev/null --timeout=5 http://localhost:3001/api/health 2>/dev/null; then
            echo "   ✅ Health API: Responsive"
            
            # Get detailed health info
            local health_data=$(docker exec "$sync_container" wget -q -O - http://localhost:3001/api/health 2>/dev/null)
            if [ -n "$health_data" ]; then
                # Parse overall health status (first occurrence)
                local health_status=$(echo "$health_data" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
                echo "   🔍 Backend Status: $health_status"
                
                # Check for memory warnings in the nested memory check
                if echo "$health_data" | grep -q '"memory".*"warning"'; then
                    local memory_warning=$(echo "$health_data" | grep -o '"memory"[^}]*"warning":"[^"]*"' | grep -o '"warning":"[^"]*"' | cut -d'"' -f4)
                    echo "   ⚠️  Memory Warning: $memory_warning"
                fi
                
                # Show individual component health
                local memory_status=$(echo "$health_data" | grep -o '"memory":{"status":"[^"]*"' | cut -d'"' -f6)
                local connections_status=$(echo "$health_data" | grep -o '"connections":{"status":"[^"]*"' | cut -d'"' -f6)
                local storage_status=$(echo "$health_data" | grep -o '"storage":{"status":"[^"]*"' | cut -d'"' -f6)
                
                echo "   💾 Memory: $memory_status"
                echo "   🔗 Connections: $connections_status" 
                echo "   📁 Storage: $storage_status"
            fi
        else
            echo "   ❌ Health API: Not responding"
        fi
        
        # Test other APIs
        if docker exec "$sync_container" wget -q -O /dev/null --timeout=5 http://localhost:3001/api/rooms 2>/dev/null; then
            echo "   ✅ Rooms API: Responsive"
        else
            echo "   ❌ Rooms API: Not responding"
        fi
        
        if docker exec "$sync_container" wget -q -O /dev/null --timeout=5 http://localhost:3001/api/stats 2>/dev/null; then
            echo "   ✅ Stats API: Responsive"
        else
            echo "   ❌ Stats API: Not responding"
        fi
    else
        echo "   ⚠️  TLDraw sync container not found"
    fi
    
    echo ""
    echo "🔗 TLDraw Connectivity Tests:"
    
    # Test internal connectivity
    local engine_container=$(docker ps -q --filter "name=diagram-engine")
    if [ -n "$engine_container" ]; then
        # Test TLDraw frontend
        if docker exec "$engine_container" wget -q --spider --timeout=5 http://tldraw-app:3000 2>/dev/null; then
            echo "   ✅ TLDraw Frontend: Accessible"
        else
            echo "   ❌ TLDraw Frontend: Not accessible"
        fi
        
        # Test TLDraw Sync WebSocket
        if docker exec "$engine_container" nc -z tldraw-sync-app 3001 2>/dev/null; then
            echo "   ✅ TLDraw Sync WebSocket: Accessible"
        else
            echo "   ❌ TLDraw Sync WebSocket: Not accessible"
        fi
    else
        echo "   ⚠️  Engine container not found - cannot test connectivity"
    fi
}

show_realtime_stats() {
    log_info "=== Real-time Container Statistics ==="
    echo ""
    echo "Press Ctrl+C to exit..."
    echo ""
    
    # Show real-time stats
    docker stats $(docker ps -q --filter "label=com.docker.compose.project=diagram-tools-hub")
}


case "$1" in
    start)
        start_services "$@"
        ;;
    start-dev)
        start_dev_services "$@"
        ;;
    stop)
        stop_services "$@"
        ;;
    restart)
        restart_services "$@"
        ;;
    rebuild)
        rebuild_services "$@"
        ;;
    rebuild-dev)
        rebuild_dev_services "$@"
        ;;
    rebuild-only)
        rebuild_only "$@"
        ;;
    clean)
        clean_containers
        ;;
    clean-rebuild)
        clean_rebuild
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs "$@"
        ;;
    show)
        show_config
        ;;
    http-only)
        http_only
        ;;
    cleanup)
        cleanup_containers
        ;;
    prune)
        prune_docker
        ;;
    backup-config)
        backup_config
        ;;
    restore-config)
        restore_config "$@"
        ;;
    install-service)
        install_service
        ;;
    uninstall-service)
        uninstall_service
        ;;
    service-status)
        service_status
        ;;
    tldraw-monitor)
        show_comprehensive_tldraw_monitor
        ;;
    tldraw-rooms)
        show_tldraw_room_stats
        ;;
    tldraw-health)
        show_tldraw_health_status
        ;;
    system-metrics)
        show_system_metrics
        ;;
    system-stats)
        show_realtime_stats
        ;;
    help|--help|-h)
        show_help
        ;;
    "")
        show_help
        ;;
    *)
        log_error "Unknown command: $1"
        echo "Use '$0 help' for usage information."
        exit 1
        ;;
esac

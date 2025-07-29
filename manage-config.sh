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
    export HTTP_REDIRECT_PORT=${HTTP_REDIRECT_PORT:-80}
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
    echo "  start [CERT] [KEY]      Start all services (auto-generates SSL if not provided)"
    echo "  stop [SERVICE]          Stop all services or specific service"
    echo "  restart [SERVICE]       Restart all services or specific service"
    echo "  rebuild [SERVICE]       Rebuild and restart all services or specific service"
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
    echo "Examples:"
    echo "  $0 start                        # Start with auto-generated SSL"
    echo "  $0 start cert.pem key.pem       # Start with custom certificates"
    echo "  $0 restart tldraw               # Restart only TLDraw service"
    echo "  $0 rebuild tldraw-sync          # Rebuild and restart TLDraw sync service"
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
    
    # Ensure docker-compose.yml uses environment variables
    ensure_env_variables_in_compose
    
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
        if [ "$HTTP_REDIRECT_PORT" = "80" ]; then
            log_info "  🔄 http://localhost -> redirects to HTTPS"
        else
            log_info "  🔄 http://localhost:$HTTP_REDIRECT_PORT -> redirects to HTTPS"
        fi
        log_warning "If using self-signed certificates, accept the browser security warning."
    else
        log_info "Services available at:"
        log_info "  🌐 http://localhost:$HTTP_PORT (Main hub)"
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
        
        # Ensure docker-compose.yml uses environment variables
        ensure_env_variables_in_compose
        
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
            if [ "$HTTP_REDIRECT_PORT" = "80" ]; then
                log_info "  🔄 http://localhost -> redirects to HTTPS"
            else
                log_info "  🔄 http://localhost:$HTTP_REDIRECT_PORT -> redirects to HTTPS"
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
        
        # Ensure docker-compose.yml uses environment variables
        ensure_env_variables_in_compose
        
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
            if [ "$HTTP_REDIRECT_PORT" = "80" ]; then
                log_info "  🔄 http://localhost -> redirects to HTTPS"
            else
                log_info "  🔄 http://localhost:$HTTP_REDIRECT_PORT -> redirects to HTTPS"
            fi
            log_warning "If using self-signed certificates, accept the browser security warning."
        else
            log_info "Services available at:"
            log_info "  🌐 http://localhost:$HTTP_PORT (Main hub)"
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
    log_info "  - https://localhost (Main hub)"
    log_info "  - http://localhost -> redirects to HTTPS"
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
    
    # Backup original configuration
    if [ ! -f "$nginx_conf.backup" ]; then
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

    # HTTP to HTTPS redirect
    server {
        listen 80;
        server_name _;
        return 301 https://$host$request_uri;
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

        # Handle Excalidraw assets that are requested from root
        location ~ ^/(assets|manifest\.webmanifest) {
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

        # Handle TLDraw assets with correct MIME types
        location ~ ^/tldraw/.*\.(js|jsx)$ {
            proxy_pass http://tldraw_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            add_header Content-Type application/javascript;
        }

        # Handle TLDraw CSS files
        location ~ ^/tldraw/.*\.css$ {
            proxy_pass http://tldraw_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            add_header Content-Type text/css;
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
    
    # Backup original configuration
    if [ ! -f "$compose_file.backup" ]; then
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
      - "$HTTP_REDIRECT_PORT:80"    # HTTP (redirects to HTTPS)
      - "$HTTPS_PORT:443"  # HTTPS
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

        # Handle Excalidraw assets that are requested from root
        location ~ ^/(assets|manifest\.webmanifest) {
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

        # Handle TLDraw assets with correct MIME types
        location ~ ^/tldraw/.*\.(js|jsx)$ {
            proxy_pass http://tldraw_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            add_header Content-Type application/javascript;
        }

        # Handle TLDraw CSS files
        location ~ ^/tldraw/.*\.css$ {
            proxy_pass http://tldraw_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            add_header Content-Type text/css;
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

case "$1" in
    start)
        start_services "$@"
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

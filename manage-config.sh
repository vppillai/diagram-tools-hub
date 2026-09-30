#!/bin/bash

# Diagram Tools Hub Configuration Manager

# The monitoring helpers below use `local x=$(cmd)` throughout on purpose:
# a failing probe must print an empty value, not abort the dashboard via
# set -e, which is exactly what SC2155 warns about.
# shellcheck disable=SC2155

set -e  # Exit on any error

# Load environment variables
load_env() {
    if [ ! -f ".env" ]; then
        # Only a fresh install (no certs yet) may be bootstrapped from the
        # example. On an existing install a missing .env means the operator's
        # settings (SSL_DOMAIN, ports, EXTERNAL_TOOLS...) are gone; silently
        # regenerating defaults would re-render nginx for "localhost".
        if [ ! -d "./certs" ] && [ -f ".env.example" ]; then
            cp .env.example .env
            echo "Created .env from .env.example — edit it for your deployment."
        else
            log_error ".env is missing but this is not a fresh install (./certs exists)."
            log_error "Restore your .env (e.g. from a config-backup-*.tar.gz, or copy .env.example and re-apply your settings), then re-run."
            exit 1
        fi
    fi
    # Source as shell so quoted values may contain spaces, '|' and ';'
    # (EXTERNAL_TOOLS needs all three). Quote such values in .env.
    set -a; . ./.env; set +a

    # Set defaults if not specified
    export HTTP_PORT=${HTTP_PORT:-8080}
    export HTTPS_PORT=${HTTPS_PORT:-443}
    export SSL_DOMAIN=${SSL_DOMAIN:-localhost}

    if [ -z "${_SSL_DOMAIN_WARNED:-}" ] && [ -f "./certs/cert.pem" ] && [ "$SSL_DOMAIN" = "localhost" ]; then
        _SSL_DOMAIN_WARNED=1
        log_warning "HTTPS certificates exist but SSL_DOMAIN=localhost: the hub will answer 421 to every hostname except localhost. Set SSL_DOMAIN in .env."
    fi
}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# If `.gitmodules` declares submodules but the working tree has them
# unpopulated (the classic "I upgraded from an older release with
# `git pull` and the new whiteboard service builds with an empty
# context" trap), initialize them. Called from every start/rebuild
# entry point so existing installs upgrade cleanly without the user
# having to remember `git submodule update --init --recursive`.
ensure_submodules() {
    [ -f .gitmodules ] || return 0
    command -v git >/dev/null 2>&1 || return 0

    # A submodule path that exists but has no .git pointer is unpopulated.
    local needs_init=0
    while IFS= read -r path; do
        [ -n "$path" ] || continue
        if [ -d "$path" ] && [ ! -e "$path/.git" ]; then
            needs_init=1
            break
        fi
    done < <(git config -f .gitmodules --get-regexp 'submodule\..*\.path' | awk '{print $2}')

    if [ "$needs_init" = "1" ]; then
        echo -e "${BLUE}[INFO]${NC} Initializing git submodules (whiteboard, …)…"
        git submodule update --init --recursive
    fi
}

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

# Load environment variables at startup (help works without a .env).
case "${1:-}" in
    help|--help|-h|"") ;;
    *) load_env ;;
esac

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
    echo "  generate-nginx-config   Generate HTTP-only nginx config (for CI builds)"
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

    ensure_submodules
    setup_ssl_auto "$cert_file" "$key_file"

    log_info "Starting all services..."

    # Ensure all configuration files exist, then converge: compose only
    # recreates containers whose definition changed.
    ensure_configs_exist

    sudo docker compose up -d --remove-orphans
    reload_engine_nginx
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

    ensure_submodules
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

        # Regenerate first; a failure here leaves the running stack untouched.
        setup_ssl_auto "$cert_file" "$key_file"
        ensure_configs_exist

        # Converge instead of down/up: only changed services are recreated,
        # and the engine picks up a changed nginx.conf via reload.
        sudo docker compose up -d --remove-orphans
        reload_engine_nginx
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
        ensure_submodules
        # Regenerate docker-compose.yml (and nginx.conf) from the script's
        # templates BEFORE the build, even on single-service rebuilds.
        # docker-compose.yml is gitignored / generated, so a user who has
        # upgraded across a release whose template changed (e.g. a new
        # build arg was added to a service definition) would otherwise
        # rebuild against the stale on-disk compose file and never pick
        # up the new template content.
        ensure_configs_exist
        log_info "Rebuilding and restarting $service service..."
        sudo docker compose build --no-cache "$service"
        sudo docker compose up -d "$service"
        reload_engine_nginx
        log_success "$service service rebuilt and started successfully!"
        show_status
    else
        log_info "Rebuilding and restarting all services..."
        sudo docker compose down

        ensure_submodules
        setup_ssl_auto "$cert_file" "$key_file"
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
        ensure_submodules
        # Regenerate the compose file before single-service dev rebuild
        # — same reasoning as `rebuild_services`. See the comment there.
        ensure_configs_exist
        log_info "Rebuilding and restarting $service service in development mode..."
        sudo docker compose -f docker-compose.yml -f docker-compose.dev.yml build --no-cache "$service"
        sudo docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d "$service"
        reload_engine_nginx
        log_success "$service service rebuilt and started successfully in development mode!"
        show_status
    else
        log_info "Rebuilding and restarting all services in development mode..."
        log_warning "Development mode: TLDraw will have hot-reload enabled and serve from source"
        sudo docker compose down

        ensure_submodules
        setup_ssl_auto "$cert_file" "$key_file"
        ensure_configs_exist

        sudo docker compose -f docker-compose.yml -f docker-compose.dev.yml build --no-cache
        sudo docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
        reload_engine_nginx
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
    
    # Regenerate the compose file before building — see rebuild_services
    # for why. Without this, `rebuild-only` against an upgraded checkout
    # silently builds against a stale compose template.
    ensure_configs_exist
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

        sudo docker compose down --remove-orphans --volumes --rmi all
        sudo docker system prune -a -f --volumes

        ensure_submodules
        ensure_configs_exist

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
    log_info "Switching to HTTP-only mode (until the next start/restart with certs present)..."
    create_http_only_config
    create_http_only_docker_compose
    ensure_sync_data_dirs

    log_info "Restarting services in HTTP-only mode..."
    sudo docker compose up -d --remove-orphans
    reload_engine_nginx
    
    log_success "Switched to HTTP-only mode successfully!"
    log_info "Services available at:"
    log_info "  🌐 http://localhost:$HTTP_PORT (Main hub)"
}

# The engine's nginx.conf is a bind mount, so a regenerated file needs a
# reload (compose does not recreate a container when a mounted file changes).
reload_engine_nginx() {
    if sudo docker ps --format '{{.Names}}' | grep -qx diagram-engine; then
        if sudo docker exec diagram-engine nginx -t >/dev/null 2>&1; then
            sudo docker exec diagram-engine nginx -s reload
        else
            log_error "Generated nginx.conf failed 'nginx -t' — engine keeps its previous config"
            sudo docker exec diagram-engine nginx -t
            return 1
        fi
    fi
}

# Render the engine nginx config from engine/nginx.conf.template. One source
# of truth for HTTP, HTTPS, and CI modes — the previous three inline heredocs
# in this file had drifted (CI's /tldraw/sync/ vs HTTPS's /tldraw-sync/),
# which is exactly the drift this template prevents.
#
# Usage: render_nginx_config <mode>   where <mode> is http | https
render_nginx_config() {
    local mode="${1:-http}"
    local template="./engine/nginx.conf.template"
    local out="./engine/nginx.conf"
    local candidate="./engine/nginx.conf.new"

    if [ ! -f "$template" ]; then
        log_error "Nginx template missing: $template"
        return 1
    fi

    if ! command -v envsubst >/dev/null 2>&1; then
        log_error "envsubst is required to render the nginx template."
        log_error "Install: apt-get install gettext-base  (Debian/Ubuntu)"
        log_error "         apk add gettext               (Alpine)"
        log_error "         brew install gettext          (macOS)"
        return 1
    fi

    mkdir -p ./engine

    # envsubst expands only the listed vars — nginx's own $host etc. pass
    # through unchanged. Each block is a heredoc (no command substitution).
    case "$mode" in
        https)
            export LISTEN_DIRECTIVE=$'listen 443 ssl;\n        http2 on;'
            export SSL_PROTOCOLS_BLOCK=$'\n    ssl_protocols TLSv1.2 TLSv1.3;\n    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-SHA384:ECDHE-RSA-AES128-SHA256;\n    ssl_prefer_server_ciphers off;\n    ssl_session_cache shared:SSL:10m;\n    ssl_session_timeout 10m;\n'
            export SSL_CERT_BLOCK=$'\n        ssl_certificate /etc/ssl/certs/cert.pem;\n        ssl_certificate_key /etc/ssl/private/key.pem;'
            export SECURITY_HEADERS=$'\n        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;\n        add_header X-Content-Type-Options nosniff always;\n        add_header Referrer-Policy "strict-origin-when-cross-origin" always;\n'
            # HTTP/2 connection coalescing guard (RFC 9113 §9.1.2). A browser
            # reuses an open h2 connection for ANY hostname the certificate
            # covers that resolves to the same IP. When the hub shares an IP
            # and a multi-SAN cert with another service behind an SNI router,
            # that service's requests arrive here and get the hub page.
            # Answering 421 makes the browser retry on a fresh connection
            # (correct SNI) instead. Only SSL_DOMAIN and loopback are served.
            # $host is lowercased by nginx; quote the value so a domain with
            # unusual characters cannot change the map's semantics.
            local hub_host hub_entry=""
            hub_host="$(printf '%s' "${SSL_DOMAIN}" | tr 'A-Z' 'a-z')"
            # A duplicate key is a hard nginx error ("conflicting parameter"),
            # so SSL_DOMAIN=localhost must not repeat the built-in entries.
            case "$hub_host" in
                localhost|127.0.0.1|"[::1]") ;;
                *) hub_entry=$'        "'"${hub_host}"$'"  0;\n' ;;
            esac
            export HOST_GUARD_MAP=$'\n    map $host $misdirected {\n        default      1;\n        localhost    0;\n        127.0.0.1    0;\n        "[::1]"      0;\n'"${hub_entry}"$'    }\n'
            export HOST_GUARD=$'\n        if ($misdirected) { return 421; }\n'
            ;;
        http|ci)
            export LISTEN_DIRECTIVE="listen 80;"
            export SSL_PROTOCOLS_BLOCK=""
            export SSL_CERT_BLOCK=""
            export SECURITY_HEADERS=""
            export HOST_GUARD_MAP=""
            export HOST_GUARD=""
            ;;
        *)
            log_error "Unknown nginx render mode: $mode"
            return 1
            ;;
    esac

    # shellcheck disable=SC2016  # the $-names are envsubst's allow-list, not shell expansions
    envsubst '${LISTEN_DIRECTIVE} ${SSL_PROTOCOLS_BLOCK} ${SSL_CERT_BLOCK} ${SECURITY_HEADERS} ${HOST_GUARD_MAP} ${HOST_GUARD}' \
        < "$template" > "$candidate"

    unset LISTEN_DIRECTIVE SSL_PROTOCOLS_BLOCK SSL_CERT_BLOCK SECURITY_HEADERS HOST_GUARD_MAP HOST_GUARD

    # Never replace a working config with one nginx rejects: the running
    # engine would refuse the reload, and the next container (re)start
    # would crash-loop on it.
    if ! validate_nginx_config "$mode" "$candidate"; then
        rm -f "$candidate"
        return 1
    fi
    # Overwrite in place (keeps the inode): the engine bind-mounts this
    # single file, and a rename would leave the container on the old inode.
    cat "$candidate" > "$out"
    rm -f "$candidate"

    render_external_tools
}

# Run `nginx -t` on a rendered config in a throwaway nginx:alpine container.
# Upstream names are pinned to 127.0.0.1 with --add-host so they resolve
# whether or not the stack (and each service container) is running; on the
# hub network when it exists. Skipped with a warning when docker is not
# usable (e.g. a CI step without docker) or SKIP_NGINX_VALIDATE=1.
# Usage: validate_nginx_config <mode> <file>
validate_nginx_config() {
    local mode="$1" file="$2" out h
    if [ "${SKIP_NGINX_VALIDATE:-}" = "1" ]; then
        log_warning "SKIP_NGINX_VALIDATE=1 — installing nginx config without 'nginx -t'"
        return 0
    fi
    if ! command -v docker >/dev/null 2>&1 || ! sudo docker info >/dev/null 2>&1; then
        log_warning "docker is not runnable — installing nginx config without 'nginx -t' validation"
        return 0
    fi
    # The config goes in on stdin rather than as a bind mount: Docker Desktop
    # can serve a stale cached copy of a file just rewritten at the same path.
    local args=(--rm -i)
    if sudo docker network inspect diagram-tools-network >/dev/null 2>&1; then
        args+=(--network diagram-tools-network)
    fi
    for h in drawio excalidraw tldraw tldraw-sync whiteboard; do
        args+=(--add-host "$h:127.0.0.1")
    done
    if [ "$mode" = "https" ]; then
        args+=(-v "$(pwd)/certs/cert.pem:/etc/ssl/certs/cert.pem:ro"
               -v "$(pwd)/certs/key.pem:/etc/ssl/private/key.pem:ro")
    fi
    if ! out="$(sudo docker run "${args[@]}" --entrypoint sh nginx:alpine \
            -c 'cat > /etc/nginx/nginx.conf && exec nginx -t' < "$file" 2>&1)"; then
        log_error "Rendered ${mode} nginx config failed 'nginx -t' — keeping the existing engine/nginx.conf:"
        printf '%s\n' "$out" >&2
        return 1
    fi
}

# Write engine/html/external-tools.js from EXTERNAL_TOOLS so the landing page
# can show cards for services that live outside the hub (e.g. DocCode).
# Format: entries separated by ';', fields by '|':  Name|URL|Description[|LogoURL]
# Unset/empty -> "window.EXTERNAL_TOOLS = [];" and the page renders no extra cards.
render_external_tools() {
    local out="./engine/html/external-tools.js"
    local json="" entry name url desc logo

    trim() {  # strip leading/trailing whitespace without touching quotes
        local v="$1"
        v="${v#"${v%%[![:space:]]*}"}"; v="${v%"${v##*[![:space:]]}"}"
        printf '%s' "$v"
    }
    json_str() {  # escape a string for a JSON literal
        local v="$1"
        v="${v//\\/\\\\}"; v="${v//\"/\\\"}"
        printf '"%s"' "$v"
    }

    IFS=';' read -ra entries <<< "${EXTERNAL_TOOLS:-}"
    for entry in "${entries[@]}"; do
        IFS='|' read -r name url desc logo <<< "$entry"
        name="$(trim "$name")"; url="$(trim "$url")"
        [ -z "$name" ] || [ -z "$url" ] && continue
        case "$url" in http://*|https://*) ;; *)
            log_warning "EXTERNAL_TOOLS: skipping '$name' — URL must start with http:// or https://"; continue;; esac
        json+="${json:+,}{\"name\":$(json_str "$name"),\"url\":$(json_str "$url"),\"description\":$(json_str "$(trim "$desc")"),\"logo\":$(json_str "$(trim "$logo")")}"
    done

    printf '// Generated by manage-config.sh from EXTERNAL_TOOLS in .env — do not edit.\nwindow.EXTERNAL_TOOLS = [%s];\n' "$json" > "$out"
}

# Generate nginx configuration without touching containers. Defaults to the
# HTTP variant for CI builds (no SSL certs required); pass "https" to
# re-render the production config in place, then `docker exec diagram-engine
# nginx -s reload` picks it up with zero downtime.
generate_nginx_config() {
    local mode="${1:-http}"
    log_info "Generating ${mode} nginx configuration..."
    render_nginx_config "$mode"
    log_success "nginx.conf generated successfully (${mode})!"
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
    render_nginx_config https
    log_info "Created HTTPS nginx configuration"
}

update_docker_compose_https() {
    local compose_file="./docker-compose.yml"

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
      - whiteboard
    restart: unless-stopped
    # Health only; no service_healthy gating, so a slow drawio cannot keep
    # the hub down. 127.0.0.1 is exempt from the HTTPS 421 host guard.
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "/dev/null", "--no-check-certificate", "https://127.0.0.1/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 60s

  # Draw.io container
  drawio:
    image: jgraph/drawio:30.0.1
    container_name: drawio-app
    environment:
      - DRAWIO_BASE_URL=/drawio
      - DRAWIO_CONFIG={"compressXml":false,"fontCss":"","customFonts":[],"libraries":"general;uml;er;bpmn;flowchart;basic;arrows2","enabledLibraries":"general;uml;er;bpmn;flowchart;basic;arrows2","defaultLibraries":"general;uml;er;bpmn;flowchart;basic;arrows2","autosave":true,"formatDiff":false}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-fsS", "-o", "/dev/null", "http://127.0.0.1:8080/"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 60s

  # Excalidraw container
  excalidraw:
    image: excalidraw/excalidraw@sha256:4542f30bea392b833822d0e7db4fa2220e6706ca962c082add2665159fa91758
    container_name: excalidraw-app
    restart: unless-stopped

  # TLDraw container - using a custom build since there's no official image
  tldraw:
    build:
      context: ./tldraw
      dockerfile: Dockerfile
      args:
        VITE_TLDRAW_LICENSE_KEY: \${TLDRAW_LICENSE_KEY:-}
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
    environment:
      # Days before an idle room / unreferenced asset file is deleted.
      - ROOM_RETENTION_DAYS=\${ROOM_RETENTION_DAYS:-90}
      - ASSET_RETENTION_DAYS=\${ASSET_RETENTION_DAYS:-90}
      - CLEANUP_ENABLED=\${CLEANUP_ENABLED:-true}
    restart: unless-stopped

  # Whiteboard - low-latency, pen-optimized whiteboard (vppillai/whiteboard)
  # Source is a git submodule pinned at v1.5.0 (./whiteboard/).
  # Built with BASE_PATH=/whiteboard/ so assets are prefixed correctly for the
  # sub-path mount; nginx strips the prefix on proxy_pass.
  whiteboard:
    build:
      context: ./whiteboard
      dockerfile: Dockerfile
      args:
        BASE_PATH: /whiteboard/
    container_name: whiteboard-app
    # The image declares VOLUME /data but the server is stateless; a named
    # volume stops every down/up from leaving another anonymous volume.
    volumes:
      - whiteboard-data:/data
    restart: unless-stopped

networks:
  default:
    name: diagram-tools-network

volumes:
  whiteboard-data:
EOF

    log_info "Updated docker-compose configuration for HTTPS"
}

create_http_only_config() {
    render_nginx_config http
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
      - whiteboard
    restart: unless-stopped
    # Health only; no service_healthy gating, so a slow drawio cannot keep
    # the hub down. 127.0.0.1 is exempt from the HTTPS 421 host guard.
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 60s

  # Draw.io container
  drawio:
    image: jgraph/drawio:30.0.1
    container_name: drawio-app
    environment:
      - DRAWIO_BASE_URL=/drawio
      - DRAWIO_CONFIG={"compressXml":false,"fontCss":"","customFonts":[],"libraries":"general;uml;er;bpmn;flowchart;basic;arrows2","enabledLibraries":"general;uml;er;bpmn;flowchart;basic;arrows2","defaultLibraries":"general;uml;er;bpmn;flowchart;basic;arrows2","autosave":true,"formatDiff":false}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-fsS", "-o", "/dev/null", "http://127.0.0.1:8080/"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 60s

  # Excalidraw container
  excalidraw:
    image: excalidraw/excalidraw@sha256:4542f30bea392b833822d0e7db4fa2220e6706ca962c082add2665159fa91758
    container_name: excalidraw-app
    restart: unless-stopped

  # TLDraw container - using a custom build since there's no official image
  tldraw:
    build:
      context: ./tldraw
      dockerfile: Dockerfile
      args:
        VITE_TLDRAW_LICENSE_KEY: \${TLDRAW_LICENSE_KEY:-}
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
    environment:
      # Days before an idle room / unreferenced asset file is deleted.
      - ROOM_RETENTION_DAYS=\${ROOM_RETENTION_DAYS:-90}
      - ASSET_RETENTION_DAYS=\${ASSET_RETENTION_DAYS:-90}
      - CLEANUP_ENABLED=\${CLEANUP_ENABLED:-true}
    restart: unless-stopped

  # Whiteboard - low-latency, pen-optimized whiteboard (vppillai/whiteboard)
  # Source is a git submodule pinned at v1.5.0 (./whiteboard/).
  # Built with BASE_PATH=/whiteboard/ so assets are prefixed correctly for the
  # sub-path mount; nginx strips the prefix on proxy_pass.
  whiteboard:
    build:
      context: ./whiteboard
      dockerfile: Dockerfile
      args:
        BASE_PATH: /whiteboard/
    container_name: whiteboard-app
    # The image declares VOLUME /data but the server is stateless; a named
    # volume stops every down/up from leaving another anonymous volume.
    volumes:
      - whiteboard-data:/data
    restart: unless-stopped

networks:
  default:
    name: diagram-tools-network

volumes:
  whiteboard-data:
EOF

    log_info "Created HTTP-only docker-compose configuration"
}

ensure_configs_exist() {
    # Always regenerate the generated configs from the in-script templates.
    # docker-compose.yml and engine/nginx.conf are both gitignored — they
    # are pure artifacts of `manage-config.sh`'s templates. The previous
    # version of this function ran `if [ ! -f ... ]; then create_…` which
    # left stale files in place after an upgrade. Specifically: a user
    # upgrading v1.4.0 → v1.4.1 hit this — v1.4.1 added a build arg to the
    # tldraw service in the template, but `rebuild` reused the v1.4.0
    # compose file on disk and the new arg never reached docker build.
    # Always regenerating fixes the class of problem.
    log_info "Regenerating engine/nginx.conf and docker-compose.yml from templates..."

    if [ -f "./certs/cert.pem" ] && [ -f "./certs/key.pem" ]; then
        create_https_nginx_config
        update_docker_compose_https
    else
        create_http_only_config
        create_http_only_docker_compose
    fi

    ensure_sync_data_dirs
    log_info "Configuration files regenerated."
}

# The sync backend runs as the unprivileged 'app' user (uid 100 / gid 101 in
# the Alpine image). Docker creates missing bind-mount sources as root, which
# made every snapshot write fail silently on a fresh install.
# Usage: ensure_sync_data_dirs [--force]   (--force: chown -R even if the
# top-level dir already looks right, e.g. after restoring a backup)
ensure_sync_data_dirs() {
    local d force="${1:-}"
    for d in tldraw-sync-backend/.rooms tldraw-sync-backend/.assets; do
        mkdir -p "$d" 2>/dev/null || sudo mkdir -p "$d"
        if [ "$force" = "--force" ]; then
            sudo chown -R 100:101 "$d"
        elif [ "$(stat -c %u "$d" 2>/dev/null || stat -f %u "$d")" != "100" ]; then
            sudo chown -R 100:101 "$d" || log_warning "Could not chown $d to 100:101 — tldraw rooms will not persist"
        fi
    done
}




prune_docker() {
    log_info "Removing unused Docker resources..."
    sudo docker system prune -f
    log_success "Docker resources pruned successfully!"
}

backup_config() {
    local backup_file p
    backup_file="config-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
    log_info "Creating configuration backup: $backup_file"

    # Everything else is reproducible from git + these inputs. certs/ is
    # absent in http-only installs; anything else missing is worth a warning.
    local items=()
    for p in .env certs tldraw-sync-backend/.rooms tldraw-sync-backend/.assets; do
        if [ -e "$p" ]; then items+=("$p"); else log_warning "Not in backup (missing): $p"; fi
    done

    # The archive holds the TLS private key and all room data: create it
    # 0600 (umask applies to sudo tar too) and hand it back to the operator.
    if ! ( umask 077; sudo tar -czf "$backup_file" "${items[@]}" ); then
        sudo rm -f "$backup_file"
        log_error "tar failed — backup NOT created (see errors above)"
        exit 1
    fi
    sudo chown "$(id -u):$(id -g)" "$backup_file"
    chmod 600 "$backup_file"
    log_success "Configuration backed up to: $backup_file"
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
        # sudo: room/asset files in the archive are owned by the container
        # user (100:101); -p keeps the key's 0600 mode.
        sudo tar -xzpf "$backup_file"
        ensure_sync_data_dirs --force
        log_success "Configuration restored successfully!"
    else
        log_info "Restore operation cancelled."
    fi
}

# docker-compose.yml is .gitignore'd — it's generated by `start`, `start-dev`,
# and `http-only` (via setup_ssl_auto / http_only -> update_docker_compose_https
# / create_http_only_docker_compose). Container-management commands like
# `stop`, `status`, `logs`, `restart`, `rebuild`, `clean*` require the file
# to already exist (they operate on a running stack). `generate-nginx-config`
# is a CI-only path that doesn't touch the compose file.
if [ ! -f "docker-compose.yml" ]; then
    case "${1:-}" in
        generate-nginx-config|start|start-dev|http-only|help|--help|-h|"")
            # These commands either bootstrap the file or don't need it.
            : ;;
        *)
            log_error "docker-compose.yml not found. On a fresh clone, run './manage-config.sh start' (or start-dev) first to bootstrap; that command auto-generates SSL certs, nginx.conf, and docker-compose.yml."
            exit 1
            ;;
    esac
fi

# Check if Docker is running (help and generate-nginx-config work without it;
# the latter then skips nginx -t validation with a warning).
case "${1:-}" in
    help|--help|-h|""|generate-nginx-config) ;;
    *)
        if ! sudo docker info >/dev/null 2>&1; then
            log_error "Docker is not running. Please start Docker and try again."
            exit 1
        fi
        ;;
esac


# Service management functions
install_service() {
    local service_file="drawapp.service"
    local systemd_dir="/etc/systemd/system"
    local current_dir
    current_dir=$(pwd)

    log_info "Installing DrawApp systemd service..."

    if [ "$EUID" -ne 0 ]; then
        log_error "Service installation requires root privileges. Please run with sudo."
        echo "Usage: sudo $0 install-service"
        exit 1
    fi

    if [ ! -f "$service_file" ]; then
        log_error "Service file not found: $service_file"
        exit 1
    fi

    # Render into a temp file before substituting paths. The previous
    # version sed'd the tracked file in-place — every install showed up
    # as a `git diff` and the next `git checkout` would silently revert
    # the systemd unit's paths back to the /path/to/drawApp placeholder.
    local rendered
    rendered=$(mktemp /tmp/drawapp.service.XXXXXX) || {
        log_error "mktemp failed"
        exit 1
    }
    trap 'rm -f "$rendered"' EXIT

    log_info "Rendering service file with current paths..."
    sed \
        -e "s|WorkingDirectory=.*|WorkingDirectory=$current_dir|g" \
        -e "s|ExecStart=.*|ExecStart=$current_dir/manage-config.sh start|g" \
        -e "s|ExecStop=.*|ExecStop=$current_dir/manage-config.sh stop|g" \
        -e "s|ExecReload=.*|ExecReload=$current_dir/manage-config.sh restart|g" \
        -e "s|ReadWritePaths=.*|ReadWritePaths=$current_dir /root/.docker|g" \
        "$service_file" > "$rendered"

    log_info "Copying service file to $systemd_dir..."
    cp "$rendered" "$systemd_dir/$service_file"
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
    # shellcheck disable=SC2046  # word-split container IDs on purpose
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
            # Count rooms. Snapshots are named exactly <roomId> (no extension);
            # skip atomic-write temps and quarantined .corrupt-* files, as
            # isRoomFile() in tldraw-sync-backend/server.js does.
            local room_count=$(docker exec "$sync_container" find .rooms -maxdepth 1 -type f ! -name ".*" ! -name "*.corrupt-*" ! -name "*.tmp" ! -name "*.tmp-*" 2>/dev/null | wc -l)
            echo "   Total rooms: $room_count"
            
            # Room sizes
            echo "   Storage usage:"
            docker exec "$sync_container" du -sh .rooms 2>/dev/null || echo "   Unable to calculate room storage"
            
            # Recent rooms (last 24 hours)
            local recent_rooms=$(docker exec "$sync_container" find .rooms -maxdepth 1 -type f ! -name ".*" ! -name "*.corrupt-*" ! -name "*.tmp" ! -name "*.tmp-*" -mtime -1 2>/dev/null | wc -l)
            echo "   Active rooms (24h): $recent_rooms"
            
            # Top 5 largest rooms
            echo ""
            echo "   Largest rooms:"
            docker exec "$sync_container" find .rooms -maxdepth 1 -type f ! -name ".*" ! -name "*.corrupt-*" ! -name "*.tmp" ! -name "*.tmp-*" -exec du -h {} \; 2>/dev/null | sort -hr | head -5 | sed 's/^/   /'
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
            # <id>.meta.json sidecars are metadata, not assets
            local asset_count=$(docker exec "$sync_container" find .assets -maxdepth 1 -type f ! -name "*.meta.json" 2>/dev/null | wc -l)
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
    # shellcheck disable=SC2046  # word-split container IDs on purpose
    docker stats --no-stream --format "{{.Container}}: {{.MemUsage}} ({{.MemPerc}})" $(docker ps -q --filter "label=com.docker.compose.project=diagram-tools-hub") | sort
    echo ""
    
    # CPU usage breakdown
    echo "⚡ CPU Usage Breakdown:"
    # shellcheck disable=SC2046  # word-split container IDs on purpose
    docker stats --no-stream --format "{{.Container}}: {{.CPUPerc}}" $(docker ps -q --filter "label=com.docker.compose.project=diagram-tools-hub") | sort
    echo ""
    
    # Network I/O
    echo "🌐 Network I/O:"
    # shellcheck disable=SC2046  # word-split container IDs on purpose
    docker stats --no-stream --format "{{.Container}}: {{.NetIO}}" $(docker ps -q --filter "label=com.docker.compose.project=diagram-tools-hub") | sort
    echo ""
    
    # Disk I/O
    echo "💾 Disk I/O:"
    # shellcheck disable=SC2046  # word-split container IDs on purpose
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
    # shellcheck disable=SC2046  # word-split container IDs on purpose
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
    generate-nginx-config)
        generate_nginx_config "$2"
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

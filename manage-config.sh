#!/bin/bash

# Diagram Tools Hub Configuration Manager

set -e  # Exit on any error

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
    echo "  start                   Start all services"
    echo "  stop                    Stop all services"
    echo "  restart                 Restart all services"
    echo "  rebuild                 Rebuild and restart all services"
    echo "  clean                   Stop and remove all containers, networks, and images"
    echo "  clean-rebuild           Clean everything and rebuild from scratch"
    echo "  status                  Show status of all containers"
    echo "  logs [SERVICE]          Show logs for all services or specific service"
    echo ""
    echo "Configuration Commands:"
    echo "  show                    Show current configuration"
    echo ""
    echo "Maintenance Commands:"
    echo "  prune                   Remove unused Docker resources"
    echo "  backup-config           Backup current configuration"
    echo "  restore-config [FILE]   Restore configuration from backup"
    echo ""
    echo "Examples:"
    echo "  $0 start               # Start all services"
    echo "  $0 stop                # Stop all services"
    echo "  $0 rebuild             # Rebuild and restart all services"
    echo "  $0 clean-rebuild       # Clean everything and rebuild from scratch"
    echo "  $0 logs tldraw         # Show tldraw logs"
    echo "  $0 status              # Show container status"
    echo ""
    echo "Note: TLDraw debug panel can be enabled in the app preferences menu."
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
    log_info "Starting all services..."
    sudo docker compose up -d
    log_success "All services started successfully!"
    show_status
}

stop_services() {
    log_info "Stopping all services..."
    sudo docker compose down
    log_success "All services stopped successfully!"
}

restart_services() {
    log_info "Restarting all services..."
    sudo docker compose down
    sudo docker compose up -d
    log_success "All services restarted successfully!"
    show_status
}

rebuild_services() {
    log_info "Rebuilding and restarting all services..."
    sudo docker compose down
    sudo docker compose build --no-cache
    sudo docker compose up -d
    log_success "All services rebuilt and started successfully!"
    show_status
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

case "$1" in
    start)
        start_services
        ;;
    stop)
        stop_services
        ;;
    restart)
        restart_services
        ;;
    rebuild)
        rebuild_services
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
    prune)
        prune_docker
        ;;
    backup-config)
        backup_config
        ;;
    restore-config)
        restore_config "$@"
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

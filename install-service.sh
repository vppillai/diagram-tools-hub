#!/bin/bash

# DrawApp Service Installer
# This script installs the DrawApp as a systemd service for auto-start on boot

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

echo "=========================================="
echo "    DrawApp Systemd Service Installer"
echo "=========================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    log_error "This script requires root privileges."
    echo "Please run with sudo:"
    echo "  sudo ./install-service.sh"
    exit 1
fi

# Check if manage-config.sh exists
if [ ! -f "manage-config.sh" ]; then
    log_error "manage-config.sh not found in current directory."
    echo "Please run this script from the DrawApp project root directory."
    exit 1
fi

# Check if drawapp.service exists
if [ ! -f "drawapp.service" ]; then
    log_error "drawapp.service file not found."
    echo "Please ensure the service file exists in the current directory."
    exit 1
fi

log_info "Installing DrawApp systemd service..."

# Run the installation
if ./manage-config.sh install-service; then
    echo ""
    log_success "Installation completed successfully!"
    echo ""
    echo "Service Information:"
    echo "==================="
    echo "• Service Name: drawapp"
    echo "• Auto-start: Enabled"
    echo "• Status: Ready to start"
    echo ""
    echo "Next Steps:"
    echo "==========="
    echo "1. Start the service:"
    echo "   sudo systemctl start drawapp"
    echo ""
    echo "2. Check status:"
    echo "   sudo systemctl status drawapp"
    echo ""
    echo "3. View logs:"
    echo "   sudo journalctl -u drawapp -f"
    echo ""
    echo "4. The service will automatically start on system reboot"
    echo ""
    echo "To uninstall later:"
    echo "  sudo ./manage-config.sh uninstall-service"
    echo ""
else
    log_error "Installation failed!"
    exit 1
fi 
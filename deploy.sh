#!/bin/bash

# HK-NOVA Final Deployment Script
# Comprehensive deployment for production readiness

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo "=========================================="
echo "🚀 HK-NOVA Production Deployment"
echo "=========================================="
echo ""

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi
    
    # Check pnpm
    if ! command -v pnpm &> /dev/null; then
        log_error "pnpm is not installed. Install with: npm install -g pnpm"
        exit 1
    fi
    
    # Check PM2
    if ! command -v pm2 &> /dev/null; then
        log_error "PM2 is not installed. Install with: npm install -g pm2"
        exit 1
    fi
    
    # Check MySQL
    if ! command -v mysql &> /dev/null; then
        log_error "MySQL is not installed"
        exit 1
    fi
    
    log_success "All prerequisites met"
}

install_dependencies() {
    log_info "Installing dependencies..."
    pnpm install --frozen-lockfile
    log_success "Dependencies installed"
}

setup_environment() {
    log_info "Setting up environment..."
    
    if [ ! -f .env.production ]; then
        if [ -f .env.production.template ]; then
            cp .env.production.template .env.production
            log_warn "Created .env.production from template"
            log_warn "Please edit .env.production with your values"
            exit 1
        else
            log_error ".env.production.template not found"
            exit 1
        fi
    fi
    
    chmod 600 .env.production
    log_success "Environment configured"
}

setup_database() {
    log_info "Setting up database..."
    
    # Run migrations
    pnpm prisma migrate deploy
    
    log_success "Database setup complete"
}

build_application() {
    log_info "Building application..."
    pnpm build
    log_success "Application built"
}

start_workers() {
    log_info "Starting workers with PM2..."
    
    # Stop existing if running
    pm2 delete all 2>/dev/null || true
    
    # Start workers
    pnpm pm2:start
    
    # Save PM2 config
    pm2 save
    
    log_success "Workers started"
}

verify_deployment() {
    log_info "Verifying deployment..."
    
    sleep 5
    
    # Check workers
    if ! pm2 list | grep -q "online"; then
        log_error "Some workers failed to start"
        pm2 list
        exit 1
    fi
    
    # Check API health
    if command -v curl &> /dev/null; then
        if curl -sf http://localhost:3000/api/health > /dev/null; then
            log_success "API is responding"
        else
            log_error "API is not responding"
            exit 1
        fi
    fi
    
    log_success "Deployment verified"
}

show_status() {
    echo ""
    echo "=========================================="
    echo "📊 Deployment Status"
    echo "=========================================="
    echo ""
    
    pm2 list
    
    echo ""
    echo "=========================================="
    echo "✅ Deployment Complete!"
    echo "=========================================="
    echo ""
    echo "Next steps:"
    echo "  1. Access dashboard: http://localhost:3000"
    echo "  2. Add your first device"
    echo "  3. Monitor logs: pm2 logs"
    echo "  4. Check worker health: ./scripts/monitoring/worker-health.sh"
    echo ""
    echo "Documentation:"
    echo "  - Quick Start: QUICK_START_PRODUCTION.md"
    echo "  - Operations: RUNBOOK.md"
    echo "  - Testing: PHASE5_TESTING_GUIDE.md"
    echo ""
}

# Main execution
main() {
    check_prerequisites
    install_dependencies
    setup_environment
    setup_database
    build_application
    start_workers
    verify_deployment
    show_status
}

main

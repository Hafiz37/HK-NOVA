#!/bin/bash
set -euo pipefail

echo "🚀 HK-NOVA Production Deployment Script"
echo "========================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PRODUCTION_DIR="/opt/hk-nova-production"
BACKUP_DIR="/opt/hk-nova-backups"
COMPOSE_FILE="docker-compose.yml"

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

confirm_production() {
    echo -e "${RED}⚠️  WARNING: You are about to deploy to PRODUCTION${NC}"
    echo ""
    read -p "Are you sure you want to continue? (yes/no): " -r
    if [[ ! $REPLY =~ ^yes$ ]]; then
        log_info "Deployment cancelled"
        exit 0
    fi
}

check_prerequisites() {
    log_step "1/10 Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
    
    # Check if .env.production exists
    if [ ! -f .env.production ]; then
        log_error ".env.production file not found"
        exit 1
    fi
    
    # Verify secrets are not default values
    if grep -q "CHANGE_ME" .env.production; then
        log_error "Found CHANGE_ME values in .env.production - please configure all secrets"
        exit 1
    fi
    
    log_info "✅ All prerequisites met"
}

create_backup() {
    log_step "2/10 Creating database backup..."
    
    mkdir -p "$BACKUP_DIR"
    TIMESTAMP=$(date +%Y%m%d-%H%M%S)
    BACKUP_FILE="$BACKUP_DIR/prod-pre-deploy-$TIMESTAMP.sql"
    
    # Backup if database is running
    if docker ps | grep -q hk-nova-mysql; then
        source .env.production
        docker exec hk-nova-mysql mysqldump \
            -u root \
            -p"${MYSQL_ROOT_PASSWORD}" \
            --single-transaction \
            --routines \
            --triggers \
            --events \
            hk_nova > "$BACKUP_FILE" 2>/dev/null
        
        if [ -f "$BACKUP_FILE" ]; then
            # Compress backup
            gzip "$BACKUP_FILE"
            log_info "✅ Database backed up to: ${BACKUP_FILE}.gz"
            echo "$BACKUP_FILE.gz" > "$BACKUP_DIR/latest-backup.txt"
        else
            log_warn "Failed to create backup"
        fi
    else
        log_warn "MySQL container not running, skipping backup"
    fi
}

pull_latest_code() {
    log_step "3/10 Pulling latest code..."
    
    # If using git
    if [ -d .git ]; then
        CURRENT_COMMIT=$(git rev-parse HEAD)
        log_info "Current commit: $CURRENT_COMMIT"
        
        git fetch origin
        git pull origin main
        
        NEW_COMMIT=$(git rev-parse HEAD)
        log_info "New commit: $NEW_COMMIT"
        
        if [ "$CURRENT_COMMIT" = "$NEW_COMMIT" ]; then
            log_warn "No new commits to deploy"
        fi
    fi
    
    log_info "✅ Code updated"
}

build_images() {
    log_step "4/10 Building Docker images..."
    
    docker-compose build --no-cache
    
    log_info "✅ Docker images built successfully"
}

pre_deploy_tests() {
    log_step "5/10 Running pre-deployment tests..."
    
    # Run unit tests in container
    log_info "Running unit tests..."
    docker-compose run --rm app pnpm test || {
        log_error "Tests failed!"
        exit 1
    }
    
    log_info "✅ Pre-deployment tests passed"
}

stop_services() {
    log_step "6/10 Stopping old services..."
    
    # Graceful shutdown
    docker-compose stop app
    
    log_info "✅ Services stopped gracefully"
}

run_migrations() {
    log_step "7/10 Running database migrations..."
    
    # Ensure database is running
    docker-compose up -d mysql redis
    sleep 10
    
    # Run migrations
    docker-compose run --rm app pnpm db:migrate:prod
    
    log_info "✅ Migrations completed"
}

start_services() {
    log_step "8/10 Starting new services..."
    
    # Start all services
    docker-compose up -d
    
    log_info "✅ Services started"
}

health_checks() {
    log_step "9/10 Running health checks..."
    
    # Wait for startup
    log_info "Waiting for application startup (90 seconds)..."
    sleep 90
    
    # Health check with retries
    MAX_RETRIES=10
    RETRY_COUNT=0
    
    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        if curl -f http://localhost:3000/api/health &> /dev/null; then
            log_info "✅ Application health check passed"
            break
        else
            RETRY_COUNT=$((RETRY_COUNT + 1))
            log_warn "Health check attempt $RETRY_COUNT/$MAX_RETRIES failed, retrying..."
            sleep 10
        fi
    done
    
    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
        log_error "❌ Application failed to start"
        log_info "Showing logs:"
        docker-compose logs app --tail=100
        log_error "Deployment failed - initiating rollback"
        rollback
        exit 1
    fi
    
    # Check critical services
    if ! docker exec hk-nova-mysql mysqladmin ping -h localhost &> /dev/null; then
        log_error "❌ MySQL health check failed"
        rollback
        exit 1
    fi
    
    if ! docker exec hk-nova-redis redis-cli ping &> /dev/null; then
        log_error "❌ Redis health check failed"
        rollback
        exit 1
    fi
    
    log_info "✅ All health checks passed"
}

smoke_tests() {
    log_step "10/10 Running smoke tests..."
    
    # Test API endpoints
    log_info "Testing API endpoints..."
    
    # Metrics
    if curl -s http://localhost:3000/api/metrics | grep -q "up 1"; then
        log_info "✅ Metrics endpoint working"
    else
        log_error "❌ Metrics endpoint failed"
        rollback
        exit 1
    fi
    
    # Workers
    WORKERS_HEALTHY=$(curl -s http://localhost:3000/api/workers/status | jq '[.[] | select(.healthy == true)] | length')
    log_info "Healthy workers: $WORKERS_HEALTHY"
    
    if [ "$WORKERS_HEALTHY" -gt 0 ]; then
        log_info "✅ Workers are operational"
    else
        log_warn "⚠️  No healthy workers detected"
    fi
    
    log_info "✅ Smoke tests completed"
}

rollback() {
    log_error "Initiating rollback..."
    
    # Stop current deployment
    docker-compose stop app
    
    # Restore database backup
    LATEST_BACKUP=$(cat "$BACKUP_DIR/latest-backup.txt" 2>/dev/null || echo "")
    
    if [ -n "$LATEST_BACKUP" ] && [ -f "$LATEST_BACKUP" ]; then
        log_info "Restoring database from: $LATEST_BACKUP"
        
        # Decompress and restore
        gunzip -c "$LATEST_BACKUP" | docker exec -i hk-nova-mysql mysql -u root -p"${MYSQL_ROOT_PASSWORD}" hk_nova
        
        log_info "✅ Database restored"
    else
        log_warn "No backup found to restore"
    fi
    
    # Start services with old version
    log_info "Restarting services..."
    docker-compose start app
    
    log_error "Rollback completed - please investigate the issue"
}

post_deploy_monitoring() {
    log_info "Monitoring deployment..."
    
    echo ""
    log_info "📊 Access monitoring dashboards:"
    echo "   Application: http://localhost:3000"
    echo "   Metrics: http://localhost:3000/api/metrics"
    echo "   Grafana: http://localhost:3001"
    echo "   Prometheus: http://localhost:9090"
    echo ""
    log_info "📋 View logs: docker-compose logs -f app"
    log_info "📊 Check status: docker-compose ps"
    echo ""
    log_warn "⚠️  Monitor the application for the next 1 hour"
    log_warn "⚠️  Watch for errors: docker-compose logs -f --tail=100"
}

# Main execution
main() {
    log_info "Starting production deployment..."
    echo ""
    
    confirm_production
    check_prerequisites
    create_backup
    pull_latest_code
    build_images
    pre_deploy_tests
    stop_services
    run_migrations
    start_services
    health_checks
    smoke_tests
    post_deploy_monitoring
    
    echo ""
    log_info "🎉 Production deployment completed successfully!"
    log_info "Deployment time: $(date)"
}

# Handle script arguments
case "${1:-deploy}" in
    deploy)
        main
        ;;
    rollback)
        rollback
        ;;
    status)
        docker-compose ps
        ;;
    logs)
        docker-compose logs -f
        ;;
    health)
        health_checks
        ;;
    *)
        echo "Usage: $0 {deploy|rollback|status|logs|health}"
        exit 1
        ;;
esac

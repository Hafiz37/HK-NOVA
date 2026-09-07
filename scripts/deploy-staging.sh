#!/bin/bash
set -euo pipefail

echo "🚀 HK-NOVA Staging Deployment Script"
echo "======================================"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
STAGING_DIR="/opt/hk-nova-staging"
BACKUP_DIR="/opt/hk-nova-backups"
COMPOSE_FILE="docker-compose.yml"
COMPOSE_OVERRIDE="docker-compose.staging.yml"

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

check_prerequisites() {
    log_info "Checking prerequisites..."
    
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
    
    # Check if .env.staging exists
    if [ ! -f .env.staging ]; then
        log_error ".env.staging file not found"
        exit 1
    fi
    
    log_info "✅ All prerequisites met"
}

backup_database() {
    log_info "Creating database backup..."
    
    mkdir -p "$BACKUP_DIR"
    BACKUP_FILE="$BACKUP_DIR/staging-backup-$(date +%Y%m%d-%H%M%S).sql"
    
    # Backup if database is running
    if docker ps | grep -q hk-nova-mysql; then
        docker exec hk-nova-mysql mysqldump \
            -u root \
            -p"${MYSQL_ROOT_PASSWORD:-root_password_change_me}" \
            hk_nova_staging > "$BACKUP_FILE" 2>/dev/null || true
        
        if [ -f "$BACKUP_FILE" ]; then
            log_info "✅ Database backed up to: $BACKUP_FILE"
        else
            log_warn "No existing database to backup"
        fi
    else
        log_warn "MySQL container not running, skipping backup"
    fi
}

build_application() {
    log_info "Building Docker images..."
    
    docker-compose -f "$COMPOSE_FILE" -f "$COMPOSE_OVERRIDE" build --no-cache
    
    log_info "✅ Docker images built successfully"
}

stop_services() {
    log_info "Stopping existing services..."
    
    docker-compose -f "$COMPOSE_FILE" -f "$COMPOSE_OVERRIDE" down
    
    log_info "✅ Services stopped"
}

start_services() {
    log_info "Starting services..."
    
    # Start database and redis first
    docker-compose -f "$COMPOSE_FILE" -f "$COMPOSE_OVERRIDE" up -d mysql redis
    
    log_info "Waiting for database to be ready..."
    sleep 10
    
    # Run migrations
    log_info "Running database migrations..."
    docker-compose -f "$COMPOSE_FILE" -f "$COMPOSE_OVERRIDE" run --rm app pnpm db:migrate:prod
    
    # Start all services
    docker-compose -f "$COMPOSE_FILE" -f "$COMPOSE_OVERRIDE" up -d
    
    log_info "✅ Services started"
}

health_check() {
    log_info "Running health checks..."
    
    # Wait for application to start
    log_info "Waiting for application startup (60 seconds)..."
    sleep 60
    
    # Check app health
    if curl -f http://localhost:3000/api/health &> /dev/null; then
        log_info "✅ Application health check passed"
    else
        log_error "❌ Application health check failed"
        log_info "Showing application logs:"
        docker-compose -f "$COMPOSE_FILE" -f "$COMPOSE_OVERRIDE" logs app --tail=50
        exit 1
    fi
    
    # Check MySQL
    if docker exec hk-nova-mysql mysqladmin ping -h localhost &> /dev/null; then
        log_info "✅ MySQL health check passed"
    else
        log_error "❌ MySQL health check failed"
        exit 1
    fi
    
    # Check Redis
    if docker exec hk-nova-redis redis-cli ping &> /dev/null; then
        log_info "✅ Redis health check passed"
    else
        log_error "❌ Redis health check failed"
        exit 1
    fi
}

smoke_tests() {
    log_info "Running smoke tests..."
    
    # Test metrics endpoint
    if curl -s http://localhost:3000/api/metrics | grep -q "up 1"; then
        log_info "✅ Metrics endpoint working"
    else
        log_warn "⚠️  Metrics endpoint check failed"
    fi
    
    # Test workers status
    WORKERS_JSON=$(curl -s http://localhost:3000/api/workers/status)
    if echo "$WORKERS_JSON" | jq -e '.[] | select(.healthy == true)' &> /dev/null; then
        log_info "✅ Workers are healthy"
    else
        log_warn "⚠️  Some workers may not be healthy"
    fi
}

show_status() {
    log_info "Deployment Status:"
    echo ""
    docker-compose -f "$COMPOSE_FILE" -f "$COMPOSE_OVERRIDE" ps
    echo ""
    log_info "Application URL: http://localhost:3000"
    log_info "Grafana URL: http://localhost:3001"
    log_info "Prometheus URL: http://localhost:9090"
    echo ""
    log_info "View logs with: docker-compose logs -f"
}

# Main execution
main() {
    log_info "Starting staging deployment..."
    echo ""
    
    check_prerequisites
    backup_database
    stop_services
    build_application
    start_services
    health_check
    smoke_tests
    show_status
    
    echo ""
    log_info "🎉 Staging deployment completed successfully!"
}

# Handle script arguments
case "${1:-deploy}" in
    deploy)
        main
        ;;
    stop)
        stop_services
        ;;
    restart)
        stop_services
        start_services
        health_check
        ;;
    logs)
        docker-compose -f "$COMPOSE_FILE" -f "$COMPOSE_OVERRIDE" logs -f
        ;;
    status)
        show_status
        ;;
    *)
        echo "Usage: $0 {deploy|stop|restart|logs|status}"
        exit 1
        ;;
esac

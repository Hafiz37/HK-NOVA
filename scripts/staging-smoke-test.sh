#!/bin/bash
set -euo pipefail

echo "🧪 HK-NOVA Staging Smoke Tests"
echo "==============================="
echo ""

# Configuration
BASE_URL="${BASE_URL:-http://localhost:3000}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASS="${ADMIN_PASS:-admin123}"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Functions
test_passed() {
    echo -e "${GREEN}✅ PASS${NC}: $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
}

test_failed() {
    echo -e "${RED}❌ FAIL${NC}: $1"
    echo -e "   ${RED}$2${NC}"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
}

test_section() {
    echo ""
    echo -e "${YELLOW}━━━ $1 ━━━${NC}"
}

# Test 1: Health Check
test_section "System Health"

HEALTH_RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/health.json "$BASE_URL/api/health")
if [ "$HEALTH_RESPONSE" = "200" ]; then
    test_passed "Health endpoint returns 200"
else
    test_failed "Health endpoint" "Expected 200, got $HEALTH_RESPONSE"
fi

if jq -e '.status == "healthy"' /tmp/health.json &> /dev/null; then
    test_passed "Application status is healthy"
else
    test_failed "Application status" "Status is not healthy"
fi

# Test 2: Database Connectivity
test_section "Database"

if jq -e '.database.connected == true' /tmp/health.json &> /dev/null; then
    test_passed "Database connection established"
else
    test_failed "Database connection" "Database not connected"
fi

# Test 3: Redis Connectivity
test_section "Redis Cache"

if jq -e '.redis.connected == true' /tmp/health.json &> /dev/null; then
    test_passed "Redis connection established"
else
    test_failed "Redis connection" "Redis not connected"
fi

# Test 4: Metrics Endpoint
test_section "Monitoring"

METRICS_RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/metrics.txt "$BASE_URL/api/metrics")
if [ "$METRICS_RESPONSE" = "200" ]; then
    test_passed "Metrics endpoint accessible"
else
    test_failed "Metrics endpoint" "Expected 200, got $METRICS_RESPONSE"
fi

if grep -q "up 1" /tmp/metrics.txt; then
    test_passed "Prometheus 'up' metric present"
else
    test_failed "Prometheus metrics" "'up' metric not found"
fi

# Test 5: Workers Status
test_section "Worker Health"

WORKERS_RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/workers.json "$BASE_URL/api/workers/status")
if [ "$WORKERS_RESPONSE" = "200" ]; then
    test_passed "Workers status endpoint accessible"
    
    HEALTHY_WORKERS=$(jq '[.[] | select(.healthy == true)] | length' /tmp/workers.json)
    TOTAL_WORKERS=$(jq 'length' /tmp/workers.json)
    
    if [ "$HEALTHY_WORKERS" -gt 0 ]; then
        test_passed "Workers are running ($HEALTHY_WORKERS/$TOTAL_WORKERS healthy)"
    else
        test_failed "Worker health" "No healthy workers found"
    fi
else
    test_failed "Workers status" "Expected 200, got $WORKERS_RESPONSE"
fi

# Test 6: Authentication
test_section "Authentication"

LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}" \
    -w "%{http_code}" -o /tmp/login.json)

if [ "$LOGIN_RESPONSE" = "200" ]; then
    test_passed "Login endpoint working"
    
    if jq -e '.token' /tmp/login.json &> /dev/null; then
        test_passed "JWT token received"
        TOKEN=$(jq -r '.token' /tmp/login.json)
    else
        test_failed "JWT token" "Token not present in response"
    fi
else
    test_failed "Authentication" "Login failed with code $LOGIN_RESPONSE"
fi

# Test 7: API Endpoints (Authenticated)
test_section "API Endpoints"

if [ -n "${TOKEN:-}" ]; then
    # Test devices endpoint
    DEVICES_RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/devices.json \
        -H "Authorization: Bearer $TOKEN" \
        "$BASE_URL/api/devices?limit=5")
    
    if [ "$DEVICES_RESPONSE" = "200" ]; then
        test_passed "Devices API endpoint accessible"
    else
        test_failed "Devices API" "Expected 200, got $DEVICES_RESPONSE"
    fi
    
    # Test alerts endpoint
    ALERTS_RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/alerts.json \
        -H "Authorization: Bearer $TOKEN" \
        "$BASE_URL/api/alerts?limit=5")
    
    if [ "$ALERTS_RESPONSE" = "200" ]; then
        test_passed "Alerts API endpoint accessible"
    else
        test_failed "Alerts API" "Expected 200, got $ALERTS_RESPONSE"
    fi
    
    # Test workflows endpoint
    WORKFLOWS_RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/workflows.json \
        -H "Authorization: Bearer $TOKEN" \
        "$BASE_URL/api/workflows")
    
    if [ "$WORKFLOWS_RESPONSE" = "200" ]; then
        test_passed "Workflows API endpoint accessible"
    else
        test_failed "Workflows API" "Expected 200, got $WORKFLOWS_RESPONSE"
    fi
else
    test_failed "API Tests" "No authentication token available"
fi

# Test 8: Rate Limiting
test_section "Security - Rate Limiting"

# Make 6 rapid requests to test rate limiting
RATE_LIMIT_TRIGGERED=false
for i in {1..6}; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"username":"test","password":"wrong"}')
    
    if [ "$STATUS" = "429" ]; then
        RATE_LIMIT_TRIGGERED=true
        break
    fi
    sleep 0.1
done

if [ "$RATE_LIMIT_TRIGGERED" = true ]; then
    test_passed "Rate limiting is active"
else
    test_failed "Rate limiting" "Expected 429 status code after multiple requests"
fi

# Test 9: OpenAPI Documentation
test_section "Documentation"

OPENAPI_RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/openapi.json "$BASE_URL/api/openapi.json")
if [ "$OPENAPI_RESPONSE" = "200" ]; then
    test_passed "OpenAPI specification accessible"
else
    test_failed "OpenAPI spec" "Expected 200, got $OPENAPI_RESPONSE"
fi

# Test 10: Docker Services
test_section "Docker Services"

if docker ps | grep -q hk-nova-mysql; then
    test_passed "MySQL container is running"
else
    test_failed "MySQL container" "Container not running"
fi

if docker ps | grep -q hk-nova-redis; then
    test_passed "Redis container is running"
else
    test_failed "Redis container" "Container not running"
fi

if docker ps | grep -q hk-nova-app; then
    test_passed "Application container is running"
else
    test_failed "Application container" "Container not running"
fi

# Test 11: Container Health
test_section "Container Health"

APP_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' hk-nova-app 2>/dev/null || echo "unknown")
if [ "$APP_HEALTH" = "healthy" ]; then
    test_passed "Application container is healthy"
else
    test_failed "Application health" "Status: $APP_HEALTH"
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test Results Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Total Tests: $TESTS_TOTAL"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All smoke tests passed!${NC}"
    echo ""
    echo "Staging environment is ready for testing."
    exit 0
else
    echo -e "${RED}❌ Some tests failed${NC}"
    echo ""
    echo "Please review the failures before proceeding."
    exit 1
fi

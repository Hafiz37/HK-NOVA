#!/bin/bash

# HK-Nova Smoke Test Suite
# Run this after deployment to verify system health

set -e

echo "╔════════════════════════════════════════════════════════════════════════╗"
echo "║                                                                        ║"
echo "║              🧪 HK-Nova Smoke Test Suite 🧪                           ║"
echo "║                                                                        ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"
echo ""

BASE_URL="${1:-http://localhost:3000}"
FAILED=0
PASSED=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

test_endpoint() {
    local name="$1"
    local url="$2"
    local expected_status="${3:-200}"
    
    echo -n "Testing $name... "
    
    response=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
    
    if [ "$response" = "$expected_status" ]; then
        echo -e "${GREEN}✓ PASS${NC} (HTTP $response)"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC} (Expected $expected_status, got $response)"
        ((FAILED++))
        return 1
    fi
}

test_json_response() {
    local name="$1"
    local url="$2"
    local json_path="$3"
    
    echo -n "Testing $name... "
    
    response=$(curl -s "$url" 2>/dev/null)
    
    if echo "$response" | jq -e "$json_path" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASS${NC}"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC} (JSON path $json_path not found)"
        ((FAILED++))
        return 1
    fi
}

echo "Running smoke tests against: $BASE_URL"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Basic Connectivity Tests"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test health endpoint
test_endpoint "Health Check" "$BASE_URL/api/health" "200"

# Test metrics endpoint
test_endpoint "Prometheus Metrics" "$BASE_URL/api/metrics" "200"

# Test login page
test_endpoint "Login Page" "$BASE_URL/login" "200"

# Test API docs
test_endpoint "API Documentation" "$BASE_URL/docs/api" "200"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "API Endpoint Tests (Unauthenticated - Should Return 401)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_endpoint "Devices API" "$BASE_URL/api/devices" "401"
test_endpoint "Alerts API" "$BASE_URL/api/alerts" "401"
test_endpoint "Workers Status" "$BASE_URL/api/workers/status" "401"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Monitoring & Metrics Tests"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if metrics contain expected data
echo -n "Testing Prometheus metrics format... "
if curl -s "$BASE_URL/api/metrics" | grep -q "http_requests_total"; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}"
    ((FAILED++))
fi

# Test platform health
test_json_response "Platform Health JSON" "$BASE_URL/api/platform/health" ".memory"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Static Assets Tests"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_endpoint "Dashboard Page" "$BASE_URL/dashboard" "307"
test_endpoint "OpenAPI Spec" "$BASE_URL/api-docs" "200"

echo ""
echo "╔════════════════════════════════════════════════════════════════════════╗"
echo "║                          Test Results                                  ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"
echo ""
echo -e "Total Tests: $((PASSED + FAILED))"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All smoke tests passed!${NC}"
    echo ""
    exit 0
else
    echo -e "${RED}❌ Some tests failed. Please investigate.${NC}"
    echo ""
    exit 1
fi

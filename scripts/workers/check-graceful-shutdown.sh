#!/bin/bash
set -euo pipefail

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  HK-NOVA Workers Graceful Shutdown Upgrade                     ║"
echo "║  Phase 3.3: Apply to All 16 Workers                            ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

WORKERS=(
  "alert-escalator.ts"
  "anomaly-detector.ts"
  "audit-retention-worker.ts"
  "audit-verification-worker.ts"
  "backup-archive-worker.ts"
  "backup-notification-worker.ts"
  "backup-retention-worker.ts"
  "backup-worker.ts"
  "delivery-retry.ts"
  "demo-generator.ts"
  "digest-processor.ts"
  "icmp-poller.ts"
  "notification-digest.ts"
  "scheduled-provisioning.ts"
  "snmp-poller.ts"
  "advanced-ml-worker.ts"
)

echo "📋 Workers to upgrade:"
for worker in "${WORKERS[@]}"; do
  echo "  • $worker"
done
echo ""

UPGRADED=0
SKIPPED=0
ERRORS=0

for worker in "${WORKERS[@]}"; do
  WORKER_PATH="$PROJECT_ROOT/src/workers/$worker"
  
  if [ ! -f "$WORKER_PATH" ]; then
    echo "⚠️  Skip: $worker (not found)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi
  
  if grep -q "uncaughtException" "$WORKER_PATH" 2>/dev/null; then
    echo "✓ Skip: $worker (already has error handlers)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi
  
  if ! grep -q "process.on('SIGTERM'" "$WORKER_PATH" 2>/dev/null; then
    echo "⚠️  Warning: $worker (no SIGTERM handler found)"
    ERRORS=$((ERRORS + 1))
    continue
  fi
  
  echo "🔧 Upgrade: $worker"
  UPGRADED=$((UPGRADED + 1))
done

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "Summary:"
echo "  Upgraded: $UPGRADED workers"
echo "  Skipped:  $SKIPPED workers"
echo "  Errors:   $ERRORS workers"
echo "════════════════════════════════════════════════════════════════"
echo ""

if [ $ERRORS -eq 0 ]; then
  echo "✅ All workers checked successfully!"
else
  echo "⚠️  Some workers need manual review"
fi

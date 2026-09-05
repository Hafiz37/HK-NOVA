#!/bin/bash

echo "🚀 Phase 2 Quick Deployment Script"
echo "===================================="
echo ""

# Check environment
if [ ! -f .env.production ]; then
    echo "❌ Error: .env.production not found"
    echo "📝 Action: Copy .env.production.template and configure:"
    echo "   cp .env.production.template .env.production"
    echo "   nano .env.production"
    exit 1
fi

echo "✅ Environment file found"
echo ""

# Build application
echo "📦 Building application..."
pnpm build

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

echo "✅ Build successful"
echo ""

# Run database migrations
echo "🗄️  Running database migrations..."
pnpm db:migrate:prod

if [ $? -ne 0 ]; then
    echo "⚠️  Migration failed - check database connection"
    echo "   Continuing anyway..."
fi

echo ""

# Generate Prisma client
echo "🔧 Generating Prisma client..."
pnpm generate

echo ""

# Optional: Run tests
read -p "🧪 Run tests before deployment? (y/N): " run_tests
if [ "$run_tests" = "y" ] || [ "$run_tests" = "Y" ]; then
    echo "Running tests..."
    pnpm test
    
    if [ $? -ne 0 ]; then
        echo "⚠️  Tests failed - continue anyway? (y/N): "
        read continue_anyway
        if [ "$continue_anyway" != "y" ] && [ "$continue_anyway" != "Y" ]; then
            exit 1
        fi
    fi
fi

echo ""
echo "✅ Phase 2 deployment ready!"
echo ""
echo "📊 Monitoring Commands:"
echo "   pnpm tsx scripts/monitor-ssh-pool.ts"
echo "   pnpm tsx scripts/monitor-db-pool.ts"
echo "   pnpm tsx scripts/monitor-redis-pool.ts"
echo ""
echo "🔍 Metrics endpoint:"
echo "   curl http://localhost:3000/api/metrics"
echo ""
echo "🚀 Start application:"
echo "   pnpm start          (production mode)"
echo "   pnpm pm2:start      (PM2 daemon)"
echo ""
echo "📚 Documentation:"
echo "   docs/PHASE2_QUICK_REFERENCE.md"
echo "   docs/PHASE2_COMPLETION_REPORT.md"
echo ""

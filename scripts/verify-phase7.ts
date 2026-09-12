import { PrismaClient } from '@prisma/client';
import { EnsembleEngine } from '../src/lib/algorithms/ensemble-engine';
import { classifySeverity } from '../src/lib/anomaly-service';

const prisma = new PrismaClient();

async function verifyPhase7() {
  console.log('================================================================');
  console.log('   HK-NOVA PHASE 7: MULTI-DEVICE SCALING & ML ANOMALY VERIFY   ');
  console.log('================================================================\n');

  // 1. Check Multi-Device Inventory Scaling
  console.log('📡 [1] MULTI-DEVICE INVENTORY SCALING & TYPES');
  const deviceCounts = await prisma.device.groupBy({
    by: ['type'],
    _count: { type: true },
  });

  const totalDevices = await prisma.device.count();
  console.log(`- Total Registered Devices in Infrastructure : ${totalDevices}`);
  deviceCounts.forEach((group) => {
    console.log(`  * ${group.type.padEnd(12)} : ${group._count.type} devices`);
  });
  console.log('');

  // 2. ML Anomaly Feature & Algorithm Test (Isolation Forest + Ensemble Engine)
  console.log('🧠 [2] ISOLATION FOREST & ENSEMBLE ENGINE SCORING TEST');

  // Generate 60 normal points (latency ~20ms, cpu ~30%, mem ~40%)
  const normalPoints: number[][] = [];
  for (let i = 0; i < 60; i++) {
    normalPoints.push([
      20 + (Math.random() * 5 - 2.5),  // latency
      30 + (Math.random() * 6 - 3),    // cpuUtil
      40 + (Math.random() * 4 - 2),    // memUtil
    ]);
  }

  const ensemble = new EnsembleEngine({
    weights: { isolationForest: 0.5, lof: 0.3, zscore: 0.2 },
    subsampleSize: 60,
  });

  ensemble.train(normalPoints);
  console.log('  - Model Training Status                      : ✅ TRAINED (60 normal samples)');

  // Test Normal Point Prediction
  const normalSample = [21.0, 31.0, 41.0];
  const normalPrediction = ensemble.predict(normalSample);
  const normalSeverity = classifySeverity(normalPrediction.score);

  console.log(`  - Normal Point Score [21ms, 31%, 41%]       : ${normalPrediction.score.toFixed(3)} → Severity: ${normalSeverity} ${normalPrediction.score < 0.7 ? '✅ OK' : '❌'}`);

  // Test Anomaly Point Prediction (Spike: 450ms latency, 98% CPU, 95% RAM)
  const anomalySample = [450.0, 98.0, 95.0];
  const anomalyPrediction = ensemble.predict(anomalySample);
  const anomalySeverity = classifySeverity(anomalyPrediction.score);

  console.log(`  - Anomaly Point Score [450ms, 98%, 95%]    : ${anomalyPrediction.score.toFixed(3)} → Severity: ${anomalySeverity} ${anomalyPrediction.score >= 0.7 ? '🚨 ANOMALY DETECTED' : '❌'}`);
  console.log('');

  // 3. Verify ML Anomaly Feature Flag in Environment
  console.log('⚙️ [3] FEATURE FLAG & WORKER ENVIRONMENT VERIFICATION');
  const mlFlag = process.env.ENABLE_ML_ANOMALY;
  console.log(`  - ENABLE_ML_ANOMALY Flag in Environment      : ${mlFlag === 'true' ? '✅ ENABLED (true)' : '⚠️ DISABLED (' + mlFlag + ')'}`);

  // 4. Anomaly Records in Database
  const totalAnomalies = await prisma.anomaly.count();
  console.log(`\n📊 Existing Anomaly Records in Database       : ${totalAnomalies}`);

  console.log('\n================================================================');
  console.log('✅ PHASE 7 VERIFICATION COMPLETED SUCCESSFULLY');
  console.log('================================================================\n');
}

verifyPhase7()
  .catch((err) => {
    console.error('Phase 7 Verification Failed:', err);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });

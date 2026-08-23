import { PrismaClient, Prisma } from '@prisma/client';
import { TrainedModel } from './anomaly-service';

export interface ModelHyperParams {
  nTrees: number;
  maxSamples: number;
  contamination: number;
}

export interface ModelPerformance {
  samplesUsed: number;
  featureCount: number;
  avgScore: number;
  maxScore: number;
  minScore: number;
  trainingTimeMs: number;
}

/**
 * Serializes an IsolationForest instance and its associated metadata into a JSON-storable format.
 */
export function serializeModel(model: TrainedModel): Record<string, unknown> {
  const forestData = model.forest ? {
    numberOfTrees: model.forest.numberOfTrees,
    subsampleSize: model.forest.subsampleSize,
    // Store trees structure if available
    trees: model.forest.trees ? model.forest.trees.map((tree: unknown) => {
      try {
        return JSON.parse(JSON.stringify(tree));
      } catch {
        return null;
      }
    }).filter(Boolean) : [],
  } : null;

  return {
    forest: forestData,
    deviceId: model.deviceId,
    featureNames: model.featureNames,
    stats: model.stats,
    scoreStats: model.scoreStats,
    trainedAt: model.trainedAt.toISOString(),
  };
}

/**
 * Saves or updates a trained model in the database.
 * Deactivates older active models for the same device/type.
 */
export async function saveModelToDb(
  prisma: PrismaClient,
  model: TrainedModel,
  options?: {
    deviceType?: string;
    hyperParams?: ModelHyperParams;
    performance?: ModelPerformance;
    algorithm?: string;
  }
): Promise<string> {
  const serialized = serializeModel(model);

  // Deactivate existing active models for this device
  if (model.deviceId) {
    await prisma.anomalyModel.updateMany({
      where: { deviceId: model.deviceId, isActive: true },
      data: { isActive: false },
    });
  }

  // Get current max version
  const lastModel = await prisma.anomalyModel.findFirst({
    where: { deviceId: model.deviceId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });

  const nextVersion = (lastModel?.version ?? 0) + 1;

  const created = await prisma.anomalyModel.create({
    data: {
      deviceId: model.deviceId || null,
      deviceType: options?.deviceType || null,
      modelData: serialized as object,
      algorithm: options?.algorithm || 'ISOLATION_FOREST',
      version: nextVersion,
      trainedAt: model.trainedAt,
      trainingSize: options?.performance?.samplesUsed || 0,
      featureNames: model.featureNames as object,
      stats: model.stats as object,
      scoreStats: model.scoreStats as object,
      performance: options?.performance ? (options.performance as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      hyperParams: options?.hyperParams ? (options.hyperParams as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      isActive: true,
    },
  });

  return created.id;
}

/**
 * Loads the active model for a given deviceId from the database.
 */
export async function loadActiveModelFromDb(
  prisma: PrismaClient,
  deviceId: string
): Promise<TrainedModel | null> {
  const record = await prisma.anomalyModel.findFirst({
    where: { deviceId, isActive: true },
    orderBy: { trainedAt: 'desc' },
  });

  if (!record || !record.modelData) {
    return null;
  }

  try {
    const data = record.modelData as Record<string, unknown>;
    
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const isoForestModule = require('isolation-forest');
    const IsolationForest = isoForestModule.IsolationForest ?? isoForestModule;

    const forestData = data.forest as { numberOfTrees?: number; subsampleSize?: number; trees?: unknown[] } | undefined;
    const nTrees = forestData?.numberOfTrees || 100;
    const subsample = forestData?.subsampleSize || 256;

    const forest = new IsolationForest(nTrees, subsample);
    if (forestData?.trees && Array.isArray(forestData.trees)) {
      forest.trees = forestData.trees;
    }

    return {
      forest,
      trainedAt: new Date(record.trainedAt),
      deviceId,
      featureNames: record.featureNames as string[],
      stats: record.stats as { mean: number[]; std: number[] },
      scoreStats: record.scoreStats as { mean: number; std: number; p90: number; p95: number; p99: number },
    };
  } catch (err) {
    console.error(`[ModelPersistence] Failed to reconstruct model for device ${deviceId}:`, err);
    return null;
  }
}

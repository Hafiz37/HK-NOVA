import { IsolationForest } from 'isolation-forest';
import { LocalOutlierFactor } from './lof';
import { buildStatisticalModel, scoreStatistical } from './statistical';
import { DBSCAN } from './dbscan';
import { TrainedModel } from '../anomaly-service';
import { StatisticalModel } from './statistical';

export interface AlgorithmResult {
  algorithm: string;
  score: number;           // 0-1 normalized
  isAnomaly: boolean;
  details?: Record<string, unknown>;
}

export interface EnsembleResult {
  algorithms: AlgorithmResult[];
  finalScore: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence: number;
  agreementCount: number;
  isAnomaly: boolean;
  explanation?: FeatureContribution[];
}

export interface FeatureContribution {
  featureName: string;
  value: number;
  normalValue: number;
  deviation: number;       // in standard deviations
  contribution: number;    // 0-1
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface EnsembleModels {
  isolationForest: TrainedModel | null;
  lof: LocalOutlierFactor | null;
  statistical: StatisticalModel | null;
  dbscan: DBSCAN | null;
}

export class EnsembleEngine {
  private models: EnsembleModels = {
    isolationForest: null,
    lof: null,
    statistical: null,
    dbscan: null,
  };
  private featureNames: string[] = [];
  private deviceId: string = '';

  // Algorithm weights for ensemble voting
  private readonly WEIGHTS = {
    isolationForest: 0.35,
    lof: 0.25,
    statistical: 0.25,
    dbscan: 0.15,
  };

  public async train(
    deviceId: string,
    trainData: number[][],
    featureNames: string[],
    iforestModel?: TrainedModel
  ): Promise<void> {
    this.deviceId = deviceId;
    this.featureNames = featureNames;

    // 1. Isolation Forest (use existing or train new)
    if (iforestModel) {
      this.models.isolationForest = iforestModel;
    } else if (trainData.length > 50) {
      // Train IF if not provided
      const forest = new IsolationForest(100, 256);
      const dataObjects = trainData.map((row) => {
        const obj: Record<string, number> = {};
        featureNames.forEach((name, i) => { obj[name] = row[i]; });
        return obj;
      });
      forest.fit(dataObjects);
      this.models.isolationForest = {
        forest,
        trainedAt: new Date(),
        deviceId,
        featureNames,
        stats: { mean: [], std: [] },
        scoreStats: { mean: 0, std: 1, p90: 0, p95: 0, p99: 0 },
      };
    }

    // 2. LOF
    if (trainData.length >= 10) {
      const lof = new LocalOutlierFactor({ k: Math.min(20, trainData.length - 1) });
      lof.fit(trainData);
      this.models.lof = lof;
    }

    // 3. Statistical Model
    if (trainData.length >= 20) {
      this.models.statistical = buildStatisticalModel(trainData);
    }

    // 4. DBSCAN
    if (trainData.length >= 30) {
      const dbscan = new DBSCAN({ eps: 0.5, minPts: 5, scaleFeatures: true });
      dbscan.fit(trainData);
      this.models.dbscan = dbscan;
    }
  }

  public predict(point: number[]): EnsembleResult {
    const results: AlgorithmResult[] = [];

    // Isolation Forest
    if (this.models.isolationForest) {
      const score = this.scoreIsolationForest(this.models.isolationForest, point);
      results.push({
        algorithm: 'IsolationForest',
        score,
        isAnomaly: score > 0.5,
        details: { method: 'tree-isolation' },
      });
    }

    // LOF
    if (this.models.lof) {
      const { normalizedScore, isAnomaly } = this.models.lof.predictPoint(point);
      results.push({
        algorithm: 'LOF',
        score: normalizedScore,
        isAnomaly,
        details: { method: 'local-density' },
      });
    }

    // Statistical
    if (this.models.statistical) {
      const statResult = scoreStatistical(this.models.statistical, point);
      results.push({
        algorithm: 'Statistical',
        score: statResult.combinedScore,
        isAnomaly: statResult.isAnomaly,
        details: {
          zScore: statResult.zScore,
          iqrScore: statResult.iqrScore,
          madScore: statResult.madScore,
          anomalyFeatures: statResult.anomalyFeatures,
        },
      });
    }

    // DBSCAN
    if (this.models.dbscan) {
      const { score, isAnomaly } = this.models.dbscan.predict(point);
      results.push({
        algorithm: 'DBSCAN',
        score,
        isAnomaly,
        details: { method: 'density-clustering' },
      });
    }

    // Ensemble voting
    return this.vote(results, point);
  }

  private scoreIsolationForest(model: TrainedModel, features: number[]): number {
    try {
      const { normalized } = this.normalizeWithStats([features], model.stats);
      const dataObject: Record<string, number> = {};
      model.featureNames.forEach((name, i) => { dataObject[name] = normalized[0][i]; });
      const scores = model.forest.predict([dataObject]);
      return Array.isArray(scores) && scores.length > 0 ? Math.max(0, Math.min(1, scores[0])) : 0;
    } catch {
      return 0;
    }
  }

  private normalizeWithStats(
    data: number[][],
    stats: { mean: number[]; std: number[] }
  ): { normalized: number[][]; stats: { mean: number[]; std: number[] } } {
    if (data.length === 0) return { normalized: [], stats: { mean: [], std: [] } };
    const normalized = data.map((row) =>
      row.map((val, i) => {
        if (val == null || isNaN(val)) return 0;
        const m = stats.mean[i] ?? 0;
        const s = stats.std[i] ?? 1;
        return s > 0 ? (val - m) / s : 0;
      })
    );
    return { normalized, stats };
  }

  private vote(results: AlgorithmResult[], point: number[]): EnsembleResult {
    if (results.length === 0) {
      return {
        algorithms: [],
        finalScore: 0,
        severity: 'LOW',
        confidence: 0,
        agreementCount: 0,
        isAnomaly: false,
      };
    }

    // Weighted score
    let weightedSum = 0;
    let totalWeight = 0;
    let anomalyVotes = 0;

    for (const r of results) {
      const weight = this.WEIGHTS[r.algorithm as keyof typeof this.WEIGHTS] ?? 0.25;
      weightedSum += r.score * weight;
      totalWeight += weight;
      if (r.isAnomaly) anomalyVotes++;
    }

    const finalScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
    const confidence = results.length > 0 ? anomalyVotes / results.length : 0;

    // Severity based on final score and agreement
    let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    if (finalScore >= 0.8 && confidence >= 0.75) severity = 'CRITICAL';
    else if (finalScore >= 0.65 && confidence >= 0.5) severity = 'HIGH';
    else if (finalScore >= 0.4) severity = 'MEDIUM';
    else severity = 'LOW';

    // Explainability: feature contributions
    const explanation = this.explainAnomaly(point, results);

    return {
      algorithms: results,
      finalScore,
      severity,
      confidence,
      agreementCount: anomalyVotes,
      isAnomaly: anomalyVotes >= Math.ceil(results.length / 2) && finalScore > 0.4,
      explanation,
    };
  }

  private explainAnomaly(point: number[], results: AlgorithmResult[]): FeatureContribution[] {
    if (!this.models.isolationForest || this.featureNames.length === 0) {
      return [];
    }

    const contributions: FeatureContribution[] = [];
    const baseScore = this.scoreIsolationForest(this.models.isolationForest, point);
    const stats = this.models.isolationForest.stats;

    // Ablation study: remove each feature and measure score drop
    for (let i = 0; i < Math.min(point.length, this.featureNames.length); i++) {
      const modifiedPoint = [...point];
      const normalVal = stats.mean[i] ?? 0;
      modifiedPoint[i] = normalVal; // Set to normal value

      const modifiedScore = this.scoreIsolationForest(this.models.isolationForest, modifiedPoint);
      const contribution = Math.max(0, baseScore - modifiedScore);

      const stdDev = stats.std[i] ?? 1;
      const deviation = stdDev > 0 ? Math.abs(point[i] - normalVal) / stdDev : 0;

      let severity: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
      if (contribution > 0.15) severity = 'HIGH';
      else if (contribution > 0.05) severity = 'MEDIUM';

      contributions.push({
        featureName: this.featureNames[i],
        value: point[i],
        normalValue: normalVal,
        deviation,
        contribution,
        severity,
      });
    }

    // Sort by contribution descending
    return contributions
      .filter((c) => c.contribution > 0.01)
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 5);
  }

  public getModels(): EnsembleModels {
    return { ...this.models };
  }
}

export function createEnsembleEngine(): EnsembleEngine {
  return new EnsembleEngine();
}
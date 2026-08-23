/**
 * Local Outlier Factor (LOF) implementation for multi-dimensional anomaly detection.
 * Measures the local density deviation of a given data point with respect to its k-nearest neighbors.
 */

export interface LOFOptions {
  k?: number; // Number of nearest neighbors (default: 20)
}

function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export class LocalOutlierFactor {
  private k: number;
  private trainData: number[][] = [];
  private kDistances: number[] = [];
  private kNeighborsList: number[][] = [];
  private lrdScores: number[] = [];

  constructor(options: LOFOptions = {}) {
    this.k = options.k ?? 20;
  }

  public fit(data: number[][]): void {
    if (data.length === 0) return;
    this.trainData = data;
    const n = data.length;
    const effectiveK = Math.min(this.k, n - 1);

    if (effectiveK <= 0) return;

    // 1. Calculate pairwise distance matrix
    const distMatrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = euclideanDistance(data[i], data[j]);
        distMatrix[i][j] = d;
        distMatrix[j][i] = d;
      }
    }

    // 2. Find k-distances & k-neighbors for each point
    this.kDistances = new Array(n);
    this.kNeighborsList = new Array(n);

    for (let i = 0; i < n; i++) {
      const neighbors = Array.from({ length: n }, (_, idx) => idx)
        .filter((idx) => idx !== i)
        .map((idx) => ({ idx, dist: distMatrix[i][idx] }))
        .sort((a, b) => a.dist - b.dist);

      const kDist = neighbors[effectiveK - 1]?.dist ?? 0;
      this.kDistances[i] = kDist;

      // k-neighbors include all points with distance <= k-distance
      const kNeighbors = neighbors.filter((item) => item.dist <= kDist).map((item) => item.idx);
      this.kNeighborsList[i] = kNeighbors;
    }

    // 3. Calculate Local Reachability Density (LRD)
    this.lrdScores = new Array(n);
    for (let i = 0; i < n; i++) {
      const kNeighbors = this.kNeighborsList[i];
      if (kNeighbors.length === 0) {
        this.lrdScores[i] = 0;
        continue;
      }

      let reachDistSum = 0;
      for (const neighborIdx of kNeighbors) {
        const actualDist = distMatrix[i][neighborIdx];
        const reachDist = Math.max(actualDist, this.kDistances[neighborIdx]);
        reachDistSum += reachDist;
      }

      this.lrdScores[i] = reachDistSum > 0 ? kNeighbors.length / reachDistSum : 0;
    }
  }

  public predictPoint(point: number[]): { lofScore: number; normalizedScore: number; isAnomaly: boolean } {
    if (this.trainData.length === 0) {
      return { lofScore: 1, normalizedScore: 0, isAnomaly: false };
    }

    const effectiveK = Math.min(this.k, this.trainData.length);

    // Find distances to all training points
    const distances = this.trainData.map((trainPt, idx) => ({
      idx,
      dist: euclideanDistance(point, trainPt),
    })).sort((a, b) => a.dist - b.dist);

    const kNeighbors = distances.slice(0, effectiveK);
    if (kNeighbors.length === 0) {
      return { lofScore: 1, normalizedScore: 0, isAnomaly: false };
    }

    let reachDistSum = 0;
    for (const neighbor of kNeighbors) {
      const reachDist = Math.max(neighbor.dist, this.kDistances[neighbor.idx]);
      reachDistSum += reachDist;
    }

    const pointLrd = reachDistSum > 0 ? kNeighbors.length / reachDistSum : 0;

    // LOF score = average LRD of neighbors / LRD of point
    let lrdSum = 0;
    for (const neighbor of kNeighbors) {
      lrdSum += this.lrdScores[neighbor.idx];
    }

    const avgNeighborLrd = lrdSum / kNeighbors.length;
    const lofScore = pointLrd > 0 ? avgNeighborLrd / pointLrd : 1;

    // Normalize LOF score to 0-1 (LOF ~1 is normal, LOF > 1.5 is anomalous)
    const normalizedScore = Math.min(1, Math.max(0, (lofScore - 1) / 1.5));
    const isAnomaly = lofScore >= 1.5;

    return { lofScore, normalizedScore, isAnomaly };
  }
}

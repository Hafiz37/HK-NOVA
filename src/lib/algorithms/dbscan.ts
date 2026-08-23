/**
 * DBSCAN (Density-Based Spatial Clustering of Applications with Noise) for anomaly detection.
 * Points in sparse regions (noise/outliers) are considered anomalies.
 */

export interface DBSCANOptions {
  eps?: number;        // Maximum distance between two points to be neighbors
  minPts?: number;     // Minimum number of points to form a dense region
  scaleFeatures?: boolean;
}

export interface DBSCANModel {
  eps: number;
  minPts: number;
  clusters: number[];
  corePoints: Set<number>;
  trainData: number[];
  means: number[];
  stds: number[];
}

export class DBSCAN {
  private eps: number;
  private minPts: number;
  private scaleFeatures: boolean;
  private model: DBSCANModel | null = null;

  constructor(options: DBSCANOptions = {}) {
    this.eps = options.eps ?? 0.5;
    this.minPts = options.minPts ?? 5;
    this.scaleFeatures = options.scaleFeatures ?? true;
  }

  public fit(data: number[][]): void {
    if (data.length === 0) {
      this.model = { eps: this.eps, minPts: this.minPts, clusters: [], corePoints: new Set(), trainData: [], means: [], stds: [] };
      return;
    }

    const n = data.length;
    const d = data[0].length;

    // Normalize data if requested
    let scaledData = data;
    const means = new Array(d).fill(0);
    const stds = new Array(d).fill(1);

    if (this.scaleFeatures) {
      for (let i = 0; i < d; i++) {
        const col = data.map((row) => row[i]);
        const mean = col.reduce((a, b) => a + b, 0) / col.length;
        const variance = col.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / col.length;
        means[i] = mean;
        stds[i] = Math.sqrt(variance) || 1;
      }

      scaledData = data.map((row) =>
        row.map((val, i) => (val - means[i]) / stds[i])
      );
    }

    // Find core points and build clusters
    const visited = new Array(n).fill(false);
    const clusterId = new Array(n).fill(-1);
    let currentCluster = 0;
    const corePoints = new Set<number>();

    for (let i = 0; i < n; i++) {
      if (visited[i]) continue;
      visited[i] = true;

      const neighbors = this.regionQuery(scaledData, i);
      if (neighbors.length < this.minPts) {
        // Noise point (potential anomaly)
        continue;
      }

      corePoints.add(i);
      clusterId[i] = currentCluster;
      this.expandCluster(scaledData, visited, clusterId, i, currentCluster, corePoints);
      currentCluster++;
    }

    this.model = { eps: this.eps, minPts: this.minPts, clusters: clusterId, corePoints, trainData: scaledData.flat(), means, stds };
  }

  private regionQuery(data: number[][], pointIdx: number): number[] {
    const neighbors: number[] = [];
    const point = data[pointIdx];

    for (let i = 0; i < data.length; i++) {
      if (i === pointIdx) continue;
      if (this.euclideanDistance(point, data[i]) <= this.eps) {
        neighbors.push(i);
      }
    }
    return neighbors;
  }

  private expandCluster(
    data: number[][],
    visited: boolean[],
    clusterId: number[],
    pointIdx: number,
    cluster: number,
    corePoints: Set<number>
  ): void {
    const seeds = this.regionQuery(data, pointIdx);
    for (const neighborIdx of seeds) {
      if (!visited[neighborIdx]) {
        visited[neighborIdx] = true;
        const neighborNeighbors = this.regionQuery(data, neighborIdx);
        if (neighborNeighbors.length >= this.minPts) {
          corePoints.add(neighborIdx);
          seeds.push(...neighborNeighbors);
        }
      }
      if (clusterId[neighborIdx] === -1) {
        clusterId[neighborIdx] = cluster;
      }
    }
  }

  private euclideanDistance(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = (a[i] ?? 0) - (b[i] ?? 0);
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  public predict(point: number[]): { score: number; isAnomaly: boolean; cluster: number } {
    if (!this.model) {
      return { score: 0, isAnomaly: false, cluster: -1 };
    }

    // Scale the point
    let scaledPoint = point;
    if (this.scaleFeatures && this.model.means.length > 0) {
      scaledPoint = point.map((val, i) => (val - this.model!.means[i]) / this.model!.stds[i]);
    }

    // Find nearest core point
    let minDist = Infinity;
    let nearestCoreIdx = -1;

    const trainData = this.reconstructTrainData(this.model);

    for (const coreIdx of this.model.corePoints) {
      const dist = this.euclideanDistance(scaledPoint, trainData[coreIdx]);
      if (dist < minDist) {
        minDist = dist;
        nearestCoreIdx = coreIdx;
      }
    }

    if (nearestCoreIdx === -1 || minDist > this.eps) {
      return { score: 1, isAnomaly: true, cluster: -1 }; // Anomaly (noise)
    }

    return {
      score: Math.min(1, minDist / this.eps),
      isAnomaly: false,
      cluster: this.model.clusters[nearestCoreIdx],
    };
  }

  private reconstructTrainData(model: DBSCANModel): number[][] {
    if (model.trainData.length === 0) return [];
    const d = model.means.length;
    const n = model.trainData.length / d;
    const data: number[][] = [];
    for (let i = 0; i < n; i++) {
      data.push(model.trainData.slice(i * d, (i + 1) * d));
    }
    return data;
  }
}
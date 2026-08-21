/**
 * Largest-Triangle-Three-Buckets (LTTB) Downsampling Algorithm
 * Downsamples time-series data while preserving visual features, peaks, and troughs.
 */

export function lttb<T>(
  data: T[],
  threshold: number,
  xGetter: (item: T) => number,
  yGetter: (item: T) => number | null
): T[] {
  if (threshold >= data.length || threshold <= 0) {
    return data;
  }

  const sampled: T[] = [];
  const bucketSize = (data.length - 2) / (threshold - 2);

  let a = 0;
  sampled.push(data[a]!);

  for (let i = 0; i < threshold - 2; i++) {
    // Calculate point average for next bucket (bucket c)
    let avgX = 0;
    let avgY = 0;
    let avgRangeStart = Math.floor((i + 1) * bucketSize) + 1;
    let avgRangeEnd = Math.floor((i + 2) * bucketSize) + 1;
    avgRangeEnd = avgRangeEnd < data.length ? avgRangeEnd : data.length;

    const avgRangeLength = avgRangeEnd - avgRangeStart;

    if (avgRangeLength > 0) {
      let validCount = 0;
      for (; avgRangeStart < avgRangeEnd; avgRangeStart++) {
        const item = data[avgRangeStart]!;
        const yVal = yGetter(item);
        if (yVal !== null && !isNaN(yVal)) {
          avgX += xGetter(item);
          avgY += yVal;
          validCount++;
        }
      }
      if (validCount > 0) {
        avgX /= validCount;
        avgY /= validCount;
      }
    }

    // Get the range for current bucket (bucket b)
    let rangeOffs = Math.floor((i + 0) * bucketSize) + 1;
    const rangeTo = Math.floor((i + 1) * bucketSize) + 1;

    // Point a
    const pointAX = xGetter(data[a]!);
    const pointAY = yGetter(data[a]!) ?? 0;

    let maxArea = -1;
    let nextA = rangeOffs;

    for (; rangeOffs < rangeTo; rangeOffs++) {
      const item = data[rangeOffs];
      if (!item) continue;
      const pointY = yGetter(item);
      if (pointY === null || isNaN(pointY)) continue;

      const pointX = xGetter(item);

      // Calculate triangle area
      const area =
        Math.abs(
          (pointAX - avgX) * (pointY - pointAY) -
            (pointAX - pointX) * (avgY - pointAY)
        ) * 0.5;

      if (area > maxArea) {
        maxArea = area;
        nextA = rangeOffs;
      }
    }

    if (data[nextA]) {
      sampled.push(data[nextA]!);
      a = nextA;
    }
  }

  if (data[data.length - 1]) {
    sampled.push(data[data.length - 1]!);
  }

  return sampled;
}

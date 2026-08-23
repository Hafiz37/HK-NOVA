export interface DeviceTypeHyperParams {
  nTrees: number;
  maxSamples: number;
  contamination: number;
  minSamples: number;
  trainingDays: number;
}

export const DEVICE_TYPE_CONFIGS: Record<string, DeviceTypeHyperParams> = {
  ROUTER: {
    nTrees: 150,
    maxSamples: 512,
    contamination: 0.05,
    minSamples: 50,
    trainingDays: 7,
  },
  SWITCH: {
    nTrees: 100,
    maxSamples: 256,
    contamination: 0.03,
    minSamples: 50,
    trainingDays: 7,
  },
  OLT: {
    nTrees: 120,
    maxSamples: 384,
    contamination: 0.04,
    minSamples: 50,
    trainingDays: 7,
  },
  AP: {
    nTrees: 80,
    maxSamples: 200,
    contamination: 0.05,
    minSamples: 40,
    trainingDays: 7,
  },
  SERVER: {
    nTrees: 150,
    maxSamples: 512,
    contamination: 0.02,
    minSamples: 50,
    trainingDays: 7,
  },
  DEFAULT: {
    nTrees: 100,
    maxSamples: 256,
    contamination: 0.05,
    minSamples: 50,
    trainingDays: 7,
  },
};

export function getDeviceTypeConfig(deviceType?: string | null): DeviceTypeHyperParams {
  if (!deviceType) return DEVICE_TYPE_CONFIGS.DEFAULT;
  const key = deviceType.toUpperCase();
  return DEVICE_TYPE_CONFIGS[key] ?? DEVICE_TYPE_CONFIGS.DEFAULT;
}

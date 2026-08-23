import { z } from 'zod';
import { AnomalySeverity } from '@prisma/client';

const anomalySeverityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export const queryAnomalySchema = z.object({
  deviceId: z.string().optional(),
  severity: anomalySeverityEnum.optional(),
  modelId: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  hasFeedback: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  sortBy: z.enum(['createdAt', 'severity', 'score', 'confidence']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const anomalyFeedbackSchema = z.object({
  anomalyId: z.string().min(1, 'Anomaly ID is required'),
  userId: z.string().min(1, 'User ID is required'),
  isTruePositive: z.boolean(),
  note: z.string().max(2000).optional(),
});

export const injectAnomalySchema = z.object({
  deviceId: z.string().min(1, 'Device ID is required'),
  features: z.array(z.number()).length(33, 'Must provide exactly 33 features'),
  forceSeverity: anomalySeverityEnum.optional(),
});

export const queryAnomalyExplanationSchema = z.object({
  anomalyId: z.string().min(1, 'Anomaly ID is required'),
  topFeatures: z.coerce.number().int().min(1).max(33).default(10),
});

export const anomalyIdSchema = z.object({
  id: z.string().min(1),
});

export const queryModelSchema = z.object({
  deviceId: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  algorithm: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const trainModelSchema = z.object({
  deviceId: z.string().min(1),
  algorithm: z.enum(['isolationForest', 'lof', 'statistical', 'dbscan', 'ensemble']).default('ensemble'),
  trainingDays: z.coerce.number().int().min(7).max(90).default(7),
  forceRetrain: z.boolean().default(false),
});

export const correlationAnalysisSchema = z.object({
  anomalyId: z.string().min(1),
  timeWindowMinutes: z.coerce.number().int().min(5).max(1440).default(60),
  minCorrelation: z.coerce.number().min(0).max(1).default(0.7),
});

export const riskPredictionSchema = z.object({
  deviceId: z.string().min(1),
  predictionHours: z.coerce.number().int().min(1).max(168).default(24),
});

// Bulk operations
export const bulkAnomalyFeedbackSchema = z.object({
  items: z.array(z.object({
    anomalyId: z.string().min(1),
    userId: z.string().min(1),
    isTruePositive: z.boolean(),
    note: z.string().max(2000).optional(),
  })).min(1).max(100),
});

export const bulkInjectAnomalySchema = z.object({
  items: z.array(z.object({
    deviceId: z.string().min(1),
    features: z.array(z.number()).length(33),
    forceSeverity: anomalySeverityEnum.optional(),
  })).min(1).max(20),
});

export const bulkDeleteAnomalySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  confirm: z.boolean().refine(val => val === true, 'Confirmation required'),
});
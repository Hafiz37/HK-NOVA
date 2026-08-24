import { OpenAPIGenerator } from 'zod-to-openapi';
import type { ZodTypeAny } from 'zod';

import { 
  queryDeviceSchema, createDeviceSchema, updateDeviceSchema, deviceIdSchema,
  bulkCreateDeviceSchema, bulkUpdateDeviceSchema, bulkTestConnectionSchema
} from '@/lib/schemas/device.schema';

import { 
  queryAlertSchema, createAlertSchema, updateAlertSchema, acknowledgeAlertSchema,
  resolveAlertSchema, bulkAcknowledgeSchema, bulkResolveSchema, bulkAssignSchema,
  alertIdSchema, alertActivitySchema
} from '@/lib/schemas/alert.schema';

import { 
  queryUserSchema, createUserSchema, updateUserSchema, changePasswordSchema,
  resetPasswordSchema, bulkCreateUserSchema, bulkUpdateUserSchema, userIdSchema,
  userProfileSchema
} from '@/lib/schemas/user.schema';

import { 
  queryBackupSchema, createBackupSchema, restoreBackupSchema, backupIdSchema,
  queryBackupSearchSchema, bulkCreateBackupSchema, bulkDeleteBackupSchema,
  bulkRestoreBackupSchema
} from '@/lib/schemas/backup.schema';

import { 
  queryProvisioningLogSchema, executeProvisioningSchema, batchProvisioningSchema,
  scheduleProvisioningSchema, rollbackProvisioningSchema, provisioningLogIdSchema,
  validateTemplateSchema, createProvisioningRequestSchema, reviewProvisioningRequestSchema,
  bulkScheduleProvisioningSchema, bulkRollbackProvisioningSchema, bulkRetryProvisioningSchema
} from '@/lib/schemas/provisioning.schema';

import { 
  queryAnomalySchema, anomalyFeedbackSchema, injectAnomalySchema,
  queryAnomalyExplanationSchema, anomalyIdSchema, queryModelSchema,
  trainModelSchema, correlationAnalysisSchema, riskPredictionSchema,
  bulkAnomalyFeedbackSchema, bulkInjectAnomalySchema, bulkDeleteAnomalySchema
} from '@/lib/schemas/anomaly.schema';

import { 
  querySettingsSchema, createSettingSchema, updateSettingSchema, settingKeySchema
} from '@/lib/schemas/settings.schema';

import { 
  queryFeatureFlagsSchema, createFeatureFlagSchema, updateFeatureFlagSchema,
  featureFlagKeySchema, bulkUpdateFeatureFlagsSchema
} from '@/lib/schemas/feature-flag.schema';

import { 
  queryMaintenanceWindowSchema, createMaintenanceWindowSchema,
  updateMaintenanceWindowSchema, maintenanceWindowIdSchema
} from '@/lib/schemas/maintenance-window.schema';

const schemaMap: Record<string, ZodTypeAny> = {
  // Device schemas
  'QueryDevice': queryDeviceSchema,
  'CreateDevice': createDeviceSchema,
  'UpdateDevice': updateDeviceSchema,
  'DeviceId': deviceIdSchema,
  'BulkCreateDevice': bulkCreateDeviceSchema,
  'BulkUpdateDevice': bulkUpdateDeviceSchema,
  'BulkTestConnection': bulkTestConnectionSchema,

  // Alert schemas
  'QueryAlert': queryAlertSchema,
  'CreateAlert': createAlertSchema,
  'UpdateAlert': updateAlertSchema,
  'AcknowledgeAlert': acknowledgeAlertSchema,
  'ResolveAlert': resolveAlertSchema,
  'BulkAcknowledgeAlert': bulkAcknowledgeSchema,
  'BulkResolveAlert': bulkResolveSchema,
  'BulkAssignAlert': bulkAssignSchema,
  'AlertId': alertIdSchema,
  'AlertActivity': alertActivitySchema,

  // User schemas
  'QueryUser': queryUserSchema,
  'CreateUser': createUserSchema,
  'UpdateUser': updateUserSchema,
  'ChangePassword': changePasswordSchema,
  'ResetPassword': resetPasswordSchema,
  'BulkCreateUser': bulkCreateUserSchema,
  'BulkUpdateUser': bulkUpdateUserSchema,
  'UserId': userIdSchema,
  'UserProfile': userProfileSchema,

  // Backup schemas
  'QueryBackup': queryBackupSchema,
  'CreateBackup': createBackupSchema,
  'RestoreBackup': restoreBackupSchema,
  'BackupId': backupIdSchema,
  'QueryBackupSearch': queryBackupSearchSchema,
  'BulkCreateBackup': bulkCreateBackupSchema,
  'BulkDeleteBackup': bulkDeleteBackupSchema,
  'BulkRestoreBackup': bulkRestoreBackupSchema,

  // Provisioning schemas
  'QueryProvisioningLog': queryProvisioningLogSchema,
  'ExecuteProvisioning': executeProvisioningSchema,
  'BatchProvisioning': batchProvisioningSchema,
  'ScheduleProvisioning': scheduleProvisioningSchema,
  'RollbackProvisioning': rollbackProvisioningSchema,
  'ProvisioningLogId': provisioningLogIdSchema,
  'ValidateTemplate': validateTemplateSchema,
  'CreateProvisioningRequest': createProvisioningRequestSchema,
  'ReviewProvisioningRequest': reviewProvisioningRequestSchema,
  'BulkScheduleProvisioning': bulkScheduleProvisioningSchema,
  'BulkRollbackProvisioning': bulkRollbackProvisioningSchema,
  'BulkRetryProvisioning': bulkRetryProvisioningSchema,

  // Anomaly schemas
  'QueryAnomaly': queryAnomalySchema,
  'AnomalyFeedback': anomalyFeedbackSchema,
  'InjectAnomaly': injectAnomalySchema,
  'QueryAnomalyExplanation': queryAnomalyExplanationSchema,
  'AnomalyId': anomalyIdSchema,
  'QueryModel': queryModelSchema,
  'TrainModel': trainModelSchema,
  'CorrelationAnalysis': correlationAnalysisSchema,
  'RiskPrediction': riskPredictionSchema,
  'BulkAnomalyFeedback': bulkAnomalyFeedbackSchema,
  'BulkInjectAnomaly': bulkInjectAnomalySchema,
  'BulkDeleteAnomaly': bulkDeleteAnomalySchema,

  // Settings schemas
  'QuerySettings': querySettingsSchema,
  'CreateSetting': createSettingSchema,
  'UpdateSetting': updateSettingSchema,
  'SettingKey': settingKeySchema,

  // Feature Flag schemas
  'QueryFeatureFlags': queryFeatureFlagsSchema,
  'CreateFeatureFlag': createFeatureFlagSchema,
  'UpdateFeatureFlag': updateFeatureFlagSchema,
  'FeatureFlagKey': featureFlagKeySchema,
  'BulkUpdateFeatureFlags': bulkUpdateFeatureFlagsSchema,

  // Maintenance Window schemas
  'QueryMaintenanceWindow': queryMaintenanceWindowSchema,
  'CreateMaintenanceWindow': createMaintenanceWindowSchema,
  'UpdateMaintenanceWindow': updateMaintenanceWindowSchema,
  'MaintenanceWindowId': maintenanceWindowIdSchema,
};

export function generateOpenApiSchemas(): Record<string, any> {
  const schemas: ZodTypeAny[] = Object.values(schemaMap);
  const generator = new OpenAPIGenerator(schemas);
  return generator.generate();
}

export function getAllZodSchemas(): typeof schemaMap {
  return schemaMap;
}
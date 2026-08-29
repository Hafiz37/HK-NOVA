import { z } from '@/lib/schemas/zod-extended';
import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';

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

const commonErrorResponses: Record<string, any> = {
  400: { description: 'Bad Request - Validation failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationError' } } } },
  401: { description: 'Unauthorized - Invalid or missing authentication', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
  403: { description: 'Forbidden - Insufficient permissions', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
  404: { description: 'Not Found - Resource does not exist', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
  409: { description: 'Conflict - Resource already exists or invalid state', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
  429: { description: 'Too Many Requests - Rate limit exceeded', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
  500: { description: 'Internal Server Error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
};

function withErrors(successResponses: Record<string, any>, extraErrors: string[] = []): Record<string, any> {
  const result: Record<string, any> = { ...successResponses };
  for (const code of extraErrors) {
    if (commonErrorResponses[code]) {
      result[code] = commonErrorResponses[code];
    }
  }
  for (const [code, response] of Object.entries(commonErrorResponses)) {
    if (!extraErrors.includes(code) && !result[code]) {
      result[code] = response;
    }
  }
  return result;
}

const paginationQueryParams: Array<{ name: string; in: 'query' | 'path' | 'header' | 'cookie'; schema: any; description: string }> = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 }, description: 'Page number' },
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 }, description: 'Items per page' },
  { name: 'sortBy', in: 'query', schema: { type: 'string' }, description: 'Field to sort by' },
  { name: 'sortOrder', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' }, description: 'Sort order' },
  { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search term' },
];

const schemaMap: Record<string, any> = {
  'QueryDevice': queryDeviceSchema,
  'CreateDevice': createDeviceSchema,
  'UpdateDevice': updateDeviceSchema,
  'DeviceId': deviceIdSchema,
  'BulkCreateDevice': bulkCreateDeviceSchema,
  'BulkUpdateDevice': bulkUpdateDeviceSchema,
  'BulkTestConnection': bulkTestConnectionSchema,

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

  'QueryUser': queryUserSchema,
  'CreateUser': createUserSchema,
  'UpdateUser': updateUserSchema,
  'ChangePassword': changePasswordSchema,
  'ResetPassword': resetPasswordSchema,
  'BulkCreateUser': bulkCreateUserSchema,
  'BulkUpdateUser': bulkUpdateUserSchema,
  'UserId': userIdSchema,
  'UserProfile': userProfileSchema,

  'QueryBackup': queryBackupSchema,
  'CreateBackup': createBackupSchema,
  'RestoreBackup': restoreBackupSchema,
  'BackupId': backupIdSchema,
  'QueryBackupSearch': queryBackupSearchSchema,
  'BulkCreateBackup': bulkCreateBackupSchema,
  'BulkDeleteBackup': bulkDeleteBackupSchema,
  'BulkRestoreBackup': bulkRestoreBackupSchema,

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

  'QuerySettings': querySettingsSchema,
  'CreateSetting': createSettingSchema,
  'UpdateSetting': updateSettingSchema,
  'SettingKey': settingKeySchema,

  'QueryFeatureFlags': queryFeatureFlagsSchema,
  'CreateFeatureFlag': createFeatureFlagSchema,
  'UpdateFeatureFlag': updateFeatureFlagSchema,
  'FeatureFlagKey': featureFlagKeySchema,
  'BulkUpdateFeatureFlags': bulkUpdateFeatureFlagsSchema,

  'QueryMaintenanceWindow': queryMaintenanceWindowSchema,
  'CreateMaintenanceWindow': createMaintenanceWindowSchema,
  'UpdateMaintenanceWindow': updateMaintenanceWindowSchema,
  'MaintenanceWindowId': maintenanceWindowIdSchema,
};

export function generateOpenApiSchemas(): Record<string, any> {
  const registry = new OpenAPIRegistry();
  
  for (const [name, schema] of Object.entries(schemaMap)) {
    registry.register(name, schema);
  }

  registry.registerComponent('securitySchemes', 'BearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  });
  registry.registerComponent('securitySchemes', 'CookieAuth', {
    type: 'apiKey',
    in: 'cookie',
    name: 'hk_nova_session',
  });

  const generator = new OpenApiGeneratorV31(registry.definitions);
  
  const doc = generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'HK-NOVA NOC Platform API',
      version: '1.0.0',
      description: 'Network Operations Center Platform API for ISP monitoring, automation, and intelligence',
      contact: {
        name: 'HK-NOVA Team',
        email: 'support@hk-nova.local',
      },
      license: {
        name: 'Private',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
      {
        url: 'https://api.hk-nova.local',
        description: 'Production server',
      },
    ],
    security: [
      { BearerAuth: [], CookieAuth: [] },
    ],
    tags: [
      { name: 'Devices', description: 'Network device management' },
      { name: 'Alerts', description: 'Alert lifecycle management' },
      { name: 'Users', description: 'User and RBAC management' },
      { name: 'Backups', description: 'Configuration backup management' },
      { name: 'Provisioning', description: 'OLT provisioning operations' },
      { name: 'Anomalies', description: 'ML anomaly detection' },
      { name: 'Maintenance Windows', description: 'Scheduled maintenance' },
      { name: 'Alert Rules', description: 'Threshold-based alert rules' },
      { name: 'Feature Flags', description: 'Feature toggle management' },
      { name: 'Settings', description: 'System settings' },
      { name: 'Dashboard', description: 'Dashboard statistics' },
      { name: 'Realtime', description: 'Real-time SSE subscriptions' },
      { name: 'Admin', description: 'Administrative operations' },
    ],
  });

  doc.paths = {
    '/api/devices': {
      get: {
        tags: ['Devices'],
        summary: 'List devices with pagination and filters',
        operationId: 'listDevices',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [
          ...paginationQueryParams,
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['OLT', 'SWITCH', 'ROUTER', 'SERVER', 'FIREWALL', 'AP', 'OTHER'] }, description: 'Filter by device type' },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['UNKNOWN', 'UP', 'DOWN', 'DEGRADED', 'MAINTENANCE'] }, description: 'Filter by device status' },
          { name: 'showDemo', in: 'query', schema: { type: 'boolean', default: false }, description: 'Include demo devices' },
        ],
        responses: withErrors({
          200: { description: 'Paginated list of devices', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedDeviceResponse' } } } },
        }),
      },
      post: {
        tags: ['Devices'],
        summary: 'Create a new device',
        operationId: 'createDevice',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CreateDevice' } },
          },
        },
        responses: withErrors({
          201: { description: 'Device created successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/DeviceResponse' } } } },
        }, ['409']),
      },
    },
    '/api/devices/{id}': {
      get: {
        tags: ['Devices'],
        summary: 'Get device by ID',
        operationId: 'getDevice',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Device ID' }],
        responses: withErrors({
          200: { description: 'Device details', content: { 'application/json': { schema: { $ref: '#/components/schemas/DeviceResponse' } } } },
        }, ['404']),
      },
      put: {
        tags: ['Devices'],
        summary: 'Update device (full update)',
        operationId: 'updateDevice',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Device ID' }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/UpdateDevice' } },
          },
        },
        responses: withErrors({
          200: { description: 'Device updated successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/DeviceResponse' } } } },
        }, ['404', '409']),
      },
      patch: {
        tags: ['Devices'],
        summary: 'Update device (partial update)',
        operationId: 'patchDevice',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Device ID' }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/UpdateDevice' } },
          },
        },
        responses: withErrors({
          200: { description: 'Device updated successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/DeviceResponse' } } } },
        }, ['404', '409']),
      },
      delete: {
        tags: ['Devices'],
        summary: 'Delete device (soft delete)',
        operationId: 'deleteDevice',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Device ID' }],
        responses: withErrors({
          200: { description: 'Device deleted successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiSuccess' } } } },
        }, ['404']),
      },
    },
    '/api/devices/{id}/test': {
      post: {
        tags: ['Devices'],
        summary: 'Test device connectivity (ICMP, SNMP, SSH)',
        operationId: 'testDeviceConnection',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Device ID' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['icmp', 'snmp', 'ssh'], default: 'icmp', description: 'Test type' },
                },
                required: ['type'],
              },
            },
          },
        },
        responses: withErrors({
          200: { description: 'Test result', content: { 'application/json': { schema: { $ref: '#/components/schemas/DeviceTestResponse' } } } },
        }, ['404']),
      },
    },
    '/api/devices/{id}/metrics': {
      get: {
        tags: ['Devices'],
        summary: 'Get device metrics history',
        operationId: 'getDeviceMetrics',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Device ID' },
          { name: 'hours', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 168, default: 24 }, description: 'Hours of history to retrieve' },
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['ICMP', 'SNMP_CPU', 'SNMP_MEM', 'CUSTOM_OID'], default: 'ICMP' }, description: 'Metric type' },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 50, maximum: 1000, default: 300 }, description: 'Max data points to return (after downsampling)' },
        ],
        responses: withErrors({
          200: { description: 'Device metrics with summary', content: { 'application/json': { schema: { $ref: '#/components/schemas/DeviceMetricsResponse' } } } },
        }, ['404']),
      },
    },
    '/api/alerts': {
      get: {
        tags: ['Alerts'],
        summary: 'List alerts with pagination and filters',
        operationId: 'listAlerts',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [
          ...paginationQueryParams,
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'] }, description: 'Filter by alert status' },
          { name: 'severity', in: 'query', schema: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] }, description: 'Filter by severity' },
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['THRESHOLD_CPU', 'THRESHOLD_MEM', 'THRESHOLD_LATENCY', 'THRESHOLD_PACKET_LOSS', 'THRESHOLD_JITTER', 'CUSTOM_OID', 'DEVICE_DOWN', 'DEVICE_UP', 'ANOMALY', 'BACKUP_FAILED', 'PROVISIONING_FAILED', 'SNMP_TRAP'] }, description: 'Filter by alert type' },
          { name: 'deviceId', in: 'query', schema: { type: 'string' }, description: 'Filter by device ID' },
          { name: 'assigneeId', in: 'query', schema: { type: 'string' }, description: 'Filter by assignee user ID' },
          { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Filter alerts created after this date' },
          { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Filter alerts created before this date' },
        ],
        responses: withErrors({
          200: { description: 'Paginated list of alerts', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedAlertResponse' } } } },
        }),
      },
    },
    '/api/alerts/{id}': {
      get: {
        tags: ['Alerts'],
        summary: 'Get alert by ID',
        operationId: 'getAlert',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Alert ID' }],
        responses: withErrors({
          200: { description: 'Alert details', content: { 'application/json': { schema: { $ref: '#/components/schemas/AlertResponse' } } } },
        }, ['404']),
      },
      patch: {
        tags: ['Alerts'],
        summary: 'Update alert assignee and/or note',
        operationId: 'updateAlert',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Alert ID' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  assigneeId: { type: ['string', 'null'], description: 'User ID to assign, or null to unassign' },
                  note: { type: ['string', 'null'], description: 'Note to add/update' },
                },
              },
            },
          },
        },
        responses: withErrors({
          200: { description: 'Alert updated successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/AlertResponse' } } } },
        }, ['404']),
      },
    },
    '/api/alerts/{id}/acknowledge': {
      post: {
        tags: ['Alerts'],
        summary: 'Acknowledge an alert',
        operationId: 'acknowledgeAlert',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Alert ID' }],
        responses: withErrors({
          200: { description: 'Alert acknowledged successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/AlertResponse' } } } },
        }, ['404', '409']),
      },
    },
    '/api/alerts/{id}/resolve': {
      post: {
        tags: ['Alerts'],
        summary: 'Resolve an alert',
        operationId: 'resolveAlert',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Alert ID' }],
        responses: withErrors({
          200: { description: 'Alert resolved successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/AlertResponse' } } } },
        }, ['404', '409']),
      },
    },
    '/api/alerts/bulk': {
      post: {
        tags: ['Alerts'],
        summary: 'Bulk acknowledge or resolve alerts',
        operationId: 'bulkAlertAction',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                oneOf: [
                  { $ref: '#/components/schemas/BulkAcknowledgeAlert' },
                  { $ref: '#/components/schemas/BulkResolveAlert' },
                ],
              },
            },
          },
        },
        responses: withErrors({
          200: { description: 'Bulk operation completed', content: { 'application/json': { schema: { $ref: '#/components/schemas/BulkAlertResponse' } } } },
        }),
      },
    },
    '/api/users': {
      get: {
        tags: ['Users'],
        summary: 'List users with pagination and filters',
        operationId: 'listUsers',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [
          ...paginationQueryParams,
          { name: 'role', in: 'query', schema: { type: 'string', enum: ['VIEWER', 'OPERATOR', 'ADMIN'] }, description: 'Filter by user role' },
        ],
        responses: withErrors({
          200: { description: 'Paginated list of users', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedUserResponse' } } } },
        }),
      },
      post: {
        tags: ['Users'],
        summary: 'Create a new user',
        operationId: 'createUser',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CreateUser' } },
          },
        },
        responses: withErrors({
          201: { description: 'User created successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/UserResponse' } } } },
        }, ['409']),
      },
    },
    '/api/users/{id}': {
      get: {
        tags: ['Users'],
        summary: 'Get user by ID',
        operationId: 'getUser',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'User ID' }],
        responses: withErrors({
          200: { description: 'User details', content: { 'application/json': { schema: { $ref: '#/components/schemas/UserResponse' } } } },
        }, ['404']),
      },
      patch: {
        tags: ['Users'],
        summary: 'Update user',
        operationId: 'updateUser',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'User ID' }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/UpdateUser' } },
          },
        },
        responses: withErrors({
          200: { description: 'User updated successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/UserResponse' } } } },
        }, ['404', '409']),
      },
      delete: {
        tags: ['Users'],
        summary: 'Delete user',
        operationId: 'deleteUser',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'User ID' }],
        responses: withErrors({
          200: { description: 'User deleted successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiSuccess' } } } },
        }, ['404', '409']),
      },
    },
    '/api/backups': {
      get: {
        tags: ['Backups'],
        summary: 'List backups with pagination and filters',
        operationId: 'listBackups',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [
          { name: 'deviceId', in: 'query', schema: { type: 'string' }, description: 'Filter by device ID' },
          ...paginationQueryParams,
        ],
        responses: withErrors({
          200: { description: 'Paginated list of backups', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedBackupResponse' } } } },
        }),
      },
    },
    '/api/anomalies': {
      get: {
        tags: ['Anomalies'],
        summary: 'List anomalies with pagination and filters',
        operationId: 'listAnomalies',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [
          ...paginationQueryParams,
          { name: 'deviceId', in: 'query', schema: { type: 'string' }, description: 'Filter by device ID' },
          { name: 'severity', in: 'query', schema: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] }, description: 'Filter by severity' },
          { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Filter anomalies after this date' },
          { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Filter anomalies before this date' },
        ],
        responses: withErrors({
          200: { description: 'Paginated list of anomalies', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedAnomalyResponse' } } } },
        }),
      },
      delete: {
        tags: ['Anomalies'],
        summary: 'Delete anomaly record (admin only)',
        operationId: 'deleteAnomaly',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [{ name: 'id', in: 'query', required: true, schema: { type: 'string' }, description: 'Anomaly ID' }],
        responses: withErrors({
          200: { description: 'Anomaly deleted successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiSuccess' } } } },
        }, ['404']),
      },
    },
    '/api/anomalies/inject': {
      post: {
        tags: ['Anomalies'],
        summary: 'Inject synthetic anomaly for testing',
        operationId: 'injectAnomaly',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/InjectAnomaly' } },
          },
        },
        responses: withErrors({
          200: { description: 'Anomaly injected successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/AnomalyResponse' } } } },
        }),
      },
    },
    '/api/anomalies/feedback': {
      post: {
        tags: ['Anomalies'],
        summary: 'Submit feedback for anomaly detection',
        operationId: 'anomalyFeedback',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/AnomalyFeedback' } },
          },
        },
        responses: withErrors({
          200: { description: 'Feedback submitted successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiSuccess' } } } },
        }),
      },
    },
    '/api/anomalies/explain': {
      post: {
        tags: ['Anomalies'],
        summary: 'Get explanation for anomaly',
        operationId: 'explainAnomaly',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/QueryAnomalyExplanation' } },
          },
        },
        responses: withErrors({
          200: { description: 'Anomaly explanation', content: { 'application/json': { schema: { $ref: '#/components/schemas/AnomalyExplanationResponse' } } } },
        }),
      },
    },
    '/api/anomalies/correlations': {
      get: {
        tags: ['Anomalies'],
        summary: 'Get anomaly correlations',
        operationId: 'getAnomalyCorrelations',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [
          { name: 'deviceId', in: 'query', schema: { type: 'string' }, description: 'Filter by device ID' },
          { name: 'windowHours', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 168, default: 24 }, description: 'Time window in hours' },
        ],
        responses: withErrors({
          200: { description: 'Anomaly correlations', content: { 'application/json': { schema: { $ref: '#/components/schemas/CorrelationAnalysisResponse' } } } },
        }),
      },
    },
    '/api/anomalies/models': {
      get: {
        tags: ['Anomalies'],
        summary: 'List trained ML models',
        operationId: 'listModels',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        responses: withErrors({
          200: { description: 'List of models', content: { 'application/json': { schema: { $ref: '#/components/schemas/ModelListResponse' } } } },
        }),
      },
      post: {
        tags: ['Anomalies'],
        summary: 'Train a new ML model',
        operationId: 'trainModel',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/TrainModel' } },
          },
        },
        responses: withErrors({
          200: { description: 'Model training started', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiSuccess' } } } },
        }),
      },
    },
    '/api/anomalies/risk': {
      get: {
        tags: ['Anomalies'],
        summary: 'Get risk predictions for devices',
        operationId: 'getRiskPredictions',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [
          { name: 'deviceId', in: 'query', schema: { type: 'string' }, description: 'Filter by device ID' },
          { name: 'horizonHours', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 720, default: 24 }, description: 'Prediction horizon in hours' },
        ],
        responses: withErrors({
          200: { description: 'Risk predictions', content: { 'application/json': { schema: { $ref: '#/components/schemas/RiskPredictionResponse' } } } },
        }),
      },
    },
    '/api/anomalies/bulk': {
      post: {
        tags: ['Anomalies'],
        summary: 'Bulk operations on anomalies',
        operationId: 'bulkAnomalyAction',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                oneOf: [
                  { $ref: '#/components/schemas/BulkAnomalyFeedback' },
                  { $ref: '#/components/schemas/BulkInjectAnomaly' },
                  { $ref: '#/components/schemas/BulkDeleteAnomaly' },
                ],
              },
            },
          },
        },
        responses: withErrors({
          200: { description: 'Bulk operation completed', content: { 'application/json': { schema: { $ref: '#/components/schemas/BulkAnomalyResponse' } } } },
        }),
      },
    },
    '/api/anomalies/tuning': {
      get: {
        tags: ['Anomalies'],
        summary: 'Get anomaly detection tuning parameters',
        operationId: 'getAnomalyTuning',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        responses: withErrors({
          200: { description: 'Tuning parameters', content: { 'application/json': { schema: { $ref: '#/components/schemas/AnomalyTuningResponse' } } } },
        }),
      },
      post: {
        tags: ['Anomalies'],
        summary: 'Update anomaly detection tuning parameters',
        operationId: 'updateAnomalyTuning',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/UpdateAnomalyTuning' } },
          },
        },
        responses: withErrors({
          200: { description: 'Tuning parameters updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/AnomalyTuningResponse' } } } },
        }),
      },
    },
    '/api/provisioning/execute': {
      post: {
        tags: ['Provisioning'],
        summary: 'Execute provisioning on a single device',
        operationId: 'executeProvisioning',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ExecuteProvisioning' } },
          },
        },
        responses: withErrors({
          200: { description: 'Provisioning executed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ProvisioningResultResponse' } } } },
        }),
      },
    },
    '/api/provisioning/batch-execute': {
      post: {
        tags: ['Provisioning'],
        summary: 'Execute provisioning on multiple devices',
        operationId: 'batchExecuteProvisioning',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/BatchProvisioning' } },
          },
        },
        responses: withErrors({
          200: { description: 'Batch provisioning executed', content: { 'application/json': { schema: { $ref: '#/components/schemas/BatchProvisioningResponse' } } } },
        }),
      },
    },
    '/api/provisioning/scheduled': {
      get: {
        tags: ['Provisioning'],
        summary: 'List scheduled provisioning jobs',
        operationId: 'listScheduledProvisioning',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [...paginationQueryParams],
        responses: withErrors({
          200: { description: 'List of scheduled jobs', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedProvisioningLogResponse' } } } },
        }),
      },
      post: {
        tags: ['Provisioning'],
        summary: 'Schedule a provisioning job',
        operationId: 'scheduleProvisioning',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ScheduleProvisioning' } },
          },
        },
        responses: withErrors({
          201: { description: 'Provisioning scheduled', content: { 'application/json': { schema: { $ref: '#/components/schemas/ProvisioningLogResponse' } } } },
        }),
      },
    },
    '/api/provisioning/logs': {
      get: {
        tags: ['Provisioning'],
        summary: 'List provisioning logs',
        operationId: 'listProvisioningLogs',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [...paginationQueryParams],
        responses: withErrors({
          200: { description: 'Paginated list of provisioning logs', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedProvisioningLogResponse' } } } },
        }),
      },
    },
    '/api/provisioning/logs/{id}/rollback': {
      post: {
        tags: ['Provisioning'],
        summary: 'Rollback a provisioning operation',
        operationId: 'rollbackProvisioning',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Provisioning log ID' }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/RollbackProvisioning' } },
          },
        },
        responses: withErrors({
          200: { description: 'Rollback initiated', content: { 'application/json': { schema: { $ref: '#/components/schemas/ProvisioningResultResponse' } } } },
        }, ['404']),
      },
    },
    '/api/provisioning/templates': {
      get: {
        tags: ['Provisioning'],
        summary: 'List provisioning templates',
        operationId: 'listProvisioningTemplates',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        responses: withErrors({
          200: { description: 'List of templates', content: { 'application/json': { schema: { $ref: '#/components/schemas/ProvisioningTemplateListResponse' } } } },
        }),
      },
      post: {
        tags: ['Provisioning'],
        summary: 'Create provisioning template',
        operationId: 'createProvisioningTemplate',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CreateProvisioningTemplate' } },
          },
        },
        responses: withErrors({
          201: { description: 'Template created', content: { 'application/json': { schema: { $ref: '#/components/schemas/ProvisioningTemplateResponse' } } } },
        }),
      },
    },
    '/api/provisioning/templates/validate': {
      post: {
        tags: ['Provisioning'],
        summary: 'Validate provisioning template syntax',
        operationId: 'validateTemplate',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ValidateTemplate' } },
          },
        },
        responses: withErrors({
          200: { description: 'Validation result', content: { 'application/json': { schema: { $ref: '#/components/schemas/TemplateValidationResponse' } } } },
        }),
      },
    },
    '/api/provisioning/templates/{id}/activate': {
      post: {
        tags: ['Provisioning'],
        summary: 'Activate a provisioning template',
        operationId: 'activateTemplate',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Template ID' }],
        responses: withErrors({
          200: { description: 'Template activated', content: { 'application/json': { schema: { $ref: '#/components/schemas/ProvisioningTemplateResponse' } } } },
        }, ['404']),
      },
    },
    '/api/provisioning/batch-template': {
      post: {
        tags: ['Provisioning'],
        summary: 'Apply template to multiple devices',
        operationId: 'batchTemplate',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/BatchTemplate' } },
          },
        },
        responses: withErrors({
          200: { description: 'Batch template applied', content: { 'application/json': { schema: { $ref: '#/components/schemas/BatchProvisioningResponse' } } } },
        }),
      },
    },
    '/api/provisioning/multi-device': {
      post: {
        tags: ['Provisioning'],
        summary: 'Provision multiple devices with different configs',
        operationId: 'multiDeviceProvisioning',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/MultiDeviceProvisioning' } },
          },
        },
        responses: withErrors({
          200: { description: 'Multi-device provisioning executed', content: { 'application/json': { schema: { $ref: '#/components/schemas/BatchProvisioningResponse' } } } },
        }),
      },
    },
    '/api/provisioning/bulk': {
      post: {
        tags: ['Provisioning'],
        summary: 'Bulk provisioning operations',
        operationId: 'bulkProvisioning',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                oneOf: [
                  { $ref: '#/components/schemas/BulkScheduleProvisioning' },
                  { $ref: '#/components/schemas/BulkRollbackProvisioning' },
                  { $ref: '#/components/schemas/BulkRetryProvisioning' },
                ],
              },
            },
          },
        },
        responses: withErrors({
          200: { description: 'Bulk operation completed', content: { 'application/json': { schema: { $ref: '#/components/schemas/BulkProvisioningResponse' } } } },
        }),
      },
    },
    '/api/provisioning/analytics': {
      get: {
        tags: ['Provisioning'],
        summary: 'Get provisioning analytics',
        operationId: 'getProvisioningAnalytics',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [
          { name: 'period', in: 'query', schema: { type: 'string', enum: ['1h', '24h', '7d', '30d'], default: '24h' }, description: 'Analytics period' },
        ],
        responses: withErrors({
          200: { description: 'Provisioning analytics', content: { 'application/json': { schema: { $ref: '#/components/schemas/ProvisioningAnalyticsResponse' } } } },
        }),
      },
    },
    '/api/provisioning/events': {
      get: {
        tags: ['Provisioning'],
        summary: 'Get provisioning events (SSE)',
        operationId: 'getProvisioningEvents',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [
          { name: 'channels', in: 'query', schema: { type: 'string' }, description: 'Comma-separated channels' },
        ],
        responses: withErrors({
          200: { description: 'Server-sent events stream', content: { 'text/event-stream': { schema: { type: 'string' } } } },
        }),
      },
    },
    '/api/provisioning/requests': {
      get: {
        tags: ['Provisioning'],
        summary: 'List provisioning requests',
        operationId: 'listProvisioningRequests',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [...paginationQueryParams],
        responses: withErrors({
          200: { description: 'Paginated list of provisioning requests', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedProvisioningRequestResponse' } } } },
        }),
      },
      post: {
        tags: ['Provisioning'],
        summary: 'Create provisioning request',
        operationId: 'createProvisioningRequest',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CreateProvisioningRequest' } },
          },
        },
        responses: withErrors({
          201: { description: 'Request created', content: { 'application/json': { schema: { $ref: '#/components/schemas/ProvisioningRequestResponse' } } } },
        }),
      },
    },
    '/api/provisioning/requests/{id}/review': {
      post: {
        tags: ['Provisioning'],
        summary: 'Review a provisioning request',
        operationId: 'reviewProvisioningRequest',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Request ID' }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ReviewProvisioningRequest' } },
          },
        },
        responses: withErrors({
          200: { description: 'Request reviewed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ProvisioningRequestResponse' } } } },
        }, ['404']),
      },
    },
    '/api/alert-rules': {
      get: {
        tags: ['Alert Rules'],
        summary: 'List all alert rules',
        operationId: 'listAlertRules',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        responses: withErrors({
          200: { description: 'List of alert rules', content: { 'application/json': { schema: { $ref: '#/components/schemas/AlertRuleListResponse' } } } },
        }),
      },
      post: {
        tags: ['Alert Rules'],
        summary: 'Create a new alert rule',
        operationId: 'createAlertRule',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CreateAlertRule' } },
          },
        },
        responses: withErrors({
          201: { description: 'Alert rule created', content: { 'application/json': { schema: { $ref: '#/components/schemas/AlertRuleResponse' } } } },
        }),
      },
    },
    '/api/alert-rules/{id}': {
      get: {
        tags: ['Alert Rules'],
        summary: 'Get alert rule by ID',
        operationId: 'getAlertRule',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Rule ID' }],
        responses: withErrors({
          200: { description: 'Alert rule details', content: { 'application/json': { schema: { $ref: '#/components/schemas/AlertRuleResponse' } } } },
        }, ['404']),
      },
      patch: {
        tags: ['Alert Rules'],
        summary: 'Update alert rule',
        operationId: 'updateAlertRule',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Rule ID' }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/UpdateAlertRule' } },
          },
        },
        responses: withErrors({
          200: { description: 'Alert rule updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/AlertRuleResponse' } } } },
        }, ['404']),
      },
      delete: {
        tags: ['Alert Rules'],
        summary: 'Delete alert rule',
        operationId: 'deleteAlertRule',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Rule ID' }],
        responses: withErrors({
          200: { description: 'Alert rule deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiSuccess' } } } },
        }, ['404']),
      },
    },
    '/api/alert-rules/bulk': {
      post: {
        tags: ['Alert Rules'],
        summary: 'Bulk operations on alert rules',
        operationId: 'bulkAlertRules',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/BulkAlertRuleAction' } },
          },
        },
        responses: withErrors({
          200: { description: 'Bulk operation completed', content: { 'application/json': { schema: { $ref: '#/components/schemas/BulkAlertRuleResponse' } } } },
        }),
      },
    },
    '/api/feature-flags': {
      get: {
        tags: ['Feature Flags'],
        summary: 'List all feature flags',
        operationId: 'listFeatureFlags',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        responses: withErrors({
          200: { description: 'List of feature flags', content: { 'application/json': { schema: { $ref: '#/components/schemas/FeatureFlagListResponse' } } } },
        }),
      },
      post: {
        tags: ['Feature Flags'],
        summary: 'Create a new feature flag',
        operationId: 'createFeatureFlag',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CreateFeatureFlag' } },
          },
        },
        responses: withErrors({
          201: { description: 'Feature flag created', content: { 'application/json': { schema: { $ref: '#/components/schemas/FeatureFlagResponse' } } } },
        }),
      },
    },
    '/api/feature-flags/{id}': {
      get: {
        tags: ['Feature Flags'],
        summary: 'Get feature flag by key',
        operationId: 'getFeatureFlag',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Feature flag key' }],
        responses: withErrors({
          200: { description: 'Feature flag details', content: { 'application/json': { schema: { $ref: '#/components/schemas/FeatureFlagResponse' } } } },
        }, ['404']),
      },
      patch: {
        tags: ['Feature Flags'],
        summary: 'Update feature flag',
        operationId: 'updateFeatureFlag',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Feature flag key' }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/UpdateFeatureFlag' } },
          },
        },
        responses: withErrors({
          200: { description: 'Feature flag updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/FeatureFlagResponse' } } } },
        }, ['404']),
      },
      delete: {
        tags: ['Feature Flags'],
        summary: 'Delete feature flag',
        operationId: 'deleteFeatureFlag',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Feature flag key' }],
        responses: withErrors({
          200: { description: 'Feature flag deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiSuccess' } } } },
        }, ['404']),
      },
    },
    '/api/feature-flags/bulk': {
      patch: {
        tags: ['Feature Flags'],
        summary: 'Bulk update feature flags',
        operationId: 'bulkUpdateFeatureFlags',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/BulkUpdateFeatureFlags' } },
          },
        },
        responses: withErrors({
          200: { description: 'Feature flags updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/FeatureFlagListResponse' } } } },
        }),
      },
    },
    '/api/settings/alert-policies': {
      get: {
        tags: ['Settings'],
        summary: 'Get alert policy settings',
        operationId: 'getAlertPolicies',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        responses: withErrors({
          200: { description: 'Alert policy settings', content: { 'application/json': { schema: { $ref: '#/components/schemas/AlertPoliciesResponse' } } } },
        }),
      },
      put: {
        tags: ['Settings'],
        summary: 'Update alert policy settings',
        operationId: 'updateAlertPolicies',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/UpdateAlertPolicies' } },
          },
        },
        responses: withErrors({
          200: { description: 'Alert policy settings updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/AlertPoliciesResponse' } } } },
        }),
      },
    },
    '/api/settings/notifications': {
      get: {
        tags: ['Settings'],
        summary: 'Get notification settings',
        operationId: 'getNotificationSettings',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        responses: withErrors({
          200: { description: 'Notification settings', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotificationSettingsResponse' } } } },
        }),
      },
      put: {
        tags: ['Settings'],
        summary: 'Update notification settings',
        operationId: 'updateNotificationSettings',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/UpdateNotificationSettings' } },
          },
        },
        responses: withErrors({
          200: { description: 'Notification settings updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotificationSettingsResponse' } } } },
        }),
      },
    },
    '/api/settings/notifications/test': {
      post: {
        tags: ['Settings'],
        summary: 'Test notification delivery',
        operationId: 'testNotification',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/TestNotification' } },
          },
        },
        responses: withErrors({
          200: { description: 'Test notification sent', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiSuccess' } } } },
        }),
      },
    },
    '/api/settings/sso': {
      get: {
        tags: ['Settings'],
        summary: 'Get SSO settings',
        operationId: 'getSSOSettings',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        responses: withErrors({
          200: { description: 'SSO settings', content: { 'application/json': { schema: { $ref: '#/components/schemas/SSOSettingsResponse' } } } },
        }),
      },
      put: {
        tags: ['Settings'],
        summary: 'Update SSO settings',
        operationId: 'updateSSOSettings',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/UpdateSSOSettings' } },
          },
        },
        responses: withErrors({
          200: { description: 'SSO settings updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/SSOSettingsResponse' } } } },
        }),
      },
    },
    '/api/settings/polling-interval': {
      get: {
        tags: ['Settings'],
        summary: 'Get polling interval settings',
        operationId: 'getPollingInterval',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        responses: withErrors({
          200: { description: 'Polling interval settings', content: { 'application/json': { schema: { $ref: '#/components/schemas/PollingIntervalResponse' } } } },
        }),
      },
      put: {
        tags: ['Settings'],
        summary: 'Update polling interval settings',
        operationId: 'updatePollingInterval',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/UpdatePollingInterval' } },
          },
        },
        responses: withErrors({
          200: { description: 'Polling interval updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/PollingIntervalResponse' } } } },
        }),
      },
    },
    '/api/settings/demo-mode': {
      get: {
        tags: ['Settings'],
        summary: 'Get demo mode settings',
        operationId: 'getDemoMode',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        responses: withErrors({
          200: { description: 'Demo mode settings', content: { 'application/json': { schema: { $ref: '#/components/schemas/DemoModeResponse' } } } },
        }),
      },
      put: {
        tags: ['Settings'],
        summary: 'Update demo mode settings',
        operationId: 'updateDemoMode',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/UpdateDemoMode' } },
          },
        },
        responses: withErrors({
          200: { description: 'Demo mode updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/DemoModeResponse' } } } },
        }),
      },
    },
    '/api/settings/ip-control': {
      get: {
        tags: ['Settings'],
        summary: 'List IP control rules',
        operationId: 'listIPControlRules',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [...paginationQueryParams],
        responses: withErrors({
          200: { description: 'Paginated list of IP control rules', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedIPControlResponse' } } } },
        }),
      },
      post: {
        tags: ['Settings'],
        summary: 'Create IP control rule',
        operationId: 'createIPControlRule',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CreateIPControlRule' } },
          },
        },
        responses: withErrors({
          201: { description: 'IP control rule created', content: { 'application/json': { schema: { $ref: '#/components/schemas/IPControlRuleResponse' } } } },
        }),
      },
    },
    '/api/settings/ip-control/{id}': {
      get: {
        tags: ['Settings'],
        summary: 'Get IP control rule by ID',
        operationId: 'getIPControlRule',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Rule ID' }],
        responses: withErrors({
          200: { description: 'IP control rule details', content: { 'application/json': { schema: { $ref: '#/components/schemas/IPControlRuleResponse' } } } },
        }, ['404']),
      },
      patch: {
        tags: ['Settings'],
        summary: 'Update IP control rule',
        operationId: 'updateIPControlRule',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Rule ID' }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/UpdateIPControlRule' } },
          },
        },
        responses: withErrors({
          200: { description: 'IP control rule updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/IPControlRuleResponse' } } } },
        }, ['404']),
      },
      delete: {
        tags: ['Settings'],
        summary: 'Delete IP control rule',
        operationId: 'deleteIPControlRule',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Rule ID' }],
        responses: withErrors({
          200: { description: 'IP control rule deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiSuccess' } } } },
        }, ['404']),
      },
    },
    '/api/realtime': {
      get: {
        tags: ['Realtime'],
        summary: 'Connect to real-time SSE stream',
        operationId: 'connectRealtime',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'channels', in: 'query', schema: { type: 'string' }, description: 'Comma-separated channels (devices,alerts,anomalies,dashboard)' },
          { name: 'filters', in: 'query', schema: { type: 'string' }, description: 'JSON filter object' },
          { name: 'includeDetails', in: 'query', schema: { type: 'boolean', default: true }, description: 'Include detailed event data' },
        ],
        responses: withErrors({
          200: { description: 'Server-sent events stream', content: { 'text/event-stream': { schema: { type: 'string' } } } },
        }, ['401', '429']),
      },
      post: {
        tags: ['Realtime'],
        summary: 'Manage real-time subscriptions',
        operationId: 'manageRealtimeSubscription',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['clientId', 'action'],
                properties: {
                  clientId: { type: 'string', description: 'Client connection ID' },
                  action: { type: 'string', enum: ['subscribe', 'unsubscribe', 'update_filters'] },
                  channels: { type: 'array', items: { type: 'string' } },
                  filters: { type: 'object' },
                  includeDetails: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: withErrors({
          200: { description: 'Subscription updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiSuccess' } } } },
        }, ['400', '401', '404']),
      },
    },
    '/api/realtime/monitoring': {
      get: {
        tags: ['Realtime'],
        summary: 'Get real-time monitoring data (polling fallback)',
        operationId: 'getRealtimeMonitoring',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        parameters: [
          { name: 'deviceId', in: 'query', schema: { type: 'string' }, description: 'Specific device ID' },
        ],
        responses: withErrors({
          200: { description: 'Real-time monitoring snapshot', content: { 'application/json': { schema: { $ref: '#/components/schemas/RealtimeMonitoringResponse' } } } },
        }),
      },
    },
    '/api/realtime/snmp': {
      post: {
        tags: ['Realtime'],
        summary: 'Trigger SNMP poll for device',
        operationId: 'triggerSNMPPoll',
        security: [{ BearerAuth: [], CookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['deviceId'],
                properties: {
                  deviceId: { type: 'string' },
                  oids: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: withErrors({
          200: { description: 'SNMP poll triggered', content: { 'application/json': { schema: { $ref: '#/components/schemas/SNMPPollResponse' } } } },
        }, ['404']),
      },
    },
  };
  
  return doc;
}

export function getAllZodSchemas(): typeof schemaMap {
  return schemaMap;
}

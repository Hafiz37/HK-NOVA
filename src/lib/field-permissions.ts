import { UserRole } from '@prisma/client';

export type FieldPermission = 'read' | 'write' | 'none';

export interface FieldPermissionRule {
  field: string;
  roles: Record<UserRole, FieldPermission>;
}

export interface EntityFieldPermissions {
  entity: string;
  fields: Record<string, FieldPermissionRule>;
}

export const FIELD_PERMISSIONS: Record<string, EntityFieldPermissions> = {
  Device: {
    entity: 'Device',
    fields: {
      id: { field: 'id', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      name: { field: 'name', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'read', AUDITOR: 'read' } },
      ip: { field: 'ip', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'read', AUDITOR: 'read' } },
      type: { field: 'type', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'read', AUDITOR: 'read' } },
      vendor: { field: 'vendor', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'read', AUDITOR: 'read' } },
      model: { field: 'model', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'read', AUDITOR: 'read' } },
      location: { field: 'location', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'read', AUDITOR: 'read' } },
      status: { field: 'status', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      description: { field: 'description', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'read', AUDITOR: 'read' } },
      isDemo: { field: 'isDemo', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      credentials: { 
        field: 'credentials', 
        roles: { ADMIN: 'write', OPERATOR: 'none', VIEWER: 'none', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'none', AUDITOR: 'none' } 
      },
      cpuThresholdOverride: { field: 'cpuThresholdOverride', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'read', AUDITOR: 'read' } },
      memThresholdOverride: { field: 'memThresholdOverride', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'read', AUDITOR: 'read' } },
      cpuResolveThresholdOverride: { field: 'cpuResolveThresholdOverride', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'read', AUDITOR: 'read' } },
      memResolveThresholdOverride: { field: 'memResolveThresholdOverride', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'read', AUDITOR: 'read' } },
      createdAt: { field: 'createdAt', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      updatedAt: { field: 'updatedAt', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      deletedAt: { field: 'deletedAt', roles: { ADMIN: 'read', OPERATOR: 'none', VIEWER: 'none', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'none', AUDITOR: 'none' } },
    },
  },
  Alert: {
    entity: 'Alert',
    fields: {
      id: { field: 'id', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      type: { field: 'type', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      severity: { field: 'severity', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      status: { field: 'status', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'read', AUDITOR: 'read' } },
      message: { field: 'message', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      deviceId: { field: 'deviceId', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      assigneeId: { field: 'assigneeId', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'none', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'read', AUDITOR: 'read' } },
      acknowledgedAt: { field: 'acknowledgedAt', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      resolvedAt: { field: 'resolvedAt', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      resolutionNote: { field: 'resolutionNote', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'read', AUDITOR: 'read' } },
      metadata: { field: 'metadata', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'none', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      createdAt: { field: 'createdAt', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      updatedAt: { field: 'updatedAt', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
    },
  },
  User: {
    entity: 'User',
    fields: {
      id: { field: 'id', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      username: { field: 'username', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'none', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      email: { field: 'email', roles: { ADMIN: 'write', OPERATOR: 'read', VIEWER: 'none', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      fullName: { field: 'fullName', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'read', AUDITOR: 'read' } },
      role: { field: 'role', roles: { ADMIN: 'write', OPERATOR: 'none', VIEWER: 'none', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'none', AUDITOR: 'none' } },
      isActive: { field: 'isActive', roles: { ADMIN: 'write', OPERATOR: 'none', VIEWER: 'none', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'none', AUDITOR: 'none' } },
      passwordHash: { field: 'passwordHash', roles: { ADMIN: 'none', OPERATOR: 'none', VIEWER: 'none', NETWORK_ADMIN: 'none', SECURITY_ADMIN: 'none', HELPDESK: 'none', AUDITOR: 'none' } },
      lastLoginAt: { field: 'lastLoginAt', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'none', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      createdAt: { field: 'createdAt', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      updatedAt: { field: 'updatedAt', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
    },
  },
  AlertRule: {
    entity: 'AlertRule',
    fields: {
      id: { field: 'id', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      name: { field: 'name', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'read', AUDITOR: 'read' } },
      metric: { field: 'metric', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'read', AUDITOR: 'read' } },
      operator: { field: 'operator', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'read', AUDITOR: 'read' } },
      threshold: { field: 'threshold', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'read', AUDITOR: 'read' } },
      severity: { field: 'severity', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'read', AUDITOR: 'read' } },
      consecutiveSamples: { field: 'consecutiveSamples', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'read', AUDITOR: 'read' } },
      deviceScope: { field: 'deviceScope', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'read', AUDITOR: 'read' } },
      deviceType: { field: 'deviceType', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'read', AUDITOR: 'read' } },
      deviceIds: { field: 'deviceIds', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'read', AUDITOR: 'read' } },
      customOidId: { field: 'customOidId', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'read', AUDITOR: 'read' } },
      cooldownMs: { field: 'cooldownMs', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'read', AUDITOR: 'read' } },
      enabled: { field: 'enabled', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'read', AUDITOR: 'read' } },
      createdAt: { field: 'createdAt', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      updatedAt: { field: 'updatedAt', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
    },
  },
  Backup: {
    entity: 'Backup',
    fields: {
      id: { field: 'id', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      deviceId: { field: 'deviceId', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      configHash: { field: 'configHash', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      configContent: { field: 'configContent', roles: { ADMIN: 'read', OPERATOR: 'none', VIEWER: 'none', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'none', AUDITOR: 'none' } },
      status: { field: 'status', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      triggerType: { field: 'triggerType', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      timestamp: { field: 'timestamp', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      sizeBytes: { field: 'sizeBytes', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      errorMessage: { field: 'errorMessage', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      isProtected: { field: 'isProtected', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'read', AUDITOR: 'read' } },
      isCompressed: { field: 'isCompressed', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      isEncrypted: { field: 'isEncrypted', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
    },
  },
  ProvisioningLog: {
    entity: 'ProvisioningLog',
    fields: {
      id: { field: 'id', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      deviceId: { field: 'deviceId', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      action: { field: 'action', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      status: { field: 'status', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      fields: { field: 'fields', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'none', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      command: { field: 'command', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'none', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      response: { field: 'response', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'none', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      errorMessage: { field: 'errorMessage', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      templateName: { field: 'templateName', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      executedBy: { field: 'executedBy', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'none', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      executedAt: { field: 'executedAt', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
    },
  },
  Anomaly: {
    entity: 'Anomaly',
    fields: {
      id: { field: 'id', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      deviceId: { field: 'deviceId', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      metricType: { field: 'metricType', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      anomalyScore: { field: 'anomalyScore', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      severity: { field: 'severity', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      confidence: { field: 'confidence', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      timestamp: { field: 'timestamp', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      features: { field: 'features', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'none', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      explanation: { field: 'explanation', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
    },
  },
  FeatureFlag: {
    entity: 'FeatureFlag',
    fields: {
      id: { field: 'id', roles: { ADMIN: 'read', OPERATOR: 'none', VIEWER: 'none', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'none', AUDITOR: 'none' } },
      key: { field: 'key', roles: { ADMIN: 'read', OPERATOR: 'none', VIEWER: 'none', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'none', AUDITOR: 'none' } },
      name: { field: 'name', roles: { ADMIN: 'write', OPERATOR: 'none', VIEWER: 'none', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'none', AUDITOR: 'none' } },
      description: { field: 'description', roles: { ADMIN: 'write', OPERATOR: 'none', VIEWER: 'none', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'none', AUDITOR: 'none' } },
      enabled: { field: 'enabled', roles: { ADMIN: 'write', OPERATOR: 'none', VIEWER: 'none', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'none', AUDITOR: 'none' } },
      rolloutPercentage: { field: 'rolloutPercentage', roles: { ADMIN: 'write', OPERATOR: 'none', VIEWER: 'none', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'none', AUDITOR: 'none' } },
      conditions: { field: 'conditions', roles: { ADMIN: 'write', OPERATOR: 'none', VIEWER: 'none', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'none', AUDITOR: 'none' } },
      updatedBy: { field: 'updatedBy', roles: { ADMIN: 'read', OPERATOR: 'none', VIEWER: 'none', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'none', AUDITOR: 'none' } },
      createdAt: { field: 'createdAt', roles: { ADMIN: 'read', OPERATOR: 'none', VIEWER: 'none', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'none', AUDITOR: 'none' } },
      updatedAt: { field: 'updatedAt', roles: { ADMIN: 'read', OPERATOR: 'none', VIEWER: 'none', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'none', AUDITOR: 'none' } },
    },
  },
  MaintenanceWindow: {
    entity: 'MaintenanceWindow',
    fields: {
      id: { field: 'id', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      name: { field: 'name', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'read', AUDITOR: 'read' } },
      startAt: { field: 'startAt', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'read', AUDITOR: 'read' } },
      endAt: { field: 'endAt', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'read', AUDITOR: 'read' } },
      reason: { field: 'reason', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'read', AUDITOR: 'read' } },
      suppressedTypes: { field: 'suppressedTypes', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'read', AUDITOR: 'read' } },
      isActive: { field: 'isActive', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read', NETWORK_ADMIN: 'write', SECURITY_ADMIN: 'write', HELPDESK: 'read', AUDITOR: 'read' } },
      deviceId: { field: 'deviceId', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      createdAt: { field: 'createdAt', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
      updatedAt: { field: 'updatedAt', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read', NETWORK_ADMIN: 'read', SECURITY_ADMIN: 'read', HELPDESK: 'read', AUDITOR: 'read' } },
    },
  },
};

export function getFieldPermission(
  entity: string,
  field: string,
  role: UserRole,
  action: 'read' | 'write' = 'read'
): FieldPermission {
  const entityPerms = FIELD_PERMISSIONS[entity];
  if (!entityPerms) return 'read';

  const fieldRule = entityPerms.fields[field];
  if (!fieldRule) return 'read';

  return fieldRule.roles[role] ?? 'read';
}

export function filterFieldsForRole<T extends Record<string, any>>(
  entity: string,
  data: T,
  role: UserRole,
  action: 'read' | 'write' = 'read'
): Partial<T> {
  const entityPerms = FIELD_PERMISSIONS[entity];
  if (!entityPerms) return data;

  const filtered: Partial<T> = {};
  
  for (const [key, value] of Object.entries(data)) {
    const permission = getFieldPermission(entity, key, role, action);
    if (permission !== 'none') {
      filtered[key as keyof T] = value;
    }
  }
  
  return filtered;
}

export function filterFieldsForRoleArray<T extends Record<string, any>>(
  entity: string,
  data: T[],
  role: UserRole,
  action: 'read' | 'write' = 'read'
): Partial<T>[] {
  return data.map(item => filterFieldsForRole(entity, item, role, action));
}

export function validateFieldWrite(
  entity: string,
  field: string,
  role: UserRole
): boolean {
  return getFieldPermission(entity, field, role, 'write') === 'write';
}

export function getWritableFields(entity: string, role: UserRole): string[] {
  const entityPerms = FIELD_PERMISSIONS[entity];
  if (!entityPerms) return [];

  return Object.entries(entityPerms.fields)
    .filter(([, rule]) => rule.roles[role] === 'write')
    .map(([field]) => field);
}

export function getReadableFields(entity: string, role: UserRole): string[] {
  const entityPerms = FIELD_PERMISSIONS[entity];
  if (!entityPerms) return [];

  return Object.entries(entityPerms.fields)
    .filter(([, rule]) => rule.roles[role] !== 'none')
    .map(([field]) => field);
}
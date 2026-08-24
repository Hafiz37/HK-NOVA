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
      id: { field: 'id', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      name: { field: 'name', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read' } },
      ip: { field: 'ip', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read' } },
      type: { field: 'type', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read' } },
      vendor: { field: 'vendor', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read' } },
      model: { field: 'model', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read' } },
      location: { field: 'location', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read' } },
      status: { field: 'status', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      description: { field: 'description', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read' } },
      isDemo: { field: 'isDemo', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      credentials: { 
        field: 'credentials', 
        roles: { ADMIN: 'write', OPERATOR: 'none', VIEWER: 'none' } 
      },
      cpuThresholdOverride: { field: 'cpuThresholdOverride', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read' } },
      memThresholdOverride: { field: 'memThresholdOverride', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read' } },
      cpuResolveThresholdOverride: { field: 'cpuResolveThresholdOverride', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read' } },
      memResolveThresholdOverride: { field: 'memResolveThresholdOverride', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read' } },
      createdAt: { field: 'createdAt', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      updatedAt: { field: 'updatedAt', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      deletedAt: { field: 'deletedAt', roles: { ADMIN: 'read', OPERATOR: 'none', VIEWER: 'none' } },
    },
  },
  Alert: {
    entity: 'Alert',
    fields: {
      id: { field: 'id', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      type: { field: 'type', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      severity: { field: 'severity', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      status: { field: 'status', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read' } },
      message: { field: 'message', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      deviceId: { field: 'deviceId', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      assigneeId: { field: 'assigneeId', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'none' } },
      acknowledgedAt: { field: 'acknowledgedAt', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      resolvedAt: { field: 'resolvedAt', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      resolutionNote: { field: 'resolutionNote', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read' } },
      metadata: { field: 'metadata', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'none' } },
      createdAt: { field: 'createdAt', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      updatedAt: { field: 'updatedAt', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
    },
  },
  User: {
    entity: 'User',
    fields: {
      id: { field: 'id', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      username: { field: 'username', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'none' } },
      email: { field: 'email', roles: { ADMIN: 'write', OPERATOR: 'read', VIEWER: 'none' } },
      fullName: { field: 'fullName', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read' } },
      role: { field: 'role', roles: { ADMIN: 'write', OPERATOR: 'none', VIEWER: 'none' } },
      isActive: { field: 'isActive', roles: { ADMIN: 'write', OPERATOR: 'none', VIEWER: 'none' } },
      passwordHash: { field: 'passwordHash', roles: { ADMIN: 'none', OPERATOR: 'none', VIEWER: 'none' } },
      lastLoginAt: { field: 'lastLoginAt', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'none' } },
      createdAt: { field: 'createdAt', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      updatedAt: { field: 'updatedAt', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
    },
  },
  AlertRule: {
    entity: 'AlertRule',
    fields: {
      id: { field: 'id', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      name: { field: 'name', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read' } },
      metric: { field: 'metric', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read' } },
      operator: { field: 'operator', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read' } },
      threshold: { field: 'threshold', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read' } },
      severity: { field: 'severity', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read' } },
      consecutiveSamples: { field: 'consecutiveSamples', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read' } },
      deviceScope: { field: 'deviceScope', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read' } },
      deviceType: { field: 'deviceType', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read' } },
      deviceIds: { field: 'deviceIds', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read' } },
      customOidId: { field: 'customOidId', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read' } },
      cooldownMs: { field: 'cooldownMs', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read' } },
      enabled: { field: 'enabled', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read' } },
      createdAt: { field: 'createdAt', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      updatedAt: { field: 'updatedAt', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
    },
  },
  Backup: {
    entity: 'Backup',
    fields: {
      id: { field: 'id', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      deviceId: { field: 'deviceId', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      configHash: { field: 'configHash', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      configContent: { field: 'configContent', roles: { ADMIN: 'read', OPERATOR: 'none', VIEWER: 'none' } },
      status: { field: 'status', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      triggerType: { field: 'triggerType', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      timestamp: { field: 'timestamp', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      sizeBytes: { field: 'sizeBytes', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      errorMessage: { field: 'errorMessage', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      isProtected: { field: 'isProtected', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read' } },
      isCompressed: { field: 'isCompressed', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      isEncrypted: { field: 'isEncrypted', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
    },
  },
  ProvisioningLog: {
    entity: 'ProvisioningLog',
    fields: {
      id: { field: 'id', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      deviceId: { field: 'deviceId', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      action: { field: 'action', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      status: { field: 'status', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      fields: { field: 'fields', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'none' } },
      command: { field: 'command', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'none' } },
      response: { field: 'response', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'none' } },
      errorMessage: { field: 'errorMessage', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      templateName: { field: 'templateName', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      executedBy: { field: 'executedBy', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'none' } },
      executedAt: { field: 'executedAt', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
    },
  },
  Anomaly: {
    entity: 'Anomaly',
    fields: {
      id: { field: 'id', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      deviceId: { field: 'deviceId', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      metricType: { field: 'metricType', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      anomalyScore: { field: 'anomalyScore', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      severity: { field: 'severity', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      confidence: { field: 'confidence', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      timestamp: { field: 'timestamp', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      features: { field: 'features', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'none' } },
      explanation: { field: 'explanation', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
    },
  },
  FeatureFlag: {
    entity: 'FeatureFlag',
    fields: {
      id: { field: 'id', roles: { ADMIN: 'read', OPERATOR: 'none', VIEWER: 'none' } },
      key: { field: 'key', roles: { ADMIN: 'read', OPERATOR: 'none', VIEWER: 'none' } },
      name: { field: 'name', roles: { ADMIN: 'write', OPERATOR: 'none', VIEWER: 'none' } },
      description: { field: 'description', roles: { ADMIN: 'write', OPERATOR: 'none', VIEWER: 'none' } },
      enabled: { field: 'enabled', roles: { ADMIN: 'write', OPERATOR: 'none', VIEWER: 'none' } },
      rolloutPercentage: { field: 'rolloutPercentage', roles: { ADMIN: 'write', OPERATOR: 'none', VIEWER: 'none' } },
      conditions: { field: 'conditions', roles: { ADMIN: 'write', OPERATOR: 'none', VIEWER: 'none' } },
      updatedBy: { field: 'updatedBy', roles: { ADMIN: 'read', OPERATOR: 'none', VIEWER: 'none' } },
      createdAt: { field: 'createdAt', roles: { ADMIN: 'read', OPERATOR: 'none', VIEWER: 'none' } },
      updatedAt: { field: 'updatedAt', roles: { ADMIN: 'read', OPERATOR: 'none', VIEWER: 'none' } },
    },
  },
  MaintenanceWindow: {
    entity: 'MaintenanceWindow',
    fields: {
      id: { field: 'id', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      name: { field: 'name', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read' } },
      startAt: { field: 'startAt', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read' } },
      endAt: { field: 'endAt', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read' } },
      reason: { field: 'reason', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read' } },
      suppressedTypes: { field: 'suppressedTypes', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read' } },
      isActive: { field: 'isActive', roles: { ADMIN: 'write', OPERATOR: 'write', VIEWER: 'read' } },
      deviceId: { field: 'deviceId', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      createdAt: { field: 'createdAt', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
      updatedAt: { field: 'updatedAt', roles: { ADMIN: 'read', OPERATOR: 'read', VIEWER: 'read' } },
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
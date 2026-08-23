import { z } from 'zod';

const credentialsSchema = z.object({
  snmpVersion: z.enum(['v1', 'v2c', 'v3']).default('v2c').optional(),
  snmpCommunity: z.string().max(256).optional().nullable(),
  snmpPort: z.coerce.number().int().min(1).max(65535).default(161).optional(),
  snmpUser: z.string().max(128).optional().nullable(),
  snmpAuthPass: z.string().max(256).optional().nullable(),
  snmpPrivPass: z.string().max(256).optional().nullable(),
  sshUsername: z.string().max(128).optional().nullable(),
  sshPassword: z.string().max(256).optional().nullable(),
  sshPort: z.coerce.number().int().min(1).max(65535).default(22).optional(),
}).optional();

const ipv4Schema = z.string().regex(/^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/, 'Invalid IPv4 address');

export const createDeviceSchema = z.object({
  name: z.string().min(1, 'Device name is required').max(100),
  ip: ipv4Schema,
  type: z.enum(['ROUTER', 'SWITCH', 'OLT', 'ONT', 'FIREWALL', 'SERVER', 'OTHER']),
  vendor: z.string().max(50).optional().nullable(),
  model: z.string().max(100).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  credentials: credentialsSchema,
  cpuThresholdOverride: z.coerce.number().min(1).max(100).optional().nullable(),
  memThresholdOverride: z.coerce.number().min(1).max(100).optional().nullable(),
  cpuResolveThresholdOverride: z.coerce.number().min(1).max(100).optional().nullable(),
  memResolveThresholdOverride: z.coerce.number().min(1).max(100).optional().nullable(),
});

export const updateDeviceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  ip: ipv4Schema.optional(),
  type: z.enum(['ROUTER', 'SWITCH', 'OLT', 'ONT', 'FIREWALL', 'SERVER', 'OTHER']).optional(),
  vendor: z.string().max(50).optional().nullable(),
  model: z.string().max(100).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  status: z.enum(['UP', 'DOWN', 'UNKNOWN', 'MAINTENANCE']).optional(),
  credentials: credentialsSchema,
  cpuThresholdOverride: z.coerce.number().min(1).max(100).optional().nullable(),
  memThresholdOverride: z.coerce.number().min(1).max(100).optional().nullable(),
  cpuResolveThresholdOverride: z.coerce.number().min(1).max(100).optional().nullable(),
  memResolveThresholdOverride: z.coerce.number().min(1).max(100).optional().nullable(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});

export const queryDeviceSchema = z.object({
  search: z.string().max(200).optional(),
  type: z.enum(['ROUTER', 'SWITCH', 'OLT', 'ONT', 'FIREWALL', 'SERVER', 'OTHER']).optional(),
  status: z.enum(['UP', 'DOWN', 'UNKNOWN', 'MAINTENANCE']).optional(),
  showDemo: z.coerce.boolean().default(false),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  sortBy: z.enum(['name', 'ip', 'type', 'vendor', 'status', 'createdAt', 'updatedAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const bulkCreateDeviceSchema = z.object({
  devices: z.array(createDeviceSchema).min(1).max(100),
});

export const bulkUpdateDeviceSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  data: updateDeviceSchema,
});

export const bulkTestConnectionSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(50),
});

export const deviceIdSchema = z.object({
  id: z.string().min(1),
});
import prisma from '@/lib/prisma';
import { maskRequestBody, maskResponseData } from '@/lib/data-masking';

export type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'ACKNOWLEDGE'
  | 'RESOLVE'
  | 'EXPORT'
  | 'EXECUTE'
  | 'BACKUP'
  | 'BACKUP_VIEW'
  | 'BACKUP_RESTORE'
  | 'BACKUP_RESTORE_PREVIEW'
  | 'ROLLBACK_PREVIEW'
  | 'ROLLBACK_EXECUTE'
  | 'BULK_CREATE'
  | 'BULK_UPDATE'
  | 'BULK_DELETE'
  | 'BULK_ACKNOWLEDGE'
  | 'BULK_RESOLVE'
  | 'BULK_FEEDBACK'
  | 'BULK_INJECT'
  | 'BULK_SCHEDULE'
  | 'BULK_ROLLBACK'
  | 'BULK_RETRY'
  | 'BULK_ENABLE'
  | 'BULK_DISABLE'
  | 'BULK_ACTIVATE'
  | 'BULK_DEACTIVATE'
  | 'BULK_RESTORE';

export type AuditEntity =
  | 'User'
  | 'Device'
  | 'Alert'
  | 'AlertRule'
  | 'Setting'
  | 'MaintenanceWindow'
  | 'Metric'
  | 'AuditLog'
  | 'Backup'
  | 'ProvisioningLog'
  | 'BackupRestore'
  | 'ScheduledProvisioning'
  | 'OltTemplateVersion'
  | 'BatchProvisioning'
  | 'ProvisioningRequest'
  | 'ExportTemplate'
  | 'FeatureFlag'
  | 'Anomaly'
  | 'AnomalyFeedback';

export interface AuditDetails {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  fieldsChanged?: string[];
  requestBody?: Record<string, unknown>;
  responseBody?: Record<string, unknown>;
  queryParams?: Record<string, unknown>;
  httpMethod?: string;
  url?: string;
  userAgent?: string;
  ipGeolocation?: GeoLocationInfo;
  deviceFingerprint?: string;
  durationMs?: number;
  statusCode?: number;
  errorMessage?: string;
  [key: string]: unknown;
}

export interface GeoLocationInfo {
  country?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  isp?: string;
  timezone?: string;
}

export interface LogAuditParams {
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string;
  userId: string;
  details?: AuditDetails;
  ipAddress?: string;
  request?: Request;
  responseStatus?: number;
  error?: Error;
  durationMs?: number;
  responseBody?: Record<string, unknown>;
}

export interface LogAuditOptions {
  includeRequestBody?: boolean;
  includeResponseBody?: boolean;
  includeQueryParams?: boolean;
  includeHeaders?: boolean;
  maskSensitiveFields?: boolean;
  geoLookup?: (ip: string) => Promise<GeoLocationInfo | null>;
}

export interface GeoLocationInfo {
  country?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  isp?: string;
  timezone?: string;
}

export interface LogAuditOptions {
  includeRequestBody?: boolean;
  includeResponseBody?: boolean;
  includeQueryParams?: boolean;
  includeHeaders?: boolean;
  maskSensitiveFields?: boolean;
  geoLookup?: (ip: string) => Promise<GeoLocationInfo | null>;
}

const DEFAULT_GEO_LOOKUP = async (ip: string): Promise<GeoLocationInfo | null> => {
  if (!ip || ip === 'unknown' || ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.')) {
    return { country: 'Local', region: 'Local', city: 'Local' };
  }
  
  try {
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city,lat,lon,isp,timezone`);
    if (!response.ok) return null;
    const data = await response.json();
    if (data.status === 'success') {
      return {
        country: data.country,
        region: data.regionName,
        city: data.city,
        latitude: data.lat,
        longitude: data.lon,
        isp: data.isp,
        timezone: data.timezone,
      };
    }
  } catch {
    // Silently fail
  }
  return null;
};

const DEVICE_FINGERPRINT_HEADERS = [
  'user-agent',
  'accept-language',
  'accept-encoding',
  'accept',
];

function generateDeviceFingerprint(request: Request): string {
  const parts: string[] = [];
  for (const header of DEVICE_FINGERPRINT_HEADERS) {
    const value = request.headers.get(header);
    if (value) parts.push(value);
  }
  
  let hash = 0;
  const str = parts.join('|');
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function maskDetails(details: AuditDetails | undefined, mask: boolean): AuditDetails {
  if (!details) return {} as AuditDetails;
  if (!mask) return details;

  const masked: AuditDetails = { ...details };
  
  if (masked.requestBody) {
    masked.requestBody = maskRequestBody(masked.requestBody);
  }
  
  if (masked.responseBody) {
    masked.responseBody = maskResponseData(masked.responseBody, 'OPERATOR');
  }

  return masked;
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') || 'unknown';
}

export async function logAudit(
  params: LogAuditParams,
  options: LogAuditOptions = {}
): Promise<void> {
  const {
    includeRequestBody = true,
    includeResponseBody = true,
    includeQueryParams = true,
    includeHeaders = false,
    maskSensitiveFields = true,
    geoLookup = DEFAULT_GEO_LOOKUP,
  } = options;

  let ipAddress = params.ipAddress;
  let userAgent: string | undefined;
  let queryParams: Record<string, unknown> | undefined;
  let requestBody: Record<string, unknown> | undefined;
  let responseBody: Record<string, unknown> | undefined;
  let url: string | undefined;
  let httpMethod: string | undefined;
  let geoLocation: GeoLocationInfo | null = null;
  let deviceFingerprint: string | undefined;

  if (params.request) {
    ipAddress = params.ipAddress ?? getClientIp(params.request);
    userAgent = params.request.headers.get('user-agent') || undefined;
    httpMethod = params.request.method;
    url = params.request.url;

    if (includeHeaders) {
      const fingerprint = generateDeviceFingerprint(params.request);
      deviceFingerprint = fingerprint;
    }

    if (includeQueryParams) {
      const searchParams = new URL(params.request.url).searchParams;
      queryParams = Object.fromEntries(searchParams.entries());
    }

    if (includeRequestBody && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(params.request.method)) {
      try {
        const clonedRequest = params.request.clone();
        requestBody = await clonedRequest.json().catch(() => undefined);
        if (requestBody && maskSensitiveFields) {
          requestBody = maskRequestBody(requestBody);
        }
      } catch {
        requestBody = undefined;
      }
    }
  }

  if (params.ipAddress || (params.request && !params.ipAddress)) {
    const ip = ipAddress ?? (params.request ? getClientIp(params.request) : 'unknown');
    geoLocation = await geoLookup(ip);
  }

  let details: AuditDetails = params.details ?? {};
  
  if (includeRequestBody && requestBody) {
    details.requestBody = requestBody;
  }
  
  if (includeResponseBody && params.responseBody) {
    let responseBodyLocal: Record<string, unknown> = params.responseBody;
    if (maskSensitiveFields) {
      responseBodyLocal = maskResponseData(responseBodyLocal, 'OPERATOR');
    }
    details.responseBody = responseBodyLocal;
  }

  if (includeQueryParams && queryParams) {
    details.queryParams = queryParams;
  }

  if (httpMethod) details.httpMethod = httpMethod;
  if (url) details.url = url;
  if (userAgent) details.userAgent = userAgent;
  if (geoLocation) details.ipGeolocation = geoLocation;
  if (deviceFingerprint) details.deviceFingerprint = deviceFingerprint;
  if (params.durationMs !== undefined) details.durationMs = params.durationMs;
  if (params.responseStatus !== undefined) details.statusCode = params.responseStatus;
  if (params.error) details.errorMessage = params.error.message;

  if (maskSensitiveFields) {
    details = maskDetails(details, true);
  }

  await prisma.auditLog.create({
    data: {
      action: params.action,
      entity: params.entity,
      entityId: params.entityId ?? '',
      userId: params.userId,
      details: details as any,
      ipAddress: ipAddress ?? 'unknown',
    },
  });
}


export async function getGeoLocation(ip: string): Promise<GeoLocationInfo | null> {
  return DEFAULT_GEO_LOOKUP(ip);
}

export function createAuditMiddleware(
  options: { action: AuditAction; entity: AuditEntity; entityIdExtractor?: (request: Request) => string | Promise<string> } & LogAuditOptions
) {
  const { action, entity, entityIdExtractor, ...auditOptions } = options;

  return async function auditMiddleware(request: Request, handler: (request: Request) => Promise<Response>): Promise<Response> {
    const startTime = Date.now();
    let response: Response;
    let responseBody: Record<string, unknown> | undefined;
    let error: Error | undefined;
    let entityId: string | undefined;

    try {
      if (entityIdExtractor) {
        entityId = await entityIdExtractor(request);
      }

      response = await handler(request);

      if (auditOptions.includeResponseBody && response.ok) {
        try {
          const clonedResponse = response.clone();
          responseBody = await clonedResponse.json().catch(() => undefined);
        } catch {
          responseBody = undefined;
        }
      }

      await logAudit({
        action,
        entity,
        entityId,
        userId: '',
        responseStatus: response.status,
        responseBody,
        durationMs: Date.now() - startTime,
        request,
      }, auditOptions);

      return response;
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));
      response = new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
      
      await logAudit({
        action,
        entity,
        entityId,
        userId: '',
        error,
        responseStatus: 500,
        durationMs: Date.now() - startTime,
        request,
      }, auditOptions);

      return response;
    }
  };
}
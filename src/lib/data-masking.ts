import { UserRole } from '@prisma/client';

export interface MaskingRule {
  pattern: RegExp;
  replacement: string;
  fields: string[];
}

export const DEFAULT_MASKING_RULES: MaskingRule[] = [
  {
    pattern: /password/i,
    replacement: '***MASKED***',
    fields: ['password', 'passwordHash', 'sshPassword', 'snmpAuthPass', 'snmpPrivPass', 'snmpCommunity'],
  },
  {
    pattern: /token/i,
    replacement: '***MASKED***',
    fields: ['token', 'accessToken', 'refreshToken', 'apiToken', 'apiKey', 'secret'],
  },
  {
    pattern: /secret/i,
    replacement: '***MASKED***',
    fields: ['secret', 'clientSecret', 'sharedSecret', 'privateKey'],
  },
  {
    pattern: /credential/i,
    replacement: '***MASKED***',
    fields: ['credentials', 'credential'],
  },
  {
    pattern: /authorization/i,
    replacement: '***MASKED***',
    fields: ['authorization', 'authHeader', 'bearerToken'],
  },
];

export interface MaskingOptions {
  rules?: MaskingRule[];
  role?: UserRole;
  customFields?: string[];
}

function maskValue(value: unknown, fieldName: string, rules: MaskingRule[]): unknown {
  if (value === null || value === undefined) return value;

  const fieldLower = fieldName.toLowerCase();

  for (const rule of rules) {
    if (rule.fields.some(f => fieldLower.includes(f.toLowerCase()))) {
      if (typeof value === 'string') {
        if (value.length === 0) return value;
        return rule.replacement;
      }
      if (typeof value === 'object') {
        return rule.replacement;
      }
    }
  }

  if (typeof value === 'object' && value !== null) {
    if (Array.isArray(value)) {
      return value.map(v => maskValue(v, fieldName, rules));
    }
    const masked: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      masked[key] = maskValue(val, key, rules);
    }
    return masked;
  }

  return value;
}

export function maskSensitiveData<T extends Record<string, any>>(
  data: T,
  options: MaskingOptions = {}
): T {
  const { rules = DEFAULT_MASKING_RULES, customFields = [] } = options;
  
  if (!data || typeof data !== 'object') return data;
  
  if (Array.isArray(data)) {
    return data.map(item => maskSensitiveData(item, options)) as unknown as T;
  }

  const masked: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(data)) {
    const allRules = [...rules, ...(customFields.length > 0 ? [{
      pattern: new RegExp(customFields.join('|'), 'i'),
      replacement: '***MASKED***',
      fields: customFields,
    }] : [])];
    
    masked[key] = maskValue(value, key, allRules);
  }

  return masked as T;
}

export function maskObjectForRole<T extends Record<string, any>>(
  data: T,
  role: UserRole,
  action: 'read' | 'write' = 'read'
): T {
  if (!data || typeof data !== 'object') return data;
  
  if (role === 'ADMIN') {
    return data;
  }

  const customFields: string[] = [];
  
  if (action === 'read') {
    if (role === 'OPERATOR') {
      customFields.push('sshPassword', 'snmpAuthPass', 'snmpPrivPass', 'snmpCommunity');
    }
    if (role === 'VIEWER') {
      customFields.push('sshPassword', 'snmpAuthPass', 'snmpPrivPass', 'snmpCommunity', 'credentials');
    }
  }
  
  return maskSensitiveData(data, { customFields });
}

export function maskRequestBody<T extends Record<string, any>>(body: T): T {
  return maskSensitiveData(body, {
    customFields: ['password', 'passwordHash', 'token', 'secret', 'credential', 'authorization'],
  });
}

export function maskResponseData<T extends Record<string, any>>(data: T, role: UserRole): T {
  if (role === 'ADMIN') return data;
  
  const customFields = role === 'VIEWER' 
    ? ['sshPassword', 'snmpAuthPass', 'snmpPrivPass', 'snmpCommunity', 'credentials', 'passwordHash', 'token', 'secret']
    : ['sshPassword', 'snmpAuthPass', 'snmpPrivPass', 'snmpCommunity'];
  
  return maskSensitiveData(data, { customFields });
}

export function sanitizeForLog(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data;
  return maskSensitiveData(data as Record<string, any>, {
    customFields: ['password', 'passwordHash', 'token', 'secret', 'credential', 'authorization', 'sshPassword', 'snmpAuthPass', 'snmpPrivPass', 'snmpCommunity'],
  });
}
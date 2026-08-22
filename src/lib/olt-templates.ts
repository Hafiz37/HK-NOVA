import huaweiRaw from '@/config/olt-templates/huawei.json';
import zteRaw from '@/config/olt-templates/zte.json';
import genericRaw from '@/config/olt-templates/generic.json';
import type { OLTTemplate } from '@/types/provisioning';

export type TemplateName = 'huawei' | 'zte' | 'generic';

export type { OLTTemplate };

export const OLT_TEMPLATES: Record<TemplateName, OLTTemplate> = {
  huawei: huaweiRaw as OLTTemplate,
  zte: zteRaw as OLTTemplate,
  generic: genericRaw as OLTTemplate,
};

export const TEMPLATE_NAMES: TemplateName[] = ['huawei', 'zte', 'generic'];

export type ProvisioningActionKey =
  | 'create_service'
  | 'suspend_service'
  | 'reactivate_service'
  | 'terminate_service'
  | 'check_status';

export const PROVISIONING_ACTIONS: ProvisioningActionKey[] = [
  'create_service',
  'suspend_service',
  'reactivate_service',
  'terminate_service',
  'check_status',
];

/** Fields usable inside `{...}` placeholders in the templates. */
export const KNOWN_PLACEHOLDERS = [
  'ponPort',
  'ontSlot',
  'ontSerial',
  'vlan',
  'serviceProfile',
  'lineProfile',
  'tcontProfile',
  'ontType',
  'servicePort',
] as const;

export interface ProvisioningFields {
  ponPort?: string;
  ontSlot?: string;
  ontSerial?: string;
  vlan?: number;
  serviceProfile?: string;
  lineProfile?: string;
  tcontProfile?: string;
  ontType?: string;
  servicePort?: string;
}

/**
 * Choose a template based on a device vendor string, falling back to generic.
 */
export function resolveTemplate(vendor: string | null | undefined): { name: TemplateName; template: OLTTemplate } {
  const v = (vendor ?? '').toLowerCase();
  if (v.includes('huawei')) return { name: 'huawei', template: OLT_TEMPLATES.huawei };
  if (v.includes('zte')) return { name: 'zte', template: OLT_TEMPLATES.zte };
  return { name: 'generic', template: OLT_TEMPLATES.generic };
}

function extractPlaceholders(command: string): string[] {
  const matches = command.matchAll(/\{([a-zA-Z0-9]+)\}/g);
  return [...matches].map((m) => m[1]);
}

/**
 * Validate that all placeholders used by `action` have a value.
 * Returns the list of missing fields (empty = ok).
 */
export function validateActionFields(
  template: OLTTemplate,
  action: string,
  fields: ProvisioningFields
): string[] {
  const raw = template[action];
  if (!raw) return ['Action tidak dikenal'];
  const req = new Set<string>();
  for (const command of raw.commands) {
    for (const ph of extractPlaceholders(command)) req.add(ph);
  }
  const missing: string[] = [];
  for (const field of req) {
    const value = fields[field as keyof ProvisioningFields];
    if (value == null || value === '') missing.push(field);
  }
  return missing;
}


/**
 * Render the command list for `action` with `fields` substituted into {var}.
 * Throws when a placeholder is unknown (typo) or a required value is missing.
 */
export function renderActionCommands(
  template: OLTTemplate,
  action: string,
  fields: ProvisioningFields
): { commands: string[]; description: string } {
  const raw = template[action];
  if (!raw) {
    throw new Error(`Action "${action}" tidak tersedia di template ini`);
  }

  const missing = validateActionFields(template, action, fields);
  if (missing.length > 0) {
    throw new Error(`Field wajib belum diisi: ${missing.join(', ')}`);
  }

  const render = (command: string): string => {
    return command.replace(/\{([a-zA-Z0-9]+)\}/g, (whole, name: string) => {
      if (!(KNOWN_PLACEHOLDERS as readonly string[]).includes(name)) {
        throw new Error(`Placeholder tak dikenal: {${name}}`);
      }
      const value = fields[name as keyof ProvisioningFields];
      return value == null ? whole : String(value);
    });
  };

  return { commands: raw.commands.map(render), description: raw.description };
}

/**
 * Metadata used by the UI to render a dynamic form for any template.
 */
export function getTemplateMetadata(template: OLTTemplate) {
  return PROVISIONING_ACTIONS.map((action) => {
    const def = template[action];
    if (!def) return null;
    return {
      action,
      description: def.description,
      requiredFields: collectRequiredFieldsForAction(template, action),
    };
  }).filter((x): x is NonNullable<typeof x> => x !== null);
}

function collectRequiredFieldsForAction(template: OLTTemplate, action: string): string[] {
  const set = new Set<string>();
  const def = template[action];
  if (!def) return [];
  for (const command of def.commands) {
    for (const ph of extractPlaceholders(command)) set.add(ph);
  }
  return [...set];
}
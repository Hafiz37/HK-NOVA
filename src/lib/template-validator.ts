import { OLT_TEMPLATES, KNOWN_PLACEHOLDERS, PROVISIONING_ACTIONS, type TemplateName, type OLTTemplate } from './olt-templates';

const KNOWN_PLACEHOLDER_SET = new Set(KNOWN_PLACEHOLDERS as readonly string[]);

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

const VENDOR_COMMAND_PATTERNS: Record<TemplateName, RegExp[]> = {
  huawei: [
    /^interface gpon \d+\/\{\w+\}$/,
    /^ont add \{\w+\} sn-auth \{\w+\} omci ont-lineprofile-id \{\w+\} ont-srvprofile-id \{\w+\}$/,
    /^ont port native-vlan \{\w+\} eth \d+ vlan-id \{\w+\}$/,
    /^service-port \{\w+\} vlan \{\w+\} gpon \d+\/\{\w+\} ont \{\w+\} gemport \d+ multi-service user-vlan \{\w+\}$/,
    /^ont modify \{\w+\} state (block|active)$/,
    /^undo service-port \{\w+\}$/,
    /^ont delete \{\w+\}$/,
    /^display ont info \{\w+\} \d+\/\{\w+\} \{\w+\}$/,
    /^quit$/,
  ],
  zte: [
    /^configure terminal$/,
    /^interface gpon-olt_\{\w+\}$/,
    /^onu \{\w+\} type \{\w+\} sn \{\w+\}$/,
    /^exit$/,
    /^interface gpon-onu_\{\w+\}:\{\w+\}$/,
    /^tcont \d+ profile \{\w+\}$/,
    /^gemport \d+ tcont \d+$/,
    /^switchport mode hybrid vlan \{\w+\} tag$/,
    /^shutdown$/,
    /^no shutdown$/,
    /^no onu \{\w+\}$/,
    /^show gpon onu state gpon-onu_\{\w+\}:\{\w+\}$/,
  ],
  generic: [
    /^config$/,
    /^interface pon \{\w+\}$/,
    /^add ont \{\w+\} serial \{\w+\}$/,
    /^vlan \{\w+\}$/,
    /^commit$/,
    /^exit$/,
    /^ont \{\w+\} (disable|enable)$/,
    /^remove ont \{\w+\}$/,
    /^show ont status \{\w+\} \{\w+\}$/,
  ],
};

function extractPlaceholders(command: string): string[] {
  const matches = command.matchAll(/\{([a-zA-Z0-9]+)\}/g);
  return [...matches].map((m) => m[1]);
}

function validatePlaceholders(command: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const placeholders = extractPlaceholders(command);

  for (const ph of placeholders) {
    if (!KNOWN_PLACEHOLDER_SET.has(ph)) {
      errors.push({
        field: 'placeholders',
        message: `Unknown placeholder: {${ph}} in command: ${command}`,
        severity: 'error',
      });
    }
  }

  return errors;
}

function validateCommandSyntax(templateName: TemplateName, command: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const patterns = VENDOR_COMMAND_PATTERNS[templateName];

  if (!patterns || patterns.length === 0) {
    return errors;
  }

  const hasMatch = patterns.some((pattern) => pattern.test(command));
  if (!hasMatch) {
    errors.push({
      field: 'syntax',
      message: `Command does not match known patterns for ${templateName}: ${command}`,
      severity: 'warning',
    });
  }

  return errors;
}

function validateActionCommands(
  templateName: TemplateName,
  action: string,
  commands: string[]
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (commands.length === 0) {
    errors.push({
      field: 'commands',
      message: `Action "${action}" has no commands`,
      severity: 'error',
    });
    return errors;
  }

  for (const command of commands) {
    errors.push(...validatePlaceholders(command));
    errors.push(...validateCommandSyntax(templateName, command));
  }

  const allPlaceholders = new Set<string>();
  for (const command of commands) {
    for (const ph of extractPlaceholders(command)) {
      allPlaceholders.add(ph);
    }
  }

  if (allPlaceholders.size === 0) {
    errors.push({
      field: 'placeholders',
      message: `Action "${action}" has no placeholders - commands may be static`,
      severity: 'warning',
    });
  }

  return errors;
}

export function validateTemplate(template: OLTTemplate, templateName: TemplateName): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  for (const action of PROVISIONING_ACTIONS) {
    const actionDef = template[action];
    if (!actionDef) {
      errors.push({
        field: 'actions',
        message: `Missing required action: ${action}`,
        severity: 'error',
      });
      continue;
    }

    if (!actionDef.description || actionDef.description.trim() === '') {
      warnings.push({
        field: 'description',
        message: `Action "${action}" has empty description`,
        severity: 'warning',
      });
    }

    if (!actionDef.commands || !Array.isArray(actionDef.commands)) {
      errors.push({
        field: 'commands',
        message: `Action "${action}" has invalid commands array`,
        severity: 'error',
      });
      continue;
    }

    const actionErrors = validateActionCommands(templateName, action, actionDef.commands);
    for (const err of actionErrors) {
      if (err.severity === 'error') errors.push(err);
      else warnings.push(err);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateAllTemplates(): Record<TemplateName, ValidationResult> {
  const results: Record<TemplateName, ValidationResult> = {} as Record<TemplateName, ValidationResult>;

  for (const templateName of ['huawei', 'zte', 'generic'] as TemplateName[]) {
    results[templateName] = validateTemplate(OLT_TEMPLATES[templateName], templateName);
  }

  return results;
}

export function getValidationSummary(results: Record<TemplateName, ValidationResult>): string {
  let summary = 'Template Validation Summary:\n';
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const [name, result] of Object.entries(results)) {
    const templateName = name as TemplateName;
    summary += `\n${templateName.toUpperCase()}: ${result.valid ? '✅ VALID' : '❌ INVALID'}`;
    summary += ` (${result.errors.length} errors, ${result.warnings.length} warnings)`;

    for (const err of result.errors) {
      summary += `\n  ❌ [${err.field}] ${err.message}`;
      totalErrors++;
    }
    for (const warn of result.warnings) {
      summary += `\n  ⚠️  [${warn.field}] ${warn.message}`;
      totalWarnings++;
    }
  }

  summary += `\n\nTotal: ${totalErrors} errors, ${totalWarnings} warnings`;
  return summary;
}
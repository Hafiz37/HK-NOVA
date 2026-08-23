import { PrismaClient } from '@prisma/client';
import { InputJsonValue } from '@prisma/client/runtime/library';

export interface ExportTemplate {
  id: string;
  name: string;
  description: string | undefined;
  format: 'csv' | 'xlsx' | 'pdf';
  filters: InputJsonValue;
  columns: InputJsonValue;
  isDefault: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const DEFAULT_TEMPLATES: Omit<ExportTemplate, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'All Provisioning Logs',
    description: 'Semua log provisioning tanpa filter',
    format: 'csv',
    filters: {} as InputJsonValue,
    columns: ['executedAt', 'deviceName', 'deviceIp', 'vendor', 'action', 'status', 'executionMode', 'templateName', 'ontSerial', 'ponPort', 'vlan', 'serviceProfile', 'executedBy', 'executionTimeMs', 'errorMessage', 'command'] as InputJsonValue,
    isDefault: true,
    createdBy: 'system',
  },
  {
    name: 'Failed Provisioning Only',
    description: 'Hanya log provisioning yang gagal',
    format: 'csv',
    filters: { status: 'FAILED' } as InputJsonValue,
    columns: ['executedAt', 'deviceName', 'deviceIp', 'vendor', 'action', 'status', 'ontSerial', 'ponPort', 'vlan', 'errorMessage', 'command'] as InputJsonValue,
    isDefault: true,
    createdBy: 'system',
  },
  {
    name: 'Create Service Activity',
    description: 'Aktivasi service (create_service) saja',
    format: 'csv',
    filters: { action: 'CREATE' } as InputJsonValue,
    columns: ['executedAt', 'deviceName', 'deviceIp', 'vendor', 'ontSerial', 'ponPort', 'ontSlot', 'vlan', 'serviceProfile', 'lineProfile', 'executedBy', 'executionTimeMs'] as InputJsonValue,
    isDefault: true,
    createdBy: 'system',
  },
  {
    name: 'Dry-run Preview Logs',
    description: 'Log dry-run saja untuk review',
    format: 'csv',
    filters: { executionMode: 'DRY_RUN' } as InputJsonValue,
    columns: ['executedAt', 'deviceName', 'deviceIp', 'vendor', 'action', 'ontSerial', 'ponPort', 'vlan', 'serviceProfile', 'executedBy', 'command'] as InputJsonValue,
    isDefault: true,
    createdBy: 'system',
  },
];

export async function getExportTemplates(prisma: PrismaClient, userId: string): Promise<ExportTemplate[]> {
  const templates = await prisma.exportTemplate.findMany({
    where: { OR: [{ createdBy: userId }, { isDefault: true }] },
    orderBy: { createdAt: 'desc' },
  });

  return templates.map((t) => ({
    ...t,
    filters: t.filters as InputJsonValue,
    columns: t.columns as InputJsonValue,
    description: t.description ?? undefined,
    format: t.format as 'csv' | 'xlsx' | 'pdf',
  }));
}

export async function createExportTemplate(
  prisma: PrismaClient,
  input: Omit<ExportTemplate, 'id' | 'createdAt' | 'updatedAt'>
): Promise<ExportTemplate> {
  const template = await prisma.exportTemplate.create({
    data: {
      ...input,
      filters: input.filters,
      columns: input.columns,
    },
  });

  return {
    ...template,
    filters: template.filters as InputJsonValue,
    columns: template.columns as InputJsonValue,
    description: template.description ?? undefined,
    format: template.format as 'csv' | 'xlsx' | 'pdf',
  };
}

export async function seedDefaultExportTemplates(prisma: PrismaClient): Promise<void> {
  for (const tmpl of DEFAULT_TEMPLATES) {
    await prisma.exportTemplate.upsert({
      where: { name_createdBy: { name: tmpl.name, createdBy: tmpl.createdBy } },
      update: { ...tmpl, filters: tmpl.filters, columns: tmpl.columns },
      create: { ...tmpl, filters: tmpl.filters, columns: tmpl.columns },
    });
  }
}
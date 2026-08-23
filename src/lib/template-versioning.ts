import { PrismaClient } from '@prisma/client';
import { OLT_TEMPLATES, type TemplateName, type OLTTemplate } from './olt-templates';
import { validateTemplate } from './template-validator';

export interface CreateTemplateVersionInput {
  name: TemplateName;
  version: string;
  content: OLTTemplate;
  changelog?: string;
  createdBy: string;
}

export async function createTemplateVersion(
  prisma: PrismaClient,
  input: CreateTemplateVersionInput
) {
  const validation = validateTemplate(input.content, input.name);
  if (!validation.valid) {
    throw new Error(`Template validation failed: ${validation.errors.map((e) => e.message).join(', ')}`);
  }

  const existing = await prisma.oltTemplateVersion.findUnique({
    where: { name_version: { name: input.name, version: input.version } },
  });

  if (existing) {
    throw new Error(`Version ${input.version} for template ${input.name} already exists`);
  }

  return await prisma.oltTemplateVersion.create({
    data: {
      name: input.name,
      version: input.version,
      content: JSON.parse(JSON.stringify(input.content)),
      changelog: input.changelog ?? null,
      createdBy: input.createdBy,
      isActive: false,
    },
  });
}

export async function activateTemplateVersion(
  prisma: PrismaClient,
  name: TemplateName,
  version: string
) {
  await prisma.oltTemplateVersion.updateMany({
    where: { name, isActive: true },
    data: { isActive: false },
  });

  const updated = await prisma.oltTemplateVersion.update({
    where: { name_version: { name, version } },
    data: { isActive: true },
  });

  return updated;
}

export async function getActiveTemplate(
  prisma: PrismaClient,
  name: TemplateName
): Promise<OLTTemplate> {
  const activeVersion = await prisma.oltTemplateVersion.findFirst({
    where: { name, isActive: true },
  });

  if (activeVersion) {
    return activeVersion.content as unknown as OLTTemplate;
  }

  return OLT_TEMPLATES[name];
}
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { OLT_TEMPLATES, TEMPLATE_NAMES, getTemplateMetadata } from '@/lib/olt-templates';

/**
 * GET /api/provisioning/olt-templates
 * Exposes template metadata (vendors, actions, required fields) so the UI can
 * build a dynamic provisioning form.
 */
export async function GET(): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const data = TEMPLATE_NAMES.map((name) => ({
    name,
    actions: getTemplateMetadata(OLT_TEMPLATES[name]),
  }));

  return NextResponse.json({ data });
}
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import { validateAllTemplates, getValidationSummary } from '@/lib/template-validator';

/**
 * GET /api/provisioning/templates/validate
 * Validate all OLT templates and return results
 */
export async function GET(): Promise<NextResponse> {
  const auth = await requireRole([UserRole.ADMIN, UserRole.OPERATOR]);
  if (!auth.ok) return auth.response;

  try {
    const results = validateAllTemplates();
    const summary = getValidationSummary(results);

    const allValid = Object.values(results).every((r) => r.valid);
    const totalErrors = Object.values(results).reduce((sum, r) => sum + r.errors.length, 0);
    const totalWarnings = Object.values(results).reduce((sum, r) => sum + r.warnings.length, 0);

    return NextResponse.json({
      valid: allValid,
      summary,
      details: results,
      stats: {
        totalTemplates: Object.keys(results).length,
        validTemplates: Object.values(results).filter((r) => r.valid).length,
        totalErrors,
        totalWarnings,
      },
    });
  } catch (error) {
    console.error('[API /api/provisioning/templates/validate GET] Error:', error);
    return NextResponse.json({ error: 'Failed to validate templates' }, { status: 500 });
  }
}
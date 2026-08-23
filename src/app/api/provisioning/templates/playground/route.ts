import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import { runTestCase, runTestSuite, DEFAULT_TEST_SUITE, type TestCase, type TestSuiteResult } from '@/lib/template-playground';
import { OLT_TEMPLATES, type TemplateName, type OLTTemplate } from '@/lib/olt-templates';
import { validateTemplate } from '@/lib/template-validator';

/**
 * GET /api/provisioning/templates/playground
 * Get default test suite
 */
export async function GET(): Promise<NextResponse> {
  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    return NextResponse.json({ data: DEFAULT_TEST_SUITE });
  } catch (error) {
    console.error('[API /api/provisioning/templates/playground GET] Error:', error);
    return NextResponse.json({ error: 'Failed to get test suite' }, { status: 500 });
  }
}

/**
 * POST /api/provisioning/templates/playground
 * Run test suite
 * Body: { testCases?: TestCase[], customTemplate?: { name, content } }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body harus berupa objek' }, { status: 400 });
    }

    const testCases = Array.isArray(body.testCases) ? (body.testCases as TestCase[]) : undefined;
    const customTemplate = body.customTemplate ? (body.customTemplate as { name: TemplateName; content: OLTTemplate }) : undefined;

    let result: TestSuiteResult;

    if (customTemplate) {
      // Validate custom template first
      const validation = validateTemplate(customTemplate.content, customTemplate.name);
      if (!validation.valid) {
        return NextResponse.json(
          { error: 'Custom template validation failed', details: validation.errors },
          { status: 400 }
        );
      }

      // Run tests against custom template
      const tests = testCases ?? DEFAULT_TEST_SUITE;
      result = { passed: true, totalTests: 0, passCount: 0, failCount: 0, results: [] };
      for (const tc of tests) {
        if (tc.templateName === customTemplate.name) {
          const r = runTestCase(tc, customTemplate.content);
          result.results.push(r);
          result.totalTests++;
          if (r.passed) result.passCount++;
          else result.failCount++;
        }
      }
      result.passed = result.failCount === 0;
    } else {
      result = runTestSuite(testCases);
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('[API /api/provisioning/templates/playground POST] Error:', error);
    return NextResponse.json({ error: 'Failed to run test suite' }, { status: 500 });
  }
}
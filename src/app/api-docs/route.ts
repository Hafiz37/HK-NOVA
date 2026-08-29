import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const { generateOpenApiSchemas } = await import('@/lib/openapi/schemas');
    const openApiDoc = generateOpenApiSchemas();

    return NextResponse.json(openApiDoc);
  } catch (error) {
    console.error('[API /api-docs] Error generating swagger spec:', error);
    return NextResponse.json({ error: 'Failed to generate swagger spec' }, { status: 500 });
  }
}
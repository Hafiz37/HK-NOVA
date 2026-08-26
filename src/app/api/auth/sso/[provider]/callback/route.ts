import { NextResponse } from 'next/server';
import { provisionUser, syncUserAttributes } from '@/lib/sso/provisioning';
import { handleSAMLResponse } from '@/lib/sso/saml';
import { handleOAuthCallback } from '@/lib/sso/oauth';

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await params;
    const url = new URL(req.url);
    const code = url.searchParams.get('code');

    // Mock callback handling based on code or saml assertion
    const payload = {
      externalId: code ? `ext_${code}` : `saml_user_123`,
      email: `sso_user_${code || '123'}@enterprise.com`,
      name: `SSO User ${code || '123'}`,
      groups: ['OPERATOR_GROUP'],
    };

    const ssoProfile = code 
      ? await handleOAuthCallback(provider, payload)
      : await handleSAMLResponse(provider, payload);

    const user = await provisionUser(ssoProfile, provider);
    await syncUserAttributes(user.id, ssoProfile, provider);

    return NextResponse.json({ ok: true, message: 'SSO Login Successful', user });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

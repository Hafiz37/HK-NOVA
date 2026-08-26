import { NextResponse } from 'next/server';
import { initiateSAMLLogin } from '@/lib/sso/saml';
import { initiateOAuthLogin } from '@/lib/sso/oauth';

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await params;
    
    // Check flow type by resolving provider or query string
    const url = new URL(req.url);
    const type = url.searchParams.get('type') || 'saml';

    if (type === 'oauth' || type === 'oidc') {
      const redirectUri = `${url.origin}/api/auth/sso/${provider}/callback`;
      const { authUrl } = await initiateOAuthLogin(provider, redirectUri);
      return NextResponse.redirect(authUrl);
    } else {
      const { redirectUrl } = await initiateSAMLLogin(provider);
      return NextResponse.redirect(redirectUrl);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

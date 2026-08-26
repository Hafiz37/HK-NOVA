import { prisma } from '@/lib/prisma';

/**
 * Initiate OAuth 2.0 / OIDC flow
 */
export async function initiateOAuthLogin(providerId: string, redirectUri: string) {
  const provider = await prisma.sSOProvider.findFirst({
    where: { id: providerId, type: { in: ['OAUTH2', 'OIDC'] }, enabled: true },
  });

  if (!provider || !provider.oauthAuthUrl || !provider.oauthClientId) {
    throw new Error('OAuth provider not found or misconfigured');
  }

  const state = Math.random().toString(36).substring(2, 15);
  const authUrl = `${provider.oauthAuthUrl}?response_type=code&client_id=${encodeURIComponent(
    provider.oauthClientId
  )}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=${encodeURIComponent(
    Array.isArray(provider.oauthScopes) ? (provider.oauthScopes as string[]).join(' ') : 'openid profile email'
  )}`;

  return { authUrl, state };
}

/**
 * Handle OAuth callback data payload
 */
export async function handleOAuthCallback(providerId: string, payload: { externalId: string; email: string; name?: string; groups?: string[] }) {
  const provider = await prisma.sSOProvider.findFirst({
    where: { id: providerId, type: { in: ['OAUTH2', 'OIDC'] }, enabled: true },
  });

  if (!provider) {
    throw new Error('OAuth Provider not active');
  }

  return {
    externalId: payload.externalId,
    email: payload.email,
    name: payload.name,
    groups: payload.groups || [],
    rawAttributes: payload,
  };
}

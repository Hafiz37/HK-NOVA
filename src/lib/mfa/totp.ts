import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const MFA_ISSUER = process.env.MFA_ISSUER || 'HK-Nova';

export interface TOTPSetupResult {
  secret: string;
  otpauthUrl: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export async function generateTOTPSecret(username: string): Promise<TOTPSetupResult> {
  const secret = speakeasy.generateSecret({
    name: `${MFA_ISSUER}:${username}`,
    issuer: MFA_ISSUER,
    length: 20,
  });

  const otpauthUrl = secret.otpauth_url || '';
  const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);
  const backupCodes = generateBackupCodes(10);

  return {
    secret: secret.base32,
    otpauthUrl,
    qrCodeUrl,
    backupCodes,
  };
}

export function verifyTOTPToken(secret: string, token: string): boolean {
  if (!secret || !token) return false;
  const cleanToken = token.trim().replace(/\s+/g, '');

  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token: cleanToken,
    window: 1, // Allow 30s drift before and after
  });
}

export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = randomBytes(4).toString('hex').toUpperCase();
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
}

export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((code) => bcrypt.hash(code.replace('-', ''), 10)));
}

export async function verifyAndConsumeBackupCode(
  hashedCodesJson: unknown,
  providedCode: string
): Promise<{ ok: boolean; remainingHashedCodes: string[] }> {
  if (!Array.isArray(hashedCodesJson) || !providedCode) {
    return { ok: false, remainingHashedCodes: [] };
  }

  const cleanProvided = providedCode.trim().replace('-', '').toUpperCase();
  const remaining: string[] = [];
  let found = false;

  for (const hashed of hashedCodesJson as string[]) {
    if (!found) {
      const match = await bcrypt.compare(cleanProvided, hashed);
      if (match) {
        found = true;
        continue;
      }
    }
    remaining.push(hashed);
  }

  return { ok: found, remainingHashedCodes: remaining };
}

import { UAParser } from 'ua-parser-js';
import { createHash } from 'crypto';
import { getClientIp, getGeoLocation, GeoLocationInfo } from '@/lib/audit';

export interface DeviceInfo {
  fingerprint: string;
  deviceName: string;
  deviceType: string;
  browser: string;
  os: string;
  ipAddress: string;
  location: GeoLocationInfo | null;
  userAgent: string;
}

export function generateDeviceFingerprint(request: Request): string {
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const acceptLang = request.headers.get('accept-language') || 'unknown';
  const acceptEnc = request.headers.get('accept-encoding') || 'unknown';
  const clientIp = getClientIp(request);

  const raw = `${userAgent}|${acceptLang}|${acceptEnc}|${clientIp.split('.').slice(0, 3).join('.')}`;
  return createHash('sha256').update(raw).digest('hex');
}

export async function parseDeviceInfo(request: Request): Promise<DeviceInfo> {
  const userAgentStr = request.headers.get('user-agent') || 'Unknown Agent';
  const parser = new UAParser(userAgentStr);
  const result = parser.getResult();

  const browserName = result.browser.name || 'Unknown Browser';
  const browserVer = result.browser.version ? ` ${result.browser.version.split('.')[0]}` : '';
  const osName = result.os.name || 'Unknown OS';
  const osVer = result.os.version ? ` ${result.os.version}` : '';

  const deviceType = result.device.type || 'desktop';
  const deviceName = `${browserName}${browserVer} on ${osName}${osVer}`;
  const fingerprint = generateDeviceFingerprint(request);
  const ipAddress = getClientIp(request);
  const location = await getGeoLocation(ipAddress);

  return {
    fingerprint,
    deviceName,
    deviceType,
    browser: `${browserName}${browserVer}`.trim(),
    os: `${osName}${osVer}`.trim(),
    ipAddress,
    location,
    userAgent: userAgentStr,
  };
}

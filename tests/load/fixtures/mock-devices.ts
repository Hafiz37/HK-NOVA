export interface MockDevice {
  id: string;
  name: string;
  ip: string;
  type: 'MIKROTIK' | 'CISCO' | 'HUAWEI' | 'JUNIPER';
  vendor: string;
  latency: number;
  reliability: number;
  region: string;
  credentials: {
    username: string;
    password: string;
    sshPort: number;
  };
}

export function generateMockDevices(count: number): MockDevice[] {
  const types: Array<'MIKROTIK' | 'CISCO' | 'HUAWEI' | 'JUNIPER'> = ['MIKROTIK', 'CISCO', 'HUAWEI', 'JUNIPER'];
  const regions = ['Jakarta', 'Surabaya', 'Bandung', 'Medan', 'Bali'];
  
  return Array.from({ length: count }, (_, i) => {
    const type = types[i % types.length];
    const region = regions[i % regions.length];
    
    return {
      id: `device-${String(i).padStart(4, '0')}`,
      name: `${type}-${region}-${String(i % 100).padStart(3, '0')}`,
      ip: `10.${Math.floor(i / 65536)}.${Math.floor((i % 65536) / 256)}.${(i % 256) + 1}`,
      type,
      vendor: type === 'MIKROTIK' ? 'MikroTik' : type === 'CISCO' ? 'Cisco Systems' : type === 'HUAWEI' ? 'Huawei' : 'Juniper Networks',
      latency: Math.random() * 100,
      reliability: 0.95 + Math.random() * 0.05,
      region,
      credentials: {
        username: 'admin',
        password: `test-password-${i}`,
        sshPort: 22,
      },
    };
  });
}

export function generateDeviceWithProfile(profile: 'fast' | 'normal' | 'slow' | 'unreliable'): MockDevice {
  const baseDevice = generateMockDevices(1)[0];
  
  switch (profile) {
    case 'fast':
      return { ...baseDevice, latency: 5 + Math.random() * 10, reliability: 0.99 };
    case 'normal':
      return { ...baseDevice, latency: 20 + Math.random() * 30, reliability: 0.97 };
    case 'slow':
      return { ...baseDevice, latency: 80 + Math.random() * 40, reliability: 0.90 };
    case 'unreliable':
      return { ...baseDevice, latency: 50 + Math.random() * 100, reliability: 0.70 + Math.random() * 0.15 };
    default:
      return baseDevice;
  }
}

export function getMockDevicePool(size: 'small' | 'medium' | 'large' | 'xlarge'): MockDevice[] {
  const sizes = {
    small: 50,
    medium: 200,
    large: 500,
    xlarge: 1000,
  };
  
  return generateMockDevices(sizes[size]);
}

export function getMixedProfileDevices(count: number): MockDevice[] {
  const devices: MockDevice[] = [];
  const profileDistribution = {
    fast: 0.2,
    normal: 0.5,
    slow: 0.2,
    unreliable: 0.1,
  };
  
  const profiles: Array<'fast' | 'normal' | 'slow' | 'unreliable'> = ['fast', 'normal', 'slow', 'unreliable'];
  
  for (let i = 0; i < count; i++) {
    const rand = Math.random();
    let cumulative = 0;
    let profile: 'fast' | 'normal' | 'slow' | 'unreliable' = 'normal';
    
    for (const p of profiles) {
      cumulative += profileDistribution[p];
      if (rand <= cumulative) {
        profile = p;
        break;
      }
    }
    
    const device = generateDeviceWithProfile(profile);
    device.id = `device-${String(i).padStart(4, '0')}`;
    devices.push(device);
  }
  
  return devices;
}

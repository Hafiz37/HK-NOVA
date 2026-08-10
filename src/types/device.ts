export interface Device {
  id: string;
  name: string;
  ip: string;
  type: DeviceType;
  vendor?: string;
  model?: string;
  location?: string;
  status: DeviceStatus;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type DeviceType = 'ROUTER' | 'SWITCH' | 'OLT' | 'ONT' | 'FIREWALL' | 'SERVER' | 'OTHER';
export type DeviceStatus = 'UP' | 'DOWN' | 'UNKNOWN' | 'MAINTENANCE';

export interface DeviceCredential {
  snmpVersion?: string;
  snmpCommunity?: string;
  snmpUser?: string;
  snmpAuthPass?: string;
  snmpPrivPass?: string;
  sshUsername?: string;
  sshPassword?: string;
  sshPort?: number;
}

export interface DeviceFormData {
  name: string;
  ip: string;
  type: DeviceType;
  vendor?: string;
  model?: string;
  location?: string;
  description?: string;
  credential?: DeviceCredential;
}

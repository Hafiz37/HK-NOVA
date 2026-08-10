export interface ProvisioningRequest {
  deviceId: string;
  action: ProvisioningAction;
  ontSerial?: string;
  ponPort?: string;
  vlan?: number;
  serviceProfile?: string;
  lineProfile?: string;
  tcontProfile?: string;
  ontType?: string;
  ontSlot?: string;
  servicePort?: string;
}

export type ProvisioningAction = 'CREATE' | 'SUSPEND' | 'REACTIVATE' | 'TERMINATE' | 'STATUS_CHECK';
export type ProvisioningStatus = 'SUCCESS' | 'FAILED' | 'PENDING';

export interface ProvisioningLog {
  id: string;
  deviceId: string;
  action: ProvisioningAction;
  ontSerial?: string;
  ponPort?: string;
  vlan?: number;
  serviceProfile?: string;
  command: string;
  response?: string;
  status: ProvisioningStatus;
  errorMessage?: string;
  executedAt: Date;
  executedBy?: string;
}

export interface OLTTemplate {
  [action: string]: {
    description: string;
    commands: string[];
  };
}

import { z } from 'zod';
import { ServiceType, CustomerStatus } from '@prisma/client';

export const createCustomerSchema = z.object({
  username: z.string()
    .min(3, 'Username minimal 3 karakter')
    .max(32, 'Username maksimal 32 karakter')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username hanya boleh huruf, angka, underscore, dan dash'),
  
  fullName: z.string()
    .min(3, 'Nama lengkap minimal 3 karakter')
    .max(100, 'Nama lengkap maksimal 100 karakter'),
  
  phoneNumber: z.string()
    .regex(/^(\+62|62|0)[0-9]{9,12}$/, 'Format nomor HP tidak valid')
    .optional()
    .nullable(),
  
  email: z.string()
    .email('Format email tidak valid')
    .optional()
    .nullable(),
  
  address: z.string()
    .max(500, 'Alamat maksimal 500 karakter')
    .optional()
    .nullable(),
  
  serviceType: z.enum([ServiceType.PPPOE, ServiceType.DHCP, ServiceType.STATIC, ServiceType.HOTSPOT]),
  
  ipAddress: z.string()
    .regex(/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/, 'Format IP address tidak valid')
    .optional()
    .nullable(),
  
  macAddress: z.string()
    .regex(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/, 'Format MAC address tidak valid (contoh: AA:BB:CC:DD:EE:FF)')
    .optional()
    .nullable(),
  
  uploadSpeed: z.number()
    .int('Upload speed harus berupa integer')
    .min(128, 'Upload speed minimal 128 kbps')
    .max(10000000, 'Upload speed maksimal 10 Gbps'),
  
  downloadSpeed: z.number()
    .int('Download speed harus berupa integer')
    .min(128, 'Download speed minimal 128 kbps')
    .max(10000000, 'Download speed maksimal 10 Gbps'),
  
  packageName: z.string()
    .min(3, 'Nama paket minimal 3 karakter')
    .max(50, 'Nama paket maksimal 50 karakter'),
  
  pppoePassword: z.string()
    .min(8, 'Password PPPoE minimal 8 karakter')
    .max(64, 'Password PPPoE maksimal 64 karakter')
    .optional()
    .nullable(),
  
  pppoeProfile: z.string()
    .max(50, 'Profile PPPoE maksimal 50 karakter')
    .optional()
    .nullable(),
  
  dhcpServer: z.string()
    .max(50, 'Nama DHCP server maksimal 50 karakter')
    .optional()
    .nullable(),
  
  activationDate: z.coerce.date(),
  
  expiryDate: z.coerce.date()
    .optional()
    .nullable(),
  
  billingCycle: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY'])
    .optional()
    .nullable(),
  
  monthlyFee: z.number()
    .min(0, 'Biaya bulanan harus positif')
    .max(100000000, 'Biaya bulanan terlalu besar')
    .optional()
    .nullable(),
  
  deviceId: z.string()
    .min(1, 'Device ID wajib diisi'),
  
  notes: z.string()
    .max(1000, 'Catatan maksimal 1000 karakter')
    .optional()
    .nullable(),
  
  dryRun: z.boolean()
    .optional()
    .default(false),
})
.refine((data) => {
  // Validasi: PPPoE harus ada password
  if (data.serviceType === ServiceType.PPPOE && !data.pppoePassword) {
    return false;
  }
  return true;
}, {
  message: 'PPPoE customer harus memiliki password',
  path: ['pppoePassword'],
})
.refine((data) => {
  // Validasi: DHCP harus ada IP dan MAC address
  if (data.serviceType === ServiceType.DHCP && (!data.ipAddress || !data.macAddress)) {
    return false;
  }
  return true;
}, {
  message: 'DHCP customer harus memiliki IP address dan MAC address',
  path: ['ipAddress'],
});

export const updateCustomerSchema = z.object({
  fullName: z.string()
    .min(3)
    .max(100)
    .optional(),
  
  phoneNumber: z.string()
    .regex(/^(\+62|62|0)[0-9]{9,12}$/)
    .optional()
    .nullable(),
  
  email: z.string()
    .email()
    .optional()
    .nullable(),
  
  address: z.string()
    .max(500)
    .optional()
    .nullable(),
  
  uploadSpeed: z.number()
    .int()
    .min(128)
    .max(10000000)
    .optional(),
  
  downloadSpeed: z.number()
    .int()
    .min(128)
    .max(10000000)
    .optional(),
  
  packageName: z.string()
    .min(3)
    .max(50)
    .optional(),
  
  pppoePassword: z.string()
    .min(8)
    .max(64)
    .optional()
    .nullable(),
  
  pppoeProfile: z.string()
    .max(50)
    .optional()
    .nullable(),
  
  expiryDate: z.coerce.date()
    .optional()
    .nullable(),
  
  billingCycle: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY'])
    .optional()
    .nullable(),
  
  monthlyFee: z.number()
    .min(0)
    .max(100000000)
    .optional()
    .nullable(),
  
  notes: z.string()
    .max(1000)
    .optional()
    .nullable(),
})
.refine((data) => Object.keys(data).length > 0, {
  message: 'Minimal satu field harus diisi untuk update',
});

export const queryCustomerSchema = z.object({
  search: z.string()
    .max(100)
    .optional(),
  
  status: z.enum([CustomerStatus.ACTIVE, CustomerStatus.SUSPENDED, CustomerStatus.TERMINATED, CustomerStatus.PENDING])
    .optional(),
  
  serviceType: z.enum([ServiceType.PPPOE, ServiceType.DHCP, ServiceType.STATIC, ServiceType.HOTSPOT])
    .optional(),
  
  deviceId: z.string()
    .optional(),
  
  isOnline: z.coerce.boolean()
    .optional(),
  
  page: z.coerce.number()
    .int()
    .min(1)
    .default(1),
  
  limit: z.coerce.number()
    .int()
    .min(1)
    .max(100)
    .default(50),
  
  sortBy: z.enum(['username', 'fullName', 'createdAt', 'activationDate', 'status'])
    .default('createdAt'),
  
  sortOrder: z.enum(['asc', 'desc'])
    .default('desc'),
});

export const customerActionSchema = z.object({
  reason: z.string()
    .min(3, 'Alasan minimal 3 karakter')
    .max(500, 'Alasan maksimal 500 karakter')
    .optional(),
  
  dryRun: z.boolean()
    .optional()
    .default(false),
});

export const updateBandwidthSchema = z.object({
  uploadSpeed: z.number()
    .int()
    .min(128)
    .max(10000000),
  
  downloadSpeed: z.number()
    .int()
    .min(128)
    .max(10000000),
  
  packageName: z.string()
    .min(3)
    .max(50)
    .optional(),
  
  dryRun: z.boolean()
    .optional()
    .default(false),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type QueryCustomerInput = z.infer<typeof queryCustomerSchema>;
export type CustomerActionInput = z.infer<typeof customerActionSchema>;
export type UpdateBandwidthInput = z.infer<typeof updateBandwidthSchema>;

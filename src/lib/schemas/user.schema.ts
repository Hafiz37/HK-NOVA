import { z } from 'zod';
import { UserRole } from '@prisma/client';

export const createUserSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50).regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscore, and hyphen'),
  email: z.string().email('Invalid email address').max(255),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain uppercase, lowercase, and number'),
  fullName: z.string().min(1, 'Full name is required').max(100),
  role: z.enum(['ADMIN', 'OPERATOR', 'VIEWER']),
});

export const updateUserSchema = z.object({
  email: z.string().email().max(255).optional(),
  fullName: z.string().min(1).max(100).optional(),
  role: z.enum(['ADMIN', 'OPERATOR', 'VIEWER']).optional(),
  password: z.string().min(8).max(128).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});

export const queryUserSchema = z.object({
  search: z.string().max(200).optional(),
  role: z.enum(['ADMIN', 'OPERATOR', 'VIEWER']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  sortBy: z.enum(['username', 'email', 'fullName', 'role', 'createdAt', 'lastLoginAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(128).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain uppercase, lowercase, and number'),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const resetPasswordSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  newPassword: z.string().min(8).max(128).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
});

export const bulkCreateUserSchema = z.object({
  users: z.array(createUserSchema).min(1).max(50),
});

export const bulkUpdateUserSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(50),
  data: updateUserSchema,
});

export const userIdSchema = z.object({
  id: z.string().min(1),
});

export const userProfileSchema = z.object({
  fullName: z.string().min(1).max(100).optional(),
  email: z.string().email().max(255).optional(),
});
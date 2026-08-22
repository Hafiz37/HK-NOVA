export enum ProvisioningErrorCode {
  DEVICE_NOT_FOUND = 'DEVICE_NOT_FOUND',
  TEMPLATE_NOT_FOUND = 'TEMPLATE_NOT_FOUND',
  ACTION_NOT_SUPPORTED = 'ACTION_NOT_SUPPORTED',
  MISSING_FIELDS = 'MISSING_FIELDS',
  INVALID_FIELD_VALUE = 'INVALID_FIELD_VALUE',
  SSH_CREDENTIALS_MISSING = 'SSH_CREDENTIALS_MISSING',
  SSH_CONNECTION_FAILED = 'SSH_CONNECTION_FAILED',
  SSH_COMMAND_TIMEOUT = 'SSH_COMMAND_TIMEOUT',
  SSH_EXECUTION_FAILED = 'SSH_EXECUTION_FAILED',
  FEATURE_FLAG_DISABLED = 'FEATURE_FLAG_DISABLED',
  ROLLBACK_NOT_SUPPORTED = 'ROLLBACK_NOT_SUPPORTED',
  ROLLBACK_MISSING_FIELDS = 'ROLLBACK_MISSING_FIELDS',
  ROLLBACK_EXECUTION_FAILED = 'ROLLBACK_EXECUTION_FAILED',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export interface ProvisioningError extends Error {
  code: ProvisioningErrorCode;
  details?: Record<string, unknown>;
  recoverable: boolean;
  userMessage: string;
}

export function createProvisioningError(
  code: ProvisioningErrorCode,
  message: string,
  options: { details?: Record<string, unknown>; recoverable?: boolean; userMessage?: string } = {}
): ProvisioningError {
  const error = new Error(message) as ProvisioningError;
  error.code = code;
  error.details = options.details;
  error.recoverable = options.recoverable ?? false;
  error.userMessage = options.userMessage ?? getDefaultUserMessage(code);
  return error;
}

function getDefaultUserMessage(code: ProvisioningErrorCode): string {
  const messages: Record<ProvisioningErrorCode, string> = {
    [ProvisioningErrorCode.DEVICE_NOT_FOUND]: 'Device OLT tidak ditemukan. Periksa kembali ID device.',
    [ProvisioningErrorCode.TEMPLATE_NOT_FOUND]: 'Template provisioning tidak ditemukan untuk vendor ini.',
    [ProvisioningErrorCode.ACTION_NOT_SUPPORTED]: 'Aksi yang diminta tidak didukung oleh template ini.',
    [ProvisioningErrorCode.MISSING_FIELDS]: 'Field wajib belum diisi. Silakan lengkapi form.',
    [ProvisioningErrorCode.INVALID_FIELD_VALUE]: 'Nilai field tidak valid. Periksa format input.',
    [ProvisioningErrorCode.SSH_CREDENTIALS_MISSING]: 'Kredensial SSH tidak dikonfigurasi untuk device ini.',
    [ProvisioningErrorCode.SSH_CONNECTION_FAILED]: 'Gagal terhubung ke device via SSH. Periksa jaringan dan kredensial.',
    [ProvisioningErrorCode.SSH_COMMAND_TIMEOUT]: 'Perintah SSH timeout. Device mungkin sibuk atau tidak merespons.',
    [ProvisioningErrorCode.SSH_EXECUTION_FAILED]: 'Eksekusi perintah gagal di device. Periksa log detail.',
    [ProvisioningErrorCode.FEATURE_FLAG_DISABLED]: 'Eksekusi provisioning dinonaktifkan oleh admin. Gunakan mode dry-run.',
    [ProvisioningErrorCode.ROLLBACK_NOT_SUPPORTED]: 'Aksi ini tidak memiliki rollback otomatis.',
    [ProvisioningErrorCode.ROLLBACK_MISSING_FIELDS]: 'Data untuk rollback tidak lengkap di log asli.',
    [ProvisioningErrorCode.ROLLBACK_EXECUTION_FAILED]: 'Rollback gagal dieksekusi. Periksa log detail.',
    [ProvisioningErrorCode.VALIDATION_ERROR]: 'Validasi template gagal. Hubungi admin.',
    [ProvisioningErrorCode.INTERNAL_ERROR]: 'Terjadi kesalahan internal. Silakan coba lagi atau hubungi admin.',
  };
  return messages[code] ?? messages[ProvisioningErrorCode.INTERNAL_ERROR];
}

export function mapErrorToCode(error: Error | unknown): ProvisioningError {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as Record<string, unknown>).code;
    if (typeof code === 'string' && code in ProvisioningErrorCode) {
      return error as ProvisioningError;
    }
  }

  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('Device not found')) {
    return createProvisioningError(ProvisioningErrorCode.DEVICE_NOT_FOUND, message);
  }
  if (message.includes('Action') && message.includes('tidak tersedia')) {
    return createProvisioningError(ProvisioningErrorCode.ACTION_NOT_SUPPORTED, message);
  }
  if (message.includes('Field wajib')) {
    return createProvisioningError(ProvisioningErrorCode.MISSING_FIELDS, message);
  }
  if (message.includes('vlan harus berupa angka')) {
    return createProvisioningError(ProvisioningErrorCode.INVALID_FIELD_VALUE, message);
  }
  if (message.includes('SSH credentials tidak dikonfigurasi')) {
    return createProvisioningError(ProvisioningErrorCode.SSH_CREDENTIALS_MISSING, message);
  }
  if (message.includes('SSH connection timeout') || message.includes('SSH connection failed')) {
    return createProvisioningError(ProvisioningErrorCode.SSH_CONNECTION_FAILED, message);
  }
  if (message.includes('SSH command timeout')) {
    return createProvisioningError(ProvisioningErrorCode.SSH_COMMAND_TIMEOUT, message);
  }
  if (message.includes('feature flag') || message.includes('disabled by feature flag')) {
    return createProvisioningError(ProvisioningErrorCode.FEATURE_FLAG_DISABLED, message);
  }
  if (message.includes('tidak memiliki rollback') || message.includes('rollback otomatis')) {
    return createProvisioningError(ProvisioningErrorCode.ROLLBACK_NOT_SUPPORTED, message);
  }
  if (message.includes('rollback tidak tersedia') || message.includes('Field wajib untuk rollback')) {
    return createProvisioningError(ProvisioningErrorCode.ROLLBACK_MISSING_FIELDS, message);
  }
  if (message.includes('Rollback gagal')) {
    return createProvisioningError(ProvisioningErrorCode.ROLLBACK_EXECUTION_FAILED, message);
  }
  if (message.includes('validasi') || message.includes('validation')) {
    return createProvisioningError(ProvisioningErrorCode.VALIDATION_ERROR, message);
  }

  return createProvisioningError(ProvisioningErrorCode.INTERNAL_ERROR, message);
}

export function getHttpStatusForError(code: ProvisioningErrorCode): number {
  const statusMap: Record<ProvisioningErrorCode, number> = {
    [ProvisioningErrorCode.DEVICE_NOT_FOUND]: 404,
    [ProvisioningErrorCode.TEMPLATE_NOT_FOUND]: 404,
    [ProvisioningErrorCode.ACTION_NOT_SUPPORTED]: 400,
    [ProvisioningErrorCode.MISSING_FIELDS]: 400,
    [ProvisioningErrorCode.INVALID_FIELD_VALUE]: 400,
    [ProvisioningErrorCode.SSH_CREDENTIALS_MISSING]: 400,
    [ProvisioningErrorCode.SSH_CONNECTION_FAILED]: 502,
    [ProvisioningErrorCode.SSH_COMMAND_TIMEOUT]: 504,
    [ProvisioningErrorCode.SSH_EXECUTION_FAILED]: 502,
    [ProvisioningErrorCode.FEATURE_FLAG_DISABLED]: 403,
    [ProvisioningErrorCode.ROLLBACK_NOT_SUPPORTED]: 400,
    [ProvisioningErrorCode.ROLLBACK_MISSING_FIELDS]: 400,
    [ProvisioningErrorCode.ROLLBACK_EXECUTION_FAILED]: 502,
    [ProvisioningErrorCode.VALIDATION_ERROR]: 400,
    [ProvisioningErrorCode.INTERNAL_ERROR]: 500,
  };
  return statusMap[code] ?? 500;
}
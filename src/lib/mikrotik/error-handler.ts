export enum MikroTikErrorType {
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  TIMEOUT = 'TIMEOUT',
  COMMAND_FAILED = 'COMMAND_FAILED',
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  INVALID_PARAMETER = 'INVALID_PARAMETER',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  UNKNOWN = 'UNKNOWN',
}

export interface MikroTikError {
  type: MikroTikErrorType;
  message: string;
  originalError?: any;
  command?: string;
  isTransient: boolean;
}

export function classifyMikroTikError(error: any, command?: string): MikroTikError {
  const errorMessage = error?.message || String(error);
  const lowerMessage = errorMessage.toLowerCase();

  if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
    return {
      type: MikroTikErrorType.TIMEOUT,
      message: 'Connection timeout',
      originalError: error,
      command,
      isTransient: true,
    };
  }

  if (lowerMessage.includes('econnrefused') || lowerMessage.includes('connect econnrefused')) {
    return {
      type: MikroTikErrorType.CONNECTION_FAILED,
      message: 'Connection refused - MikroTik may be offline or port blocked',
      originalError: error,
      command,
      isTransient: true,
    };
  }

  if (lowerMessage.includes('authentication') || lowerMessage.includes('login failed')) {
    return {
      type: MikroTikErrorType.AUTHENTICATION_FAILED,
      message: 'Authentication failed - check username/password',
      originalError: error,
      command,
      isTransient: false,
    };
  }

  if (lowerMessage.includes('not found') || lowerMessage.includes('no such')) {
    return {
      type: MikroTikErrorType.NOT_FOUND,
      message: 'Resource not found',
      originalError: error,
      command,
      isTransient: false,
    };
  }

  if (lowerMessage.includes('already exists') || lowerMessage.includes('duplicate')) {
    return {
      type: MikroTikErrorType.ALREADY_EXISTS,
      message: 'Resource already exists',
      originalError: error,
      command,
      isTransient: false,
    };
  }

  if (lowerMessage.includes('invalid') || lowerMessage.includes('bad parameter')) {
    return {
      type: MikroTikErrorType.INVALID_PARAMETER,
      message: 'Invalid parameter',
      originalError: error,
      command,
      isTransient: false,
    };
  }

  if (lowerMessage.includes('permission') || lowerMessage.includes('access denied')) {
    return {
      type: MikroTikErrorType.PERMISSION_DENIED,
      message: 'Permission denied',
      originalError: error,
      command,
      isTransient: false,
    };
  }

  if (lowerMessage.includes('ehostunreach') || lowerMessage.includes('enetunreach')) {
    return {
      type: MikroTikErrorType.CONNECTION_FAILED,
      message: 'Network unreachable',
      originalError: error,
      command,
      isTransient: true,
    };
  }

  return {
    type: MikroTikErrorType.UNKNOWN,
    message: errorMessage,
    originalError: error,
    command,
    isTransient: true,
  };
}

export function shouldRetryOperation(error: MikroTikError): boolean {
  return error.isTransient && (
    error.type === MikroTikErrorType.TIMEOUT ||
    error.type === MikroTikErrorType.CONNECTION_FAILED ||
    error.type === MikroTikErrorType.UNKNOWN
  );
}

export function getErrorMessage(error: MikroTikError): string {
  return `[${error.type}] ${error.message}${error.command ? ` (Command: ${error.command})` : ''}`;
}

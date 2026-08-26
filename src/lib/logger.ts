/**
 * Structured Logger Module for HK-NOVA
 *
 * Provides a standardized JSON/Pretty logger interface for API routes and background workers.
 * Includes correlation/context tracing capabilities.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  module?: string;
  worker?: string;
  requestId?: string;
  deviceId?: string;
  userId?: string;
  [key: string]: unknown;
}

class Logger {
  private levelPriority: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
  };

  private currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] >= this.levelPriority[this.currentLevel];
  }

  private formatEntry(level: LogLevel, message: string, context?: LogContext, error?: unknown) {
    const timestamp = new Date().toISOString();
    const isProd = process.env.NODE_ENV === 'production';

    const errorDetails = error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
    } : error ? { error } : undefined;

    const payload = {
      timestamp,
      level,
      message,
      ...(context || {}),
      ...(errorDetails || {}),
    };

    if (isProd) {
      return JSON.stringify(payload);
    }

    // Pretty formatting for development
    const moduleTag = context?.module ? `[${context.module}]` : context?.worker ? `[${context.worker}]` : '';
    const metaStr = Object.keys(context || {}).filter(k => k !== 'module' && k !== 'worker').length > 0
      ? ` ${JSON.stringify(context)}`
      : '';
    const errStr = errorDetails ? `\nError: ${errorDetails.message || JSON.stringify(errorDetails)}` : '';

    return `[${timestamp}] [${level.toUpperCase()}] ${moduleTag} ${message}${metaStr}${errStr}`;
  }

  debug(message: string, context?: LogContext): void {
    if (!this.shouldLog('debug')) return;
    console.debug(this.formatEntry('debug', message, context));
  }

  info(message: string, context?: LogContext): void {
    if (!this.shouldLog('info')) return;
    console.info(this.formatEntry('info', message, context));
  }

  warn(message: string, context?: LogContext, error?: unknown): void {
    if (!this.shouldLog('warn')) return;
    console.warn(this.formatEntry('warn', message, context, error));
  }

  error(message: string, context?: LogContext, error?: unknown): void {
    if (!this.shouldLog('error')) return;
    console.error(this.formatEntry('error', message, context, error));
  }

  child(defaultContext: LogContext) {
    return {
      debug: (msg: string, ctx?: LogContext) => this.debug(msg, { ...defaultContext, ...ctx }),
      info: (msg: string, ctx?: LogContext) => this.info(msg, { ...defaultContext, ...ctx }),
      warn: (msg: string, ctx?: LogContext, err?: unknown) => this.warn(msg, { ...defaultContext, ...ctx }, err),
      error: (msg: string, ctx?: LogContext, err?: unknown) => this.error(msg, { ...defaultContext, ...ctx }, err),
    };
  }
}

export const logger = new Logger();

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function format(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const base = `[DAM Worker] [${level.toUpperCase()}] ${timestamp} - ${message}`;
  if (!meta || Object.keys(meta).length === 0) return base;
  return `${base} ${JSON.stringify(meta)}`;
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>) {
    console.log(format('info', message, meta));
  },
  warn(message: string, meta?: Record<string, unknown>) {
    console.warn(format('warn', message, meta));
  },
  error(message: string, meta?: Record<string, unknown>) {
    console.error(format('error', message, meta));
  },
  debug(message: string, meta?: Record<string, unknown>) {
    if (process.env.WORKER_DEBUG === 'true') {
      console.debug(format('debug', message, meta));
    }
  },
};

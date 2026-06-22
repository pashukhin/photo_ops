import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

interface Env {
  WEB_ORIGIN?: string;
}

export function createCorsOptions(env: Env = process.env): CorsOptions {
  const allowedOrigins = new Set((env.WEB_ORIGIN ?? 'http://localhost:3000').split(',').map((origin) => origin.trim()).filter(Boolean));

  return {
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('origin not allowed'));
    }
  };
}

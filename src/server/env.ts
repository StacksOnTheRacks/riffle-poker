import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface RiffleEnv {
  hostApiKey: string;
  publicOrigin: string;
  listenPort: number;
  frameAncestors: string;
}

let cachedEnv: RiffleEnv | undefined;

export function loadEnv(overrides?: Partial<RiffleEnv>): RiffleEnv {
  if (cachedEnv && !overrides) {
    return cachedEnv;
  }

  const hostApiKey = overrides?.hostApiKey ?? process.env.RIFFLE_HOST_API_KEY ?? '';
  const publicOrigin = overrides?.publicOrigin ?? process.env.RIFFLE_PUBLIC_ORIGIN ?? '';
  const listenPort =
    overrides?.listenPort ??
    Number.parseInt(process.env.RIFFLE_LISTEN_PORT ?? '3000', 10);
  const frameAncestors =
    overrides?.frameAncestors ?? process.env.RIFFLE_FRAME_ANCESTORS ?? "'self'";

  if (!hostApiKey) {
    throw new Error('RIFFLE_HOST_API_KEY is required');
  }
  if (!publicOrigin) {
    throw new Error('RIFFLE_PUBLIC_ORIGIN is required');
  }
  if (!Number.isFinite(listenPort) || listenPort <= 0) {
    throw new Error('RIFFLE_LISTEN_PORT must be a positive integer');
  }

  const env: RiffleEnv = {
    hostApiKey,
    publicOrigin: publicOrigin.replace(/\/$/, ''),
    listenPort,
    frameAncestors,
  };

  if (!overrides) {
    cachedEnv = env;
  }

  return env;
}

export function resetEnvCache(): void {
  cachedEnv = undefined;
}

const moduleDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(moduleDir, '..', '..');

export function readPlayHtml(): string {
  return readFileSync(join(projectRoot, 'public', 'play.html'), 'utf8');
}

export function readPlayJs(): string {
  return readFileSync(join(projectRoot, 'public', 'play.js'), 'utf8');
}

export function readPlayCss(): string {
  return readFileSync(join(projectRoot, 'public', 'play.css'), 'utf8');
}

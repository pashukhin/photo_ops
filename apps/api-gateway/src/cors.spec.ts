import { describe, expect, it } from 'vitest';
import { createCorsOptions } from './cors';

function checkOrigin(origin: string | undefined, allowedOrigins = 'http://localhost:3000') {
  const options = createCorsOptions({ WEB_ORIGIN: allowedOrigins });
  return new Promise((resolve, reject) => {
    if (typeof options.origin !== 'function') {
      reject(new Error('expected origin function'));
      return;
    }
    options.origin(origin as string, (error, allowed) => (error ? reject(error) : resolve(allowed)));
  });
}

describe('createCorsOptions', () => {
  it('allows the configured web origin for credentialed requests', async () => {
    await expect(checkOrigin('http://localhost:3000')).resolves.toBe(true);
  });

  it('rejects unconfigured browser origins', async () => {
    await expect(checkOrigin('https://evil.example')).rejects.toThrow('origin not allowed');
  });

  it('allows non-browser requests without an origin header', async () => {
    await expect(checkOrigin(undefined)).resolves.toBe(true);
  });
});

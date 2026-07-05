import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports ok for publication-service', () => {
    expect(new HealthController().health()).toEqual({ status: 'ok', service: 'publication-service' });
  });
});

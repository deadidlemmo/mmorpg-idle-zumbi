import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { MetricsTokenGuard } from './metrics-token.guard';

function createContext(authorization?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization } }),
    }),
  };
}

describe('MetricsTokenGuard', () => {
  it('exige configuracao em producao', () => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'NODE_ENV' ? 'production' : undefined,
      ),
    };
    const guard = new MetricsTokenGuard(config as never);

    expect(() => guard.canActivate(createContext() as never)).toThrow(
      ServiceUnavailableException,
    );
  });

  it('rejeita token incorreto', () => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'METRICS_TOKEN' ? 'segredo-forte' : 'production',
      ),
    };
    const guard = new MetricsTokenGuard(config as never);

    expect(() =>
      guard.canActivate(createContext('Bearer incorreto') as never),
    ).toThrow(UnauthorizedException);
  });

  it('aceita bearer token correto', () => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'METRICS_TOKEN' ? 'segredo-forte' : 'production',
      ),
    };
    const guard = new MetricsTokenGuard(config as never);

    expect(
      guard.canActivate(createContext('Bearer segredo-forte') as never),
    ).toBe(true);
  });
});

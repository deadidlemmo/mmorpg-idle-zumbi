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
    const expectedToken = 'a'.repeat(64);
    const config = {
      get: jest.fn((key: string) =>
        key === 'METRICS_TOKEN' ? expectedToken : 'production',
      ),
    };
    const guard = new MetricsTokenGuard(config as never);

    expect(() =>
      guard.canActivate(createContext('Bearer incorreto') as never),
    ).toThrow(UnauthorizedException);
  });

  it('aceita bearer token correto', () => {
    const expectedToken = 'b'.repeat(64);
    const config = {
      get: jest.fn((key: string) =>
        key === 'METRICS_TOKEN' ? expectedToken : 'production',
      ),
    };
    const guard = new MetricsTokenGuard(config as never);

    expect(
      guard.canActivate(createContext(`Bearer ${expectedToken}`) as never),
    ).toBe(true);
  });

  it('rejeita token curto em producao', () => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'METRICS_TOKEN' ? 'curto' : 'production',
      ),
    };
    const guard = new MetricsTokenGuard(config as never);

    expect(() =>
      guard.canActivate(createContext('Bearer curto') as never),
    ).toThrow(ServiceUnavailableException);
  });
});

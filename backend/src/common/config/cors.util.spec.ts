import { buildAllowedCorsOrigins, isCorsOriginAllowed } from './cors.util';

describe('CORS policy', () => {
  it('aceita origens configuradas e normaliza caminhos', () => {
    const allowedOrigins = buildAllowedCorsOrigins({
      nodeEnv: 'production',
      frontendUrl: 'https://game.example.com/reset-password',
      configuredOrigins: 'https://admin.example.com',
    });

    expect(allowedOrigins).toEqual(
      new Set(['https://game.example.com', 'https://admin.example.com']),
    );
  });

  it('bloqueia tuneis genericos em producao', () => {
    expect(
      isCorsOriginAllowed({
        origin: 'https://attacker.trycloudflare.com',
        allowedOrigins: new Set(['https://game.example.com']),
        allowDevelopmentTunnels: false,
      }),
    ).toBe(false);
  });

  it('mantem localhost e tuneis disponiveis no desenvolvimento', () => {
    const allowedOrigins = buildAllowedCorsOrigins({ nodeEnv: 'development' });

    expect(
      isCorsOriginAllowed({
        origin: 'http://localhost:5173',
        allowedOrigins,
        allowDevelopmentTunnels: true,
      }),
    ).toBe(true);
    expect(
      isCorsOriginAllowed({
        origin: 'https://preview.trycloudflare.com',
        allowedOrigins,
        allowDevelopmentTunnels: true,
      }),
    ).toBe(true);
  });
});

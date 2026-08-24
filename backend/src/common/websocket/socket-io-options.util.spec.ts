import { ConfigService } from '@nestjs/config';
import type { IncomingMessage } from 'node:http';
import { applySocketIoSecurityOptions } from './socket-io-options.util';

describe('Socket.IO security options', () => {
  function createRequest(origin?: string) {
    return { headers: { origin } } as IncomingMessage;
  }

  it('aceita apenas a origem configurada em producao', () => {
    const config = new ConfigService({
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://game.example.com',
    });
    const options = applySocketIoSecurityOptions(config);
    const allowRequest = options.allowRequest!;
    const allowedCallback = jest.fn();
    const blockedCallback = jest.fn();

    allowRequest(createRequest('https://game.example.com'), allowedCallback);
    allowRequest(
      createRequest('https://attacker.example.com'),
      blockedCallback,
    );

    expect(allowedCallback).toHaveBeenCalledWith(null, true);
    expect(blockedCallback).toHaveBeenCalledWith(expect.any(String), false);
  });

  it('preserva uma validacao adicional de handshake', () => {
    const originalAllowRequest = jest.fn(
      (
        _request: IncomingMessage,
        callback: (error: string | null | undefined, success: boolean) => void,
      ) => {
        callback('Bloqueado pela regra adicional.', false);
      },
    );
    const options = applySocketIoSecurityOptions(
      new ConfigService({ NODE_ENV: 'development' }),
      { allowRequest: originalAllowRequest },
    );
    const callback = jest.fn();

    options.allowRequest!(createRequest('http://localhost:5173'), callback);

    expect(originalAllowRequest).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(
      'Bloqueado pela regra adicional.',
      false,
    );
  });

  it('habilita compressao e preserva configuracoes explicitas', () => {
    const defaults = applySocketIoSecurityOptions(
      new ConfigService({ NODE_ENV: 'development' }),
    );
    const overridden = applySocketIoSecurityOptions(
      new ConfigService({ NODE_ENV: 'development' }),
      {
        perMessageDeflate: false,
        httpCompression: false,
      },
    );

    expect(defaults.perMessageDeflate).toEqual({ threshold: 1_024 });
    expect(defaults.httpCompression).toBe(true);
    expect(overridden.perMessageDeflate).toBe(false);
    expect(overridden.httpCompression).toBe(false);
  });
});

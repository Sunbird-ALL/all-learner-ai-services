import * as http from 'node:http';
import * as https from 'node:https';
import { EventEmitter } from 'node:events';
import * as jose from 'jose';
import {
  getEncryptionKey,
  getSigningKey,
  postJson,
  checkTokenStatus,
} from './authHelper';

jest.mock('jose', () => ({
  base64url: {
    decode: jest.fn(),
  },
  jwtDecrypt: jest.fn(),
  jwtVerify: jest.fn(),
}));

function mockHttpRequest(
  module: typeof http | typeof https,
  responsePayload?: any,
  error?: Error,
) {
  const mockReq = Object.assign(new EventEmitter(), {
    write: jest.fn(),
    end: jest.fn(),
  });
  const mockRes = new EventEmitter();

  const spy = jest
    .spyOn(module, 'request')
    .mockImplementation((_url: any, _options: any, callback?: any) => {
      if (error) {
        setTimeout(() => mockReq.emit('error', error), 5);
      } else {
        if (callback) callback(mockRes);
        setTimeout(() => {
          if (responsePayload !== undefined) {
            mockRes.emit(
              'data',
              typeof responsePayload === 'string'
                ? responsePayload
                : JSON.stringify(responsePayload),
            );
          }
          mockRes.emit('end');
        }, 5);
      }
      return mockReq as any;
    });

  return { spy, mockReq, mockRes };
}

describe('authHelper', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getEncryptionKey', () => {
    it('should decode base64url if JOSE_ENCRYPTION_PRIVATE_KEY is set', () => {
      process.env.JOSE_ENCRYPTION_PRIVATE_KEY = 'base64-encoded-key';
      const mockDecoded = new Uint8Array([1, 2, 3]);
      (jose.base64url.decode as jest.Mock).mockReturnValue(mockDecoded);

      const result = getEncryptionKey();
      expect(jose.base64url.decode).toHaveBeenCalledWith('base64-encoded-key');
      expect(result).toBe(mockDecoded);
    });

    it('should fallback to sha256 hash of JOSE_SECRET if JOSE_ENCRYPTION_PRIVATE_KEY is not set', () => {
      delete process.env.JOSE_ENCRYPTION_PRIVATE_KEY;
      process.env.JOSE_SECRET = 'my-secret';

      const result = getEncryptionKey();
      expect(result).toBeInstanceOf(Buffer);
      expect(result).toHaveLength(32);
    });

    it('should handle empty JOSE_SECRET fallback when neither is set', () => {
      delete process.env.JOSE_ENCRYPTION_PRIVATE_KEY;
      delete process.env.JOSE_SECRET;

      const result = getEncryptionKey();
      expect(result).toBeInstanceOf(Buffer);
      expect(result).toHaveLength(32);
    });
  });

  describe('getSigningKey', () => {
    it('should encode JOSE_SIGNIN_PRIVATE_KEY into Uint8Array', () => {
      process.env.JOSE_SIGNIN_PRIVATE_KEY = 'secret-signin-key';
      const result = getSigningKey();
      expect(result).toEqual(new TextEncoder().encode('secret-signin-key'));
    });

    it('should handle missing JOSE_SIGNIN_PRIVATE_KEY', () => {
      delete process.env.JOSE_SIGNIN_PRIVATE_KEY;
      const result = getSigningKey();
      expect(result).toEqual(new TextEncoder().encode(''));
    });
  });

  describe('postJson', () => {
    it('should perform http POST request and resolve parsed response', async () => {
      const { spy, mockReq } = mockHttpRequest(http, { success: true });
      const result = await postJson('http://example.com/api', { foo: 'bar' });
      expect(result).toEqual({ success: true });
      expect(mockReq.write).toHaveBeenCalled();
      expect(mockReq.end).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('should use https module when url protocol is https', async () => {
      const { spy } = mockHttpRequest(https, { success: true });
      const result = await postJson('https://example.com/api', { foo: 'bar' });
      expect(result).toEqual({ success: true });
      spy.mockRestore();
    });

    it('should reject when response is invalid JSON', async () => {
      const { spy } = mockHttpRequest(http, 'invalid-json');
      await expect(
        postJson('http://example.com/api', { foo: 'bar' }),
      ).rejects.toThrow();
      spy.mockRestore();
    });

    it('should reject on request network error', async () => {
      const { spy } = mockHttpRequest(
        http,
        undefined,
        new Error('Connection refused'),
      );
      await expect(
        postJson('http://example.com/api', { foo: 'bar' }),
      ).rejects.toThrow('Connection refused');
      spy.mockRestore();
    });

    it('should reject on invalid URL string', async () => {
      await expect(postJson('not-a-valid-url', {})).rejects.toThrow();
    });
  });

  describe('checkTokenStatus', () => {
    it('should return isActive true when orchestration service returns result.isActive = true', async () => {
      process.env.ALL_ORC_SERVICE_URL =
        'http://points-lesson-tracking:3009/api/virtualId/tokenStatus';
      delete process.env.AXL_LOGIN_SERVICE_URL;

      const { spy } = mockHttpRequest(http, { result: { isActive: true } });
      const result = await checkTokenStatus('12345', 'mock-token');
      expect(result).toEqual({ isActive: true });
      spy.mockRestore();
    });

    it('should return isActive true when orchestration service returns data.result.isActive = true', async () => {
      process.env.ALL_ORC_SERVICE_URL =
        'http://points-lesson-tracking:3009/api/virtualId/tokenStatus';

      const { spy } = mockHttpRequest(http, {
        data: { result: { isActive: true } },
      });
      const result = await checkTokenStatus('12345', 'mock-token');
      expect(result).toEqual({ isActive: true });
      spy.mockRestore();
    });

    it('should return isActive true when login service returns matching token', async () => {
      delete process.env.ALL_ORC_SERVICE_URL;
      process.env.AXL_LOGIN_SERVICE_URL = 'http://axl-login-service:8000';

      const { spy } = mockHttpRequest(http, {
        responseObj: {
          responseDataParams: {
            data: {
              token: 'target-token',
            },
          },
        },
      });
      const result = await checkTokenStatus('12345', 'target-token');
      expect(result).toEqual({ isActive: true });
      spy.mockRestore();
    });

    it('should return isActive false when login service returns mismatched token', async () => {
      delete process.env.ALL_ORC_SERVICE_URL;
      process.env.AXL_LOGIN_SERVICE_URL = 'http://axl-login-service:8000';

      const { spy } = mockHttpRequest(http, {
        data: {
          token: 'target-token',
        },
      });
      const result = await checkTokenStatus('12345', 'different-token');
      expect(result).toEqual({ isActive: false });
      spy.mockRestore();
    });

    it('should fallback gracefully to login service if orchestration service throws error', async () => {
      process.env.ALL_ORC_SERVICE_URL =
        'http://points-lesson-tracking:3009/api/virtualId/tokenStatus';
      process.env.AXL_LOGIN_SERVICE_URL = 'http://axl-login-service:8000';

      let callCount = 0;
      const requestSpy = jest
        .spyOn(http, 'request')
        .mockImplementation((_url: any, _options: any, callback?: any) => {
          callCount++;
          const mockReq = Object.assign(new EventEmitter(), {
            write: jest.fn(),
            end: jest.fn(),
          });
          const mockRes = new EventEmitter();

          if (callCount === 1) {
            setTimeout(() => {
              mockReq.emit('error', new Error('Orc network error'));
            }, 5);
          } else {
            if (callback) callback(mockRes);
            setTimeout(() => {
              mockRes.emit(
                'data',
                JSON.stringify({
                  token: 'my-token',
                }),
              );
              mockRes.emit('end');
            }, 5);
          }
          return mockReq as any;
        });

      const result = await checkTokenStatus('12345', 'my-token');
      expect(result).toEqual({ isActive: true });
      requestSpy.mockRestore();
    });

    it('should return isActive false if both services are unavailable or fail', async () => {
      process.env.ALL_ORC_SERVICE_URL =
        'http://points-lesson-tracking:3009/api/virtualId/tokenStatus';
      process.env.AXL_LOGIN_SERVICE_URL = 'http://axl-login-service:8000';

      const { spy } = mockHttpRequest(
        http,
        undefined,
        new Error('Network error'),
      );
      const result = await checkTokenStatus('12345', 'my-token');
      expect(result).toEqual({ isActive: false });
      spy.mockRestore();
    });

    it('should return isActive false if no URLs are configured', async () => {
      delete process.env.ALL_ORC_SERVICE_URL;
      delete process.env.AXL_LOGIN_SERVICE_URL;

      const result = await checkTokenStatus('12345', 'my-token');
      expect(result).toEqual({ isActive: false });
    });
  });
});

import * as http from 'node:http';
import * as https from 'node:https';
import { EventEmitter } from 'node:events';
import * as jose from 'jose';
import {
  getEncryptionKey,
  getSigningKey,
  postJson,
  checkTokenStatus,
  AuthServiceUnavailableError,
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
  statusCode = 200,
) {
  const mockReq = Object.assign(new EventEmitter(), {
    write: jest.fn(),
    end: jest.fn(),
  });
  const mockRes: any = new EventEmitter();
  mockRes.statusCode = statusCode;

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
      ).rejects.toThrow(AuthServiceUnavailableError);
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
      ).rejects.toThrow(AuthServiceUnavailableError);
      spy.mockRestore();
    });

    it('should reject on invalid URL string', async () => {
      await expect(postJson('not-a-valid-url', {})).rejects.toThrow(
        AuthServiceUnavailableError,
      );
    });

    it('should reject on a non-2xx status code without inspecting the body', async () => {
      const { spy } = mockHttpRequest(http, { message: 'not found' }, undefined, 404);
      await expect(
        postJson('http://example.com/api', { foo: 'bar' }),
      ).rejects.toThrow(AuthServiceUnavailableError);
      spy.mockRestore();
    });
  });

  describe('checkTokenStatus', () => {
    it('should return true when axl-login-service reports isActive via responseObj shape', async () => {
      process.env.AXL_LOGIN_SERVICE_URL = 'http://axl-login-service:8000/api/v1/virtualId/tokenStatus';

      const { spy } = mockHttpRequest(http, {
        result: 'Success',
        responseObj: { responseDataParams: { data: { isActive: true } } },
      });
      const result = await checkTokenStatus('12345', 'mock-token');
      expect(result).toBe(true);
      spy.mockRestore();
    });

    it('should return true when axl-login-service reports isActive via flat data shape', async () => {
      process.env.AXL_LOGIN_SERVICE_URL = 'http://axl-login-service:8000/api/v1/virtualId/tokenStatus';

      const { spy } = mockHttpRequest(http, { data: { isActive: true } });
      const result = await checkTokenStatus('12345', 'mock-token');
      expect(result).toBe(true);
      spy.mockRestore();
    });

    it('should return false when axl-login-service reports isActive: false', async () => {
      process.env.AXL_LOGIN_SERVICE_URL = 'http://axl-login-service:8000/api/v1/virtualId/tokenStatus';

      const { spy } = mockHttpRequest(http, { isActive: false });
      const result = await checkTokenStatus('12345', 'mock-token');
      expect(result).toBe(false);
      spy.mockRestore();
    });

    it('should return false when the response has no isActive field at all', async () => {
      process.env.AXL_LOGIN_SERVICE_URL = 'http://axl-login-service:8000/api/v1/virtualId/tokenStatus';

      const { spy } = mockHttpRequest(http, { token: 'unrelated' });
      const result = await checkTokenStatus('12345', 'mock-token');
      expect(result).toBe(false);
      spy.mockRestore();
    });

    it('should throw AuthServiceUnavailableError when the auth service is unreachable, not fall back to isActive:false', async () => {
      process.env.AXL_LOGIN_SERVICE_URL = 'http://axl-login-service:8000/api/v1/virtualId/tokenStatus';

      const { spy } = mockHttpRequest(
        http,
        undefined,
        new Error('Network error'),
      );
      await expect(checkTokenStatus('12345', 'my-token')).rejects.toThrow(
        AuthServiceUnavailableError,
      );
      spy.mockRestore();
    });

    it('should throw AuthServiceUnavailableError when AXL_LOGIN_SERVICE_URL is not configured', async () => {
      delete process.env.AXL_LOGIN_SERVICE_URL;

      await expect(checkTokenStatus('12345', 'my-token')).rejects.toThrow(
        AuthServiceUnavailableError,
      );
    });
  });
});

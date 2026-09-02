import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import * as jose from 'jose';
import { JwtAuthGuard } from './auth.guard';
import * as authHelper from '../common/authHelper';

jest.mock('jose');
jest.mock('../common/authHelper');

const mockJose = jose as jest.Mocked<typeof jose>;
const mockAuthHelper = authHelper as jest.Mocked<typeof authHelper>;

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let jwtService: jest.Mocked<JwtService>;
  let reflector: jest.Mocked<Reflector>;
  let mockRequest: any;
  let mockContext: ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      headers: {
        authorization: 'Bearer valid-token',
      },
      user: undefined,
    };

    mockContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(mockRequest),
      }),
      getHandler: jest.fn().mockReturnValue({}),
      getClass: jest.fn().mockReturnValue({}),
    } as unknown as ExecutionContext;

    mockAuthHelper.getEncryptionKey.mockReturnValue(new Uint8Array(32));
    mockAuthHelper.getSigningKey.mockReturnValue(new Uint8Array(32));
    mockAuthHelper.checkTokenStatus.mockResolvedValue({ isActive: true });

    jwtService = {
      sign: jest.fn(),
      verify: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;

    reflector = {
      get: jest.fn().mockReturnValue(false),
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as jest.Mocked<Reflector>;

    guard = new JwtAuthGuard(jwtService, reflector);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('canActivate', () => {
    it('should bypass authentication if route is marked as public via getAllAndOverride', async () => {
      reflector.getAllAndOverride.mockReturnValue(true);

      const result = await guard.canActivate(mockContext);
      expect(result).toBe(true);
    });

    it('should bypass authentication if route is marked as public via get fallback', async () => {
      (reflector as any).getAllAndOverride = undefined;
      reflector.get.mockReturnValue(true);

      const result = await guard.canActivate(mockContext);
      expect(result).toBe(true);
    });

    it.each([
      {
        scenario: 'string virtualId',
        verifiedPayload: {
          virtualId: 'user-123',
          exp: Math.floor(Date.now() / 1000) + 3600,
          email: 'test@example.com',
        },
        expectedId: 'user-123',
      },
      {
        scenario: 'numeric virtualId',
        verifiedPayload: {
          virtualId: 1271333057,
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        expectedId: 1271333057,
      },
    ])(
      'should successfully authenticate a valid token with $scenario',
      async ({ verifiedPayload, expectedId }) => {
        mockJose.jwtDecrypt.mockResolvedValue({
          payload: { jwtSignedToken: 'signed-jwt-token' },
        } as any);
        mockJose.jwtVerify.mockResolvedValue({
          payload: verifiedPayload,
        } as any);
        mockAuthHelper.checkTokenStatus.mockResolvedValue({ isActive: true });

        const result = await guard.canActivate(mockContext);

        expect(result).toBe(true);
        expect((mockRequest as any).user).toEqual({
          ...verifiedPayload,
          virtualId: expectedId,
          virtual_id: expectedId,
        });
      },
    );

    it('should throw UnauthorizedException when authorization header is missing', async () => {
      const requestWithoutAuth = {
        headers: {},
      };
      const contextWithoutAuth = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(requestWithoutAuth),
        }),
        getHandler: jest.fn().mockReturnValue({}),
        getClass: jest.fn().mockReturnValue({}),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(contextWithoutAuth)).rejects.toThrow(
        new UnauthorizedException('Authorization header missing'),
      );
    });

    it('should throw UnauthorizedException when authorization header format is not Bearer <token>', async () => {
      const requestWithInvalidFormat = {
        headers: {
          authorization: 'Basic valid-token',
        },
      };
      const contextWithInvalidFormat = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(requestWithInvalidFormat),
        }),
        getHandler: jest.fn().mockReturnValue({}),
        getClass: jest.fn().mockReturnValue({}),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(contextWithInvalidFormat)).rejects.toThrow(
        new UnauthorizedException('Invalid authorization header format'),
      );
    });

    it('should throw UnauthorizedException when token decryption fails', async () => {
      mockJose.jwtDecrypt.mockRejectedValue(new Error('Decryption failed'));

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        new UnauthorizedException('Invalid or expired token'),
      );
    });

    it('should throw UnauthorizedException when jwtSignedToken is missing in payload', async () => {
      const mockDecryptedToken = {
        payload: {},
      };

      mockJose.jwtDecrypt.mockResolvedValue(mockDecryptedToken as any);

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        new UnauthorizedException(
          'jwtSignedToken not found in decrypted payload',
        ),
      );
    });

    it('should throw UnauthorizedException when JWT verification fails', async () => {
      const mockDecryptedToken = {
        payload: {
          jwtSignedToken: 'signed-jwt-token',
        },
      };

      mockJose.jwtDecrypt.mockResolvedValue(mockDecryptedToken as any);
      mockJose.jwtVerify.mockRejectedValue(new Error('Verification failed'));

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        new UnauthorizedException('Invalid or expired token'),
      );
    });

    it('should throw UnauthorizedException when token is expired', async () => {
      const mockDecryptedToken = {
        payload: {
          jwtSignedToken: 'signed-jwt-token',
        },
      };

      const mockVerifiedToken = {
        payload: {
          virtualId: 'user-123',
          exp: Math.floor(Date.now() / 1000) - 100,
        },
      };

      mockJose.jwtDecrypt.mockResolvedValue(mockDecryptedToken as any);
      mockJose.jwtVerify.mockResolvedValue(mockVerifiedToken as any);

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        new UnauthorizedException('Token expired'),
      );
    });

    it('should throw UnauthorizedException when virtual_id is missing', async () => {
      const mockDecryptedToken = {
        payload: {
          jwtSignedToken: 'signed-jwt-token',
        },
      };

      const mockVerifiedToken = {
        payload: {
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      };

      mockJose.jwtDecrypt.mockResolvedValue(mockDecryptedToken as any);
      mockJose.jwtVerify.mockResolvedValue(mockVerifiedToken as any);

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        new UnauthorizedException('Missing virtual_id in token payload'),
      );
    });

    it('should throw UnauthorizedException when user is logged out (tokenStatus.isActive is false)', async () => {
      const mockDecryptedToken = {
        payload: {
          jwtSignedToken: 'signed-jwt-token',
        },
      };

      const mockVerifiedToken = {
        payload: {
          virtualId: 'user-123',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      };

      mockJose.jwtDecrypt.mockResolvedValue(mockDecryptedToken as any);
      mockJose.jwtVerify.mockResolvedValue(mockVerifiedToken as any);
      mockAuthHelper.checkTokenStatus.mockResolvedValue({ isActive: false });

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        new UnauthorizedException('User is logged out'),
      );
    });
  });

  describe('checkTokenStatus delegation', () => {
    it('should delegate checkTokenStatus call to authHelper.checkTokenStatus', async () => {
      mockAuthHelper.checkTokenStatus.mockResolvedValue({ isActive: true });

      const result = await guard.checkTokenStatus('user-123', 'mock-token');

      expect(result).toEqual({ isActive: true });
      expect(mockAuthHelper.checkTokenStatus).toHaveBeenCalledWith(
        'user-123',
        'mock-token',
      );
    });
  });

  describe('edge cases', () => {
    it('should handle empty authorization header', async () => {
      const requestWithEmptyAuth = {
        headers: {
          authorization: '',
        },
      };
      const contextWithEmptyAuth = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(requestWithEmptyAuth),
        }),
        getHandler: jest.fn().mockReturnValue({}),
        getClass: jest.fn().mockReturnValue({}),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(contextWithEmptyAuth)).rejects.toThrow(
        new UnauthorizedException('Authorization header missing'),
      );
    });

    it('should handle authorization header with single token string without Bearer prefix', async () => {
      const requestWithSingleToken = {
        headers: {
          authorization: 'some-token',
        },
      };
      const contextWithSingleToken = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(requestWithSingleToken),
        }),
        getHandler: jest.fn().mockReturnValue({}),
        getClass: jest.fn().mockReturnValue({}),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(contextWithSingleToken)).rejects.toThrow(
        new UnauthorizedException('Invalid authorization header format'),
      );
    });
  });
});

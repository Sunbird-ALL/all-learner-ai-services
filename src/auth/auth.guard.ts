import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import * as jose from 'jose';
import {
  checkTokenStatus as checkTokenStatusHelper,
  getEncryptionKey,
  getSigningKey,
} from '../common/authHelper';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector?: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check for public routes
    if (this.reflector) {
      const isPublic =
        typeof this.reflector.getAllAndOverride === 'function'
          ? this.reflector.getAllAndOverride<boolean>('isPublic', [
              context.getHandler(),
              context.getClass(),
            ])
          : this.reflector.get<boolean>('isPublic', context.getHandler());

      if (isPublic) {
        return true;
      }
    }

    const request = context.switchToHttp().getRequest<Request>();
    const authHeader =
      request.headers?.authorization || (request.headers as any)?.Authorization;
    if (!authHeader) {
      throw new UnauthorizedException('Authorization header missing');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
      throw new UnauthorizedException('Invalid authorization header format');
    }
    const token = parts[1];

    try {
      // Step 1: Decrypt outer JWE token using shared encryption key
      const encryptionKey = getEncryptionKey();
      const jwtDecryptedToken = await jose.jwtDecrypt(token, encryptionKey);

      if (!jwtDecryptedToken.payload?.jwtSignedToken) {
        throw new UnauthorizedException(
          'jwtSignedToken not found in decrypted payload',
        );
      }

      // Step 2: Verify inner JWS signature
      const signinKey = getSigningKey();
      const jwtSignedToken = String(jwtDecryptedToken.payload.jwtSignedToken);
      const verifiedToken = await jose.jwtVerify(jwtSignedToken, signinKey);

      // Step 3: Validate expiration and virtual_id
      const { exp, virtualId } = verifiedToken.payload;

      if (!exp || exp <= Math.floor(Date.now() / 1000)) {
        throw new UnauthorizedException('Token expired');
      }

      if (
        !virtualId ||
        (typeof virtualId !== 'string' && typeof virtualId !== 'number')
      ) {
        throw new UnauthorizedException('Missing virtual_id in token payload');
      }

      // Step 4: Verify active token status
      const tokenStatus = await this.checkTokenStatus(virtualId, token);
      if (!tokenStatus.isActive) {
        throw new UnauthorizedException('User is logged out');
      }

      // Step 5: Attach user data to request
      (request as any).user = {
        ...verifiedToken.payload,
        virtualId,
        virtual_id: virtualId,
      };

      return true;
    } catch (err: any) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  // Check token status
  async checkTokenStatus(
    userId: string | number,
    token: string,
  ): Promise<{ isActive: boolean }> {
    return checkTokenStatusHelper(userId, token);
  }
}

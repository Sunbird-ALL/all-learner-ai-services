import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import axios from 'axios';
import { createHash } from 'crypto';
import { Request } from 'express';
import * as jose from 'jose';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedException('Authorization header missing');
    }
    const token = authHeader.split(' ')[1];
    try {
    
      //Step 1: Correctly Generate Encryption Key
      const secret_key = process.env.JOSE_SECRET || '';
      const hash = createHash('sha256').update(secret_key).digest();

      //Step 2: Decrypt the Token
      const jwtDecryptedToken = await jose.jwtDecrypt(token, hash);

      if (!jwtDecryptedToken.payload.jwtSignedToken) {
        throw new Error('jwtSignedToken not found in decrypted payload');
      }

      //Step 3: Verify the Signed JWT
      const jwtSignedToken = String(jwtDecryptedToken.payload.jwtSignedToken);

      //Fix Signing Key
      const jwtSigninKey = new TextEncoder().encode(
        process.env.JWT_SIGNIN_PRIVATE_KEY,
      );
      const verifiedToken = await jose.jwtVerify(jwtSignedToken, jwtSigninKey);

      // get the token status
      console.log(`[Auth Guard] Checking token status for virtual_id: ${verifiedToken.payload.virtual_id}`);
      const tokenStatus = await this.checkTokenStatus(verifiedToken.payload.virtual_id);
      console.log(`[Auth Guard] Token status result:`, { hasToken: tokenStatus.token !== null, tokenMatch: tokenStatus.token === token });
      if (tokenStatus.token == null || tokenStatus.token !== token) {
        console.warn(`[Auth Guard] Token validation failed for virtual_id: ${verifiedToken.payload.virtual_id}`);
        throw new UnauthorizedException('User is logged out');
      }

      //Step 4: Attach User Data to Request
      (request as any).user = verifiedToken.payload;

      return true;
    } catch (err) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  // check user status
  async checkTokenStatus(user_id: any): Promise<{ token: string }> {
    const url = process.env.ALL_ORC_SERVICE_URL;
    console.log(`[Token Status] Starting request`, { user_id, url, timestamp: new Date().toISOString() });
    const startTime = Date.now();
    
    try {
      const response = await axios.post(url, {
        user_id: user_id,
      });

      const duration = Date.now() - startTime;
      console.log(`[Token Status] Request successful`, { user_id, duration: `${duration}ms`, statusCode: response.status });
      
      return {
        token: response.data?.result?.token || null,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`[Token Status] Error after ${duration}ms:`, {
        user_id,
        errorCode: error.code,
        errorMessage: error.message,
        statusCode: error.response?.status,
        responseData: error.response?.data
      });
      return {
        token: null,
      };
    }
  }
}

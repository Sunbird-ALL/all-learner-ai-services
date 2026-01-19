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
    console.log("token-----", token);
    try {
    
      //Step 1: Correctly Generate Encryption Key
      const secret_key = process.env.JOSE_SECRET || '';
      console.log("secret_key-----", secret_key);
      console.log("process.env.JWT_SIGNIN_PRIVATE_KEY----", process.env.JWT_SIGNIN_PRIVATE_KEY);
      const hash = createHash('sha256').update(secret_key).digest();

      //Step 2: Decrypt the Token
      const jwtDecryptedToken = await jose.jwtDecrypt(token, hash);

      if (!jwtDecryptedToken.payload.jwtSignedToken) {
        throw new Error('jwtSignedToken not found in decrypted payload');
      }

      //Step 3: Verify the Signed JWT
      const jwtSignedToken = String(jwtDecryptedToken.payload.jwtSignedToken);
      console.log("jwtSignedToken-----", jwtSignedToken);

      //Fix Signing Key
      const jwtSigninKey = new TextEncoder().encode(
        process.env.JWT_SIGNIN_PRIVATE_KEY,
      );
      const verifiedToken = await jose.jwtVerify(jwtSignedToken, jwtSigninKey);

      // get the token status
      console.log(`[Auth Guard] Checking token status for virtual_id: ${verifiedToken.payload.virtual_id}`);
      const tokenStatus = await this.checkTokenStatus(verifiedToken.payload.virtual_id);
      console.log(`[Auth Guard] Token status result:`, { hasToken: tokenStatus.token !== null, tokenMatch: tokenStatus.token === token, serviceAvailable: tokenStatus.serviceAvailable });
      
      // If service is unavailable (timeout/connection error), allow request since JWT is already verified
      if (!tokenStatus.serviceAvailable) {
        console.warn(`[Auth Guard] ORC service unavailable, allowing request based on JWT verification for virtual_id: ${verifiedToken.payload.virtual_id}`);
        // Continue - allow request since JWT token is valid
      } else if (tokenStatus.token == null || tokenStatus.token !== token) {
        // Service is available but token doesn't match - user is logged out
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
  async checkTokenStatus(user_id: any): Promise<{ token: string | null; serviceAvailable: boolean }> {
    const url = process.env.ALL_ORC_SERVICE_URL;
    console.log(`[Token Status] Starting request`, { user_id, url, timestamp: new Date().toISOString() });
    const startTime = Date.now();
    
    try {
      const response = await axios.post(
        url,
        { user_id: user_id },
        {
          timeout: 10000, // 5 second timeout to prevent hanging requests
        }
      );

      const duration = Date.now() - startTime;
      const orcToken = response.data?.result?.token || null;
      console.log(`[Token Status] Request successful`, { user_id, duration: `${duration}ms`, statusCode: response.status, orcToken });
      
      // Service is available and responded
      return {
        token: orcToken,
        serviceAvailable: true,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const isServiceUnavailable = 
        error.code === 'ECONNABORTED' || 
        error.code === 'ETIMEDOUT' || 
        error.code === 'ECONNREFUSED' || 
        error.code === 'ENOTFOUND' || 
        error.code === 'EAI_AGAIN';
      
      console.error(`[Token Status] Error after ${duration}ms:`, {
        user_id,
        errorCode: error.code,
        errorMessage: error.message,
        statusCode: error.response?.status,
        responseData: error.response?.data,
        isServiceUnavailable
      });
      
      // If service is unavailable (timeout/connection error), return serviceAvailable: false
      // If service responded with HTTP error (like 404), service is available but user might be logged out
      return {
        token: null,
        serviceAvailable: !isServiceUnavailable, // false if timeout/connection error, true if HTTP error
      };
    }
  }
}

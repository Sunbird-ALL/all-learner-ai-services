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
      const tokenStatus = await this.checkTokenStatus(verifiedToken.payload.virtual_id);
      if (!tokenStatus.isLoggedIn) {
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
  async checkTokenStatus(user_id: any): Promise<{ isLoggedIn: boolean }> {
    try {
      const url = process.env.ALL_ORC_SERVICE_URL;
      const response = await axios.post(url, {
        user_id: user_id,
      });

      return {
        isLoggedIn: response.data?.result?.isLoggedIn ?? false
      };
    } catch (error: any) {
      console.error('Error calling token-status API:', error?.response?.data || error.message);
      return {
        isLoggedIn: false,
      };
    }
  }
}

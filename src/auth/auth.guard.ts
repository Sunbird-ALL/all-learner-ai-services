import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { Request } from 'express';
import * as jose from 'jose';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {

    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedException('Authorization header missing');
    }
    const token = authHeader.split(' ')[1];
    try {
      // **Step 1: Correctly Generate Encryption Key (Hash)**
      const secret_key = process.env.JOSE_SECRET || '';
      const hash = createHash('sha256').update(secret_key).digest();
  
      // **Step 2: Decrypt the Token**
      const jwtDecryptedToken = await jose.jwtDecrypt(token, hash);
      
      // **Ensure jwtSignedToken Exists in Decrypted Payload**
      if (!jwtDecryptedToken.payload.jwtSignedToken) {
        throw new Error("jwtSignedToken not found in decrypted payload");
      }

      // **Step 3: Verify the Signed JWT**
      const jwtSignedToken = String(jwtDecryptedToken.payload.jwtSignedToken);
    
      // **Fix Signing Key (Ensure Proper Decoding)**
      const jwtSigninKey = new TextEncoder().encode(process.env.JWT_SIGNIN_PRIVATE_KEY);
      const verifiedToken = await jose.jwtVerify(jwtSignedToken, jwtSigninKey);
      
      // **Step 4: Attach User Data to Request**
      (request as any).user = verifiedToken.payload;

      return true;
    } catch (err) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
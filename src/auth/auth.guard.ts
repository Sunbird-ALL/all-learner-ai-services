import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { Request } from 'express';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {

    const { jwtDecrypt, jwtVerify } = await import('jose'); 
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authorization token missing or invalid');
    }

    const token = authHeader.split(' ')[1];

    try {
      // 🔹 Step 1: Generate Hash Key for Decryption
      const secret_key = process.env.JOSE_SECRET || '';
      const hash = createHash('sha256').update(secret_key).digest();

      // 🔹 Step 2: Decrypt the Outer Token
      const jwtDecryptedToken = await jwtDecrypt(token, hash);

      if (!jwtDecryptedToken.payload.jwtSignedToken) {
        throw new UnauthorizedException("Token not found");
      }

      // 🔹 Step 3: Verify the Inner Signed JWT
      const jwtSignedToken = String(jwtDecryptedToken.payload.jwtSignedToken);
      const jwtSigninKey = new TextEncoder().encode(process.env.JWT_SIGNIN_PRIVATE_KEY);
      const verifiedToken = await jwtVerify(jwtSignedToken, jwtSigninKey);

      if (!verifiedToken.payload) {
        throw new UnauthorizedException('Invalid token payload');
      }

      // 🔹 Step 4: Attach User Data to Request
      (request as any).user = verifiedToken.payload;

      return true;
    } catch (err) {
      console.error('JWT Verification Error:', err.message);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}

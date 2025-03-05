import { Module } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtAuthGuard } from './auth.guard';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JOSE_SECRET
    }),
  ],
  providers: [JwtAuthGuard,JwtService],
  exports: [JwtAuthGuard, JwtService],
})
export class AuthModule {}
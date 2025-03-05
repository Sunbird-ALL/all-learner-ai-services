import { Injectable, NestInterceptor, ExecutionContext, CallHandler, UnauthorizedException } from '@nestjs/common';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from 'src/auth/auth.guard';


@Injectable()
export class VersionedAuthInterceptor implements NestInterceptor {
  constructor(private jwtAuthGuard: JwtAuthGuard) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    // 🔹 Extract API version from URL
    const version = request.url.split('/')[1]; 
    request.version = version;
  
    if (version === 'v2') {
      // 🔹 Apply `JwtAuthGuard` only for v2
      const canActivate = await this.jwtAuthGuard.canActivate(context);
      if (!canActivate) {
        throw new UnauthorizedException('Invalid or missing token');
      }
    }

    return next.handle();
  }
}

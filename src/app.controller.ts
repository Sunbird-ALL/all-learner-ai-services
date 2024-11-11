import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiExcludeEndpoint } from '@nestjs/swagger';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @ApiExcludeEndpoint(true)
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

   // Health check endpoint
   @Get('/ping')
   checkHealth(): { status: boolean; message: string } {
     return {
       status: true,
       message: 'Learner Ai Service App is working',
     };
   }
}

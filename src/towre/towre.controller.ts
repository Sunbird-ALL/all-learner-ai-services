// src/towre/towre.controller.ts
import { Body, Controller, HttpStatus, Post, Res, UseGuards } from '@nestjs/common';
import { TowreService } from './towre.service';
import { CreateTowreDto } from './dto/towre.dto';
import { Towre } from '../schemas/towre.schema';
import { JwtAuthGuard } from 'src/auth/auth.guard';
import { FastifyReply } from 'fastify';


@UseGuards(JwtAuthGuard)
@Controller('/api/towre')

export class TowreController {
  constructor(private readonly towreService: TowreService) {}

  @Post('/addRecord')
  async addTowreRecord(@Res() response: FastifyReply, @Body() dto: CreateTowreDto) {
    try {
      const savedRecord = await this.towreService.createTowre(dto);
      return response.status(HttpStatus.CREATED).send({
        status: 'success',
        message: 'Towre record created successfully',
        data: savedRecord,
      });
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: 'error',
        message: 'Server error - ' + err.message,
      });
    }
  }
}


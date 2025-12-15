// src/towre/towre.controller.ts
import {
  Body,
  Controller,
  Delete,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiExcludeEndpoint,
  ApiForbiddenResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TowreService } from './towre.service';
import { CreateTowreDto } from './dto/towre.dto';
import { Towre } from '../schemas/towre.schema';
import { JwtAuthGuard } from 'src/auth/auth.guard';
import { FastifyReply, FastifyRequest } from 'fastify';

@UseGuards(JwtAuthGuard)
@ApiTags('towre')
@Controller('/api/towre')
export class TowreController {
  constructor(private readonly towreService: TowreService) {}

  @Post('/addRecord')
  @ApiOperation({ summary: 'Add a new TOWRE record' })
  @ApiBody({
    description: 'Payload for creating a TOWRE record',
    type: CreateTowreDto,
  })
  @ApiResponse({
    status: 201,
    description: 'TOWRE record created successfully',
    schema: {
      example: {
        status: 'success',
        message: 'Towre record created successfully',
        data: {
          towre_result: [
            {
              title: 'good',
              isCorrect: true,
            },
            {
              title: 'very',
              isCorrect: true,
            },
            {
              title: 'is',
              isCorrect: true,
            },
            {
              title: 'attempt',
              isCorrect: true,
            },
            {
              title: 'start',
              isCorrect: true,
            },
            {
              title: 'we',
              isCorrect: true,
            },
            {
              title: 'when',
              isCorrect: true,
            },
            {
              title: 'Now',
              isCorrect: true,
            },
          ],
          audio_file_path: '/audio/user123.wav',
          session_id: 'sess456',
          isDeleted: false,
          language: 'en',
          _id: '685a58aac9bce43089855549',
          createdAt: '2025-06-24T07:50:02.485Z',
          updatedAt: '2025-06-24T07:50:02.485Z',
          __v: 0,
        },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
    schema: {
      example: {
        status: 'error',
        message: 'Server error - <error message>',
      },
    },
  })
  async addTowreRecord(
    @Req() request: FastifyRequest,
    @Res() response: FastifyReply,
    @Body() dto: CreateTowreDto,
  ) {
    try {
      const user_id = (request as any).user.virtual_id.toString();
      const savedRecord = await this.towreService.createTowre(user_id, dto);
      const { user_id: _, ...responsedata } = savedRecord.toObject();
      return response.status(HttpStatus.CREATED).send({
        status: 'success',
        message: 'Towre record created successfully',
        data: responsedata,
      });
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: 'error',
        message: 'Server error - ' + err.message,
      });
    }
  }

  @Delete('/delete/:id')
  async softDeleteTowre(
    @Res() response: FastifyReply,
    @Param('id') id: string,
  ) {
    try {
      const result = await this.towreService.softDeleteById(id);
      if (!result) {
        return response.status(HttpStatus.NOT_FOUND).send({
          status: 'error',
          message: 'Record not found',
        });
      }
      return response.status(HttpStatus.OK).send({
        status: 'success',
        message: 'Record soft-deleted successfully',
        data: result,
      });
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: 'error',
        message: 'Server error - ' + err.message,
      });
    }
  }
}

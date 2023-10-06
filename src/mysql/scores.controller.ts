import { Controller, Get, Post, Body, Patch, Param, Delete, HttpStatus, Res } from '@nestjs/common';
import { ScoresService } from './scores.service';
import { CreateScoreDto } from './dto/create-score.dto';
import { UpdateScoreDto } from './dto/update-score.dto';
import { FastifyReply } from 'fastify';

@Controller('scores')
export class ScoresController {
  constructor(
    private readonly scoresService: ScoresService
  ) { }

  @Post()
  create(@Res() response: FastifyReply, @Body() createScoreDto: CreateScoreDto) {
    const databaseType = process.env.DATABASE;

    try {
      let data = this.scoresService.create(createScoreDto);
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({ status: 'success mysql', data })
    } catch {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: "error",
        message: "Server error - " + `Invalid database type: ${databaseType}`
      });
    }
  }

  @Get()
  findAll() {
    return this.scoresService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.scoresService.findOne(+id);
  }

  @Get('/byuser/:id')
  findByUser(@Param('id') id: string) {
    return this.scoresService.findByUser(id);
  }

  @Get('/bysession/:id')
  findBySession(@Param('id') id: string) {
    return this.scoresService.findBySession(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateScoreDto: UpdateScoreDto) {
    return this.scoresService.update(+id, updateScoreDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.scoresService.remove(+id);
  }
}

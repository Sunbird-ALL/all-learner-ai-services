import { Injectable } from '@nestjs/common';
import { CreateScoreDto } from './dto/create-score.dto';
import { UpdateScoreDto } from './dto/update-score.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Score } from './entities/score.entity';

@Injectable()
export class ScoresService {
  constructor(
    @InjectRepository(Score)
    private readonly ScoreRepository: Repository<Score>
  ) { }


  async create(ScoreDto: CreateScoreDto): Promise<Score> {
    const Score = this.ScoreRepository.create(ScoreDto);
    return await this.ScoreRepository.save(Score);
  }

  findAll() {
    const scoreData = this.ScoreRepository.find();
    return scoreData;
  }

  findOne(id: number) {
    return `This action returns a #${id} score`;
  }

  findByUser(id: string) {
    const scoreData = this.ScoreRepository.find({ where: { user_id: id } });
    return scoreData;
  }

  findBySession(id: string) {
    const scoreData = this.ScoreRepository.find({ where: { session_id: id } });
    return scoreData;
  }

  update(id: number, updateScoreDto: UpdateScoreDto) {
    return `This action updates a #${id} score`;
  }

  remove(id: number) {
    return `This action removes a #${id} score`;
  }
}

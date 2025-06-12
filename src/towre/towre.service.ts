// src/towre/towre.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Towre, TowreDocument } from '../schemas/towre.schema';
import { CreateTowreDto } from './dto/towre.dto';

@Injectable()
export class TowreService {
  constructor(
    @InjectModel(Towre.name) private towreModel: Model<TowreDocument>,
  ) {}

  async createTowre(data: CreateTowreDto): Promise<Towre> {
    const created = new this.towreModel(data);
    return created.save();
  }
}

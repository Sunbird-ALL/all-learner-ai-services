import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLearnerProfileDto {
  @ApiProperty()
  original_text: string;

  output: OutputDTO[];

  @ApiProperty({
    type: 'string',
    format: 'base64',
  })
  audio: Buffer;

  @ApiProperty()
  user_id: string;

  @ApiProperty()
  session_id: string;

  @ApiProperty()
  sub_session_id: string;

  @ApiPropertyOptional()
  is_correct_choice?: string;

  @ApiProperty()
  contentType: string;

  @ApiProperty()
  contentId: string;

  @ApiProperty()
  language: string;

  @ApiProperty()
  hallucination_alternative: string[];

  @ApiPropertyOptional()
  correctness?: CorrectnessDto[];

  @ApiProperty()
  date: Date;

  @ApiPropertyOptional()
  mechanics_id: string;
}

export class OutputDTO {
  @ApiProperty()
  source: string;

  @ApiProperty()
  nBestTokens: NBestTokenDTO[];
}

export class NBestTokenDTO {
  @ApiProperty()
  word: string;

  @ApiProperty()
  tokens: TokenDTO[];
}

export class TokenDTO {
  [key: string]: number;
}

export class CorrectnessDto {
  @ApiPropertyOptional()
  '50%'?: string[];
}
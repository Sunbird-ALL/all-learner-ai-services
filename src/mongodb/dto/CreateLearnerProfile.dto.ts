import { ApiProperty } from '@nestjs/swagger';

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
  response_text: string;

  @ApiProperty()
  mode: string;

  @ApiProperty()
  pause_count: number;

  @ApiProperty()
  read_duration: number;

  @ApiProperty()
  practice_duration: number;

  @ApiProperty()
  retry_count: number;

  @ApiProperty()
  user_id: string;

  @ApiProperty()
  session_id: string;

  @ApiProperty()
  sub_session_id: string;

  @ApiProperty()
  contentType: string;

  @ApiProperty()
  contentId: string;

  @ApiProperty()
  language: string;

  @ApiProperty()
  date: Date;
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

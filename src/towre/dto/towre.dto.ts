import { IsString, IsOptional, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTowreDto {

  @ApiProperty({
    description: 'Path to the audio file',
    example: 'audio/abc123.wav',
  })
  @IsString()
  audio_file_path: string;

  @ApiProperty({
    description: 'Unique identifier for the session',
    example: 'session_2025_001',
  })
  @IsString()
  session_id: string;

  @ApiPropertyOptional({
    description: 'Milestone level of the user',
    example: 'm1',
  })
  @IsOptional()
  @IsString()
  milestone_level?: string;

  @ApiProperty({
    description: 'Result object for TOWRE evaluation',
    example: [
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
    ],
    type: 'object',
  })
  @IsObject()
  towre_result: Record<string, any>;
}

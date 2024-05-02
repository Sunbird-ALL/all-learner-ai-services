import { ApiProperty } from '@nestjs/swagger';

export class AssessmentInputDto {
  @ApiProperty()
  user_id: string;

  @ApiProperty()
  session_id: string;

  @ApiProperty()
  token: string;

  @ApiProperty()
  feedback: number;
}

import { ApiProperty } from '@nestjs/swagger';

export class CreateLearnerProfileDto {
    @ApiProperty()
    original_text: string;

    output: OutputDTO[];

    @ApiProperty({
        type: 'string', format: 'base64'
    })
    audio: Buffer;

    @ApiProperty()
    user_id: string;

    @ApiProperty()
    session_id: string;

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

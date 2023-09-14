export class CreateScoreDto {
    taskType: string;
    original_text: string;
    output: OutputDTO[];
    config: any; // You can specify a more specific type if needed
    user_id: string;
    session_id: string;
    language: string;
    date: Date;
}

export class OutputDTO {
    source: string;
    nBestTokens: NBestTokenDTO[];
}

export class NBestTokenDTO {
    word: string;
    tokens: TokenDTO[];
}

export class TokenDTO {
    [key: string]: number;
}

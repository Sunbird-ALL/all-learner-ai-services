export class CreateScoreDto {
    user_id: string;
    session_id: string;
    score_id: number;
    token: string;
    hexcode: string;
    confidence_score: number;
    identification_status: number;
}

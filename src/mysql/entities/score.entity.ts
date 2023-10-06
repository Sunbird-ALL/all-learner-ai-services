import { Entity, Column, PrimaryColumn, CreateDateColumn, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Score {
    @Column({ length: 255 })
    user_id: string;

    @Column({ length: 255 })
    session_id: string;

    @PrimaryGeneratedColumn()
    score_id: number;

    @Column({ length: 64 })
    token: string;

    @Column({ length: 64 })
    hexcode: string;

    @Column('float')
    confidence_score: number;

    @Column('float')
    identification_status: number;

    @CreateDateColumn()
    timestamp: Date;
}

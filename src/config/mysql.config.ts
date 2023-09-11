import { Score } from '../mysql/entities/score.entity'

export default {
    type: "mysql",
    host: 'localhost',
    port: 3310,
    username: 'root',
    password: '',
    database: 'lais_db',
    synchronize: true,
    entities: [Score],
};

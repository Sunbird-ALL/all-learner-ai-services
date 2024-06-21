import exp from 'constants';
import { Score } from '../mysql/entities/score.entity';

const mySql_config = {
  type: 'mysql',
  host: 'localhost',
  port: 3310,
  username: 'root',
  password: '',
  database: 'lais_db',
  synchronize: true,
  entities: [Score],
};

export default mySql_config;

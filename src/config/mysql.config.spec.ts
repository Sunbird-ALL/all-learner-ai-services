
import { Score } from '../mysql/entities/score.entity';
import mySql_config from './mysql.config';

describe('Database Configuration', () => {
  it('should have the correct type', () => {
    expect(mySql_config.type).toBe('mysql');
  });

  it('should have the correct host', () => {
    expect(mySql_config.host).toBe('localhost');
  });

  it('should have the correct port', () => {
    expect(mySql_config.port).toBe(3310);
  });

  it('should have the correct username', () => {
    expect(mySql_config.username).toBe('root');
  });

  it('should have the correct password', () => {
    expect(mySql_config.password).toBe('');
  });

  it('should have the correct database name', () => {
    expect(mySql_config.database).toBe('lais_db');
  });

  it('should have synchronize set to true', () => {
    expect(mySql_config.synchronize).toBe(true);
  });

  it('should have the correct entities', () => {
    expect(mySql_config.entities).toEqual([Score]);
  });
});

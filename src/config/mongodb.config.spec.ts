describe('Mongo Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should export the correct MongoDB URI from the environment variable', () => {
    const testUri = 'mongodb://localhost:27017/lais_db';
    process.env.MONGO_URL = testUri;

    // Re-import the config to ensure it picks up the new environment variable
    const config = require('./mongodb.config').default;

    expect(config.uri).toBe(testUri);
  });
});

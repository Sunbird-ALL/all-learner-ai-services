import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from './cache.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

describe('CacheService', () => {
  let service: CacheService;
  let cacheManager: Cache;

  beforeEach(async () => {
    const cacheManagerMock = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        {
          provide: CACHE_MANAGER,
          useValue: cacheManagerMock,
        },
      ],
    }).compile();

    service = module.get<CacheService>(CacheService);
    cacheManager = module.get<Cache>(CACHE_MANAGER);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('get', () => {
    it('should return the value for a given key', async () => {
      const key = 'test-key';
      const value = 'test-value';
      jest.spyOn(cacheManager, 'get').mockResolvedValue(value);

      const result = await service.get(key);

      expect(cacheManager.get).toHaveBeenCalledWith(key);
      expect(result).toBe(value);
    });
  });

  describe('set', () => {
    it('should set the value with a given key and ttl', async () => {
      const key = 'test-key';
      const value = 'test-value';
      const ttl = 1000;

      await service.set(key, value, ttl);

      expect(cacheManager.set).toHaveBeenCalledWith(key, value, ttl);
    });
  });

  describe('del', () => {
    it('should delete the value for a given key', async () => {
      const key = 'test-key';

      await service.del(key);

      expect(cacheManager.del).toHaveBeenCalledWith(key);
    });
  });
});

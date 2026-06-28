/**
 * 缓存模块导出
 */

export { default as CacheManager, getCacheManager, resetCacheManager } from './CacheManager';
export { CacheConfigPanel } from './CacheConfigPanel';
export {
  useCacheQuery,
  useCacheMutation,
  useCacheInvalidation,
  useCacheStats,
  useCacheEntries,
  useCacheConfig,
} from './useCacheQuery';
export * from './types';

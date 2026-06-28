/**
 * 缓存查询 Hooks
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getCacheManager } from './CacheManager';
import type {
  CacheQueryOptions,
  CacheMutationOptions,
  CacheStats,
  CacheEntry,
} from './types';

/**
 * 缓存查询 Hook
 */
export function useCacheQuery<T = any>(options: CacheQueryOptions) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [isFetching, setIsFetching] = useState(false);
  const cacheManager = getCacheManager();
  const abortControllerRef = useRef<AbortController>();

  const fetchData = useCallback(
    async (forceRefetch = false) => {
      if (!options.enabled) return;

      setIsFetching(true);

      // 检查缓存
      if (!forceRefetch) {
        const cached = cacheManager.get<T>(options.key);
        if (cached !== undefined) {
          setData(cached);
          setIsLoading(false);
          setIsFetching(false);
          options.onCacheHit?.(cached);

          // 后台重新验证
          if (options.revalidateInBackground) {
            fetchFromSource(true);
          }
          return;
        }
        options.onCacheMiss?.();
      }

      // 从源获取
      await fetchFromSource(false);
    },
    [options, cacheManager]
  );

  const fetchFromSource = async (isBackground: boolean) => {
    if (!isBackground) {
      setIsLoading(true);
      setError(undefined);
    }

    // 取消之前的请求
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    try {
      const result = await options.fetcher();
      setData(result);
      setError(undefined);

      // 保存到缓存
      cacheManager.set(options.key, result, {
        ttl: options.ttl,
        tags: options.tags,
        persistent: options.persistent,
      });
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err);
      }
    } finally {
      setIsLoading(false);
      setIsFetching(false);
    }
  };

  const refetch = useCallback(() => {
    return fetchData(true);
  }, [fetchData]);

  const invalidate = useCallback(() => {
    cacheManager.delete(options.key);
    return fetchData(true);
  }, [cacheManager, options.key, fetchData]);

  useEffect(() => {
    fetchData();

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [fetchData]);

  return {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
    invalidate,
  };
}

/**
 * 缓存修改 Hook
 */
export function useCacheMutation<T = any, V = any>(
  options: Omit<CacheMutationOptions, 'mutator'>
) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [data, setData] = useState<T | undefined>(undefined);
  const cacheManager = getCacheManager();

  const mutate = useCallback(
    async (mutator: () => Promise<T>, variables?: V) => {
      setIsLoading(true);
      setError(undefined);

      // 乐观更新
      if (options.optimistic && options.optimisticData) {
        setData(options.optimisticData);
        options.invalidateKeys?.forEach((key) => {
          cacheManager.set(key, options.optimisticData);
        });
      }

      try {
        const result = await mutator();
        setData(result);

        // 失效相关缓存
        if (options.invalidateKeys) {
          options.invalidateKeys.forEach((key) => cacheManager.delete(key));
        }
        if (options.invalidateTags) {
          cacheManager.invalidateByTags(options.invalidateTags);
        }

        options.onSuccess?.(result);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);

        // 回滚乐观更新
        if (options.optimistic && options.invalidateKeys) {
          options.invalidateKeys.forEach((key) => cacheManager.delete(key));
        }

        options.onError?.(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [cacheManager, options]
  );

  const reset = useCallback(() => {
    setData(undefined);
    setError(undefined);
    setIsLoading(false);
  }, []);

  return {
    mutate,
    data,
    isLoading,
    error,
    reset,
  };
}

/**
 * 缓存失效 Hook
 */
export function useCacheInvalidation() {
  const cacheManager = getCacheManager();

  const invalidateKey = useCallback(
    (key: string) => {
      cacheManager.delete(key);
    },
    [cacheManager]
  );

  const invalidateKeys = useCallback(
    (keys: string[]) => {
      keys.forEach((key) => cacheManager.delete(key));
    },
    [cacheManager]
  );

  const invalidateByTags = useCallback(
    (tags: string[]) => {
      return cacheManager.invalidateByTags(tags);
    },
    [cacheManager]
  );

  const invalidateByPrefix = useCallback(
    (prefix: string) => {
      return cacheManager.invalidateByPrefix(prefix);
    },
    [cacheManager]
  );

  const clearAll = useCallback(() => {
    cacheManager.clear();
  }, [cacheManager]);

  return {
    invalidateKey,
    invalidateKeys,
    invalidateByTags,
    invalidateByPrefix,
    clearAll,
  };
}

/**
 * 缓存统计 Hook
 */
export function useCacheStats() {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const cacheManager = getCacheManager();

  const refresh = useCallback(() => {
    setStats(cacheManager.getStats());
  }, [cacheManager]);

  const reset = useCallback(() => {
    cacheManager.resetStats();
    refresh();
  }, [cacheManager, refresh]);

  useEffect(() => {
    refresh();

    // 监听缓存事件以更新统计
    const unsubscribe = cacheManager.addListener(() => {
      refresh();
    });

    return unsubscribe;
  }, [cacheManager, refresh]);

  return {
    stats,
    refresh,
    reset,
  };
}

/**
 * 缓存条目列表 Hook
 */
export function useCacheEntries() {
  const [entries, setEntries] = useState<CacheEntry[]>([]);
  const cacheManager = getCacheManager();

  const refresh = useCallback(() => {
    setEntries(cacheManager.entries());
  }, [cacheManager]);

  useEffect(() => {
    refresh();

    const unsubscribe = cacheManager.addListener(() => {
      refresh();
    });

    return unsubscribe;
  }, [cacheManager, refresh]);

  return {
    entries,
    refresh,
  };
}

/**
 * 缓存配置 Hook
 */
export function useCacheConfig() {
  const [config, setConfig] = useState(() => getCacheManager().getConfig());
  const cacheManager = getCacheManager();

  const updateConfig = useCallback(
    (updates: Parameters<typeof cacheManager.updateConfig>[0]) => {
      cacheManager.updateConfig(updates);
      setConfig(cacheManager.getConfig());
    },
    [cacheManager]
  );

  return {
    config,
    updateConfig,
  };
}

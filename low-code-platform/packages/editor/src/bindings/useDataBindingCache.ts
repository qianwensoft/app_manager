/**
 * Phase 4.6 完善 - 数据绑定缓存 React Hooks
 *
 * 提供声明式的数据绑定缓存 API
 */

import { useState, useEffect, useCallback } from 'react';
import { getDataBindingCacheManager } from './DataBindingCache';
import type { DataBinding } from './types';

/**
 * 使用数据绑定缓存的 Hook
 */
export function useDataBindingCache<T = any>(
  binding: DataBinding,
  fetcher: () => Promise<T>,
  options?: {
    enabled?: boolean;
    params?: Record<string, any>;
    ttl?: number;
    tags?: string[];
    refetchOnMount?: boolean;
    refetchOnWindowFocus?: boolean;
  }
) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isCached, setIsCached] = useState(false);

  const cacheManager = getDataBindingCacheManager();
  const enabled = options?.enabled !== false;

  const fetchData = useCallback(
    async (force = false) => {
      if (!enabled) return;

      setIsLoading(true);
      setError(null);

      try {
        // 尝试从缓存获取
        if (!force) {
          const cached = await cacheManager.get<T>(binding, options?.params);
          if (cached !== undefined) {
            setData(cached);
            setIsCached(true);
            setIsLoading(false);
            return;
          }
        }

        // 获取新数据
        const result = await fetcher();
        setData(result);
        setIsCached(false);

        // 缓存数据
        cacheManager.set(binding, result, options?.params, {
          ttl: options?.ttl,
          tags: options?.tags,
        });
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setIsLoading(false);
      }
    },
    [binding, fetcher, options?.params, options?.ttl, options?.tags, enabled]
  );

  // 初始加载
  useEffect(() => {
    if (options?.refetchOnMount !== false) {
      fetchData();
    }
  }, [fetchData, options?.refetchOnMount]);

  // 窗口焦点时重新获取
  useEffect(() => {
    if (!options?.refetchOnWindowFocus) return;

    const handleFocus = () => {
      fetchData(true);
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchData, options?.refetchOnWindowFocus]);

  const refetch = useCallback(() => {
    return fetchData(true);
  }, [fetchData]);

  const invalidate = useCallback(() => {
    cacheManager.invalidate(binding, options?.params);
  }, [binding, options?.params]);

  return {
    data,
    isLoading,
    error,
    isCached,
    refetch,
    invalidate,
  };
}

/**
 * 使用数据绑定缓存统计的 Hook
 */
export function useDataBindingCacheStats() {
  const [stats, setStats] = useState(() => {
    const cacheManager = getDataBindingCacheManager();
    return cacheManager.getStats();
  });

  const refresh = useCallback(() => {
    const cacheManager = getDataBindingCacheManager();
    setStats(cacheManager.getStats());
  }, []);

  useEffect(() => {
    // 定期刷新统计
    const interval = setInterval(refresh, 1000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { stats, refresh };
}

/**
 * 使用数据绑定缓存失效的 Hook
 */
export function useDataBindingCacheInvalidation() {
  const cacheManager = getDataBindingCacheManager();

  const invalidateByInterface = useCallback(
    (interfaceSlug: string) => {
      return cacheManager.invalidateByInterface(interfaceSlug);
    },
    []
  );

  const invalidateByInterfaceId = useCallback(
    (interfaceId: number) => {
      return cacheManager.invalidateByInterfaceId(interfaceId);
    },
    []
  );

  const invalidateByDataset = useCallback(
    (datasetId: number) => {
      return cacheManager.invalidateByDataset(datasetId);
    },
    []
  );

  const invalidateByType = useCallback(
    (type: string) => {
      return cacheManager.invalidateByType(type);
    },
    []
  );

  const invalidateByTags = useCallback(
    (tags: string[]) => {
      return cacheManager.invalidateByTags(tags);
    },
    []
  );

  const clearAll = useCallback(() => {
    cacheManager.clearAll();
  }, []);

  return {
    invalidateByInterface,
    invalidateByInterfaceId,
    invalidateByDataset,
    invalidateByType,
    invalidateByTags,
    clearAll,
  };
}

/**
 * 使用数据绑定缓存配置的 Hook
 */
export function useDataBindingCacheConfig() {
  const cacheManager = getDataBindingCacheManager();

  const [config, setConfig] = useState(() => cacheManager.getConfig());

  const updateConfig = useCallback(
    (updates: Parameters<typeof cacheManager.updateConfig>[0]) => {
      cacheManager.updateConfig(updates);
      setConfig(cacheManager.getConfig());
    },
    []
  );

  return { config, updateConfig };
}

/**
 * 使用数据绑定缓存订阅的 Hook
 */
export function useDataBindingCacheSubscription<T = any>(
  binding: DataBinding,
  params?: Record<string, any>
) {
  const [data, setData] = useState<T | undefined>(undefined);
  const cacheManager = getDataBindingCacheManager();

  useEffect(() => {
    // 初始加载
    cacheManager.get<T>(binding, params).then((initialData) => {
      if (initialData !== undefined) {
        setData(initialData);
      }
    });

    // 订阅变化
    const unsubscribe = cacheManager.subscribe(
      binding,
      (newData: T) => {
        setData(newData);
      },
      params
    );

    return unsubscribe;
  }, [binding, params]);

  return data;
}

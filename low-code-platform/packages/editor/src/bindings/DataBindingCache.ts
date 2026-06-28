/**
 * Phase 4.6 完善 - 数据绑定缓存集成
 *
 * 将完整的缓存系统集成到数据绑定管理器中
 */

import { getCacheManager } from '../cache/CacheManager';
import type { CacheConfig } from '../cache/types';
import type { DataBinding, DataBindingResult } from './types';

/**
 * 数据绑定缓存配置
 */
export interface DataBindingCacheConfig extends CacheConfig {
  // 数据绑定特定的缓存配置
  enableQueryCache?: boolean;        // 启用查询缓存
  enableMutationCache?: boolean;     // 启用修改缓存
  enableBackgroundRefetch?: boolean; // 启用后台重新获取
  staleTime?: number;                // 数据过期时间（毫秒）
  cacheTime?: number;                // 缓存保留时间（毫秒）
}

/**
 * 数据绑定缓存管理器
 *
 * 专门为数据绑定优化的缓存管理器
 */
export class DataBindingCacheManager {
  private cacheManager = getCacheManager({
    maxEntries: 200,
    defaultTTL: 5 * 60 * 1000,    // 5 分钟
    maxSize: 20 * 1024 * 1024,    // 20MB
    evictionPolicy: 'lru',
    enableOfflineCache: true,
    autoCleanup: true,
  });

  private config: DataBindingCacheConfig = {
    enableQueryCache: true,
    enableMutationCache: true,
    enableBackgroundRefetch: true,
    staleTime: 30 * 1000,         // 30 秒
    cacheTime: 5 * 60 * 1000,     // 5 分钟
  };

  /**
   * 更新缓存配置
   */
  updateConfig(config: Partial<DataBindingCacheConfig>): void {
    this.config = { ...this.config, ...config };

    // 更新底层缓存管理器配置
    if (config.defaultTTL || config.maxEntries || config.maxSize || config.evictionPolicy) {
      this.cacheManager = getCacheManager({
        maxEntries: config.maxEntries,
        defaultTTL: config.defaultTTL,
        maxSize: config.maxSize,
        evictionPolicy: config.evictionPolicy,
        enableOfflineCache: config.enableOfflineCache,
        autoCleanup: config.autoCleanup,
      });
    }
  }

  /**
   * 获取缓存配置
   */
  getConfig(): DataBindingCacheConfig {
    return this.config;
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(binding: DataBinding, params?: Record<string, any>): string {
    const parts = [
      binding.type,
      binding.interfaceSlug || binding.interfaceId?.toString() ||
      binding.datasetId?.toString() || binding.variableName || '',
    ];

    if (params && Object.keys(params).length > 0) {
      // 将参数排序后生成稳定的键
      const sortedParams = Object.keys(params)
        .sort()
        .map((key) => `${key}=${JSON.stringify(params[key])}`)
        .join('&');
      parts.push(sortedParams);
    }

    return parts.join(':');
  }

  /**
   * 获取缓存数据
   */
  async get<T = any>(
    binding: DataBinding,
    params?: Record<string, any>
  ): Promise<T | undefined> {
    if (!this.config.enableQueryCache) {
      return undefined;
    }

    const key = this.generateCacheKey(binding, params);
    const cached = this.cacheManager.get<T>(key);

    if (cached) {
      // 检查是否需要后台重新获取
      const entry = this.cacheManager.entries().find((e) => e.key === key);
      if (entry && this.config.enableBackgroundRefetch) {
        const age = Date.now() - entry.timestamp;
        const staleTime = this.config.staleTime || 30000;

        if (age > staleTime) {
          // 数据已过期，但仍然返回旧数据，同时标记需要后台刷新
          return cached;
        }
      }
    }

    return cached;
  }

  /**
   * 设置缓存数据
   */
  set<T = any>(
    binding: DataBinding,
    data: T,
    params?: Record<string, any>,
    options?: {
      ttl?: number;
      tags?: string[];
      persistent?: boolean;
    }
  ): void {
    if (!this.config.enableQueryCache) {
      return;
    }

    const key = this.generateCacheKey(binding, params);
    const ttl = options?.ttl || this.config.cacheTime || this.config.defaultTTL;

    // 自动生成标签
    const tags = options?.tags || this.generateTags(binding);

    this.cacheManager.set(key, data, {
      ttl,
      tags,
      persistent: options?.persistent !== false,
    });
  }

  /**
   * 生成标签
   */
  private generateTags(binding: DataBinding): string[] {
    const tags: string[] = [binding.type];

    if (binding.interfaceSlug) {
      tags.push(`interface:${binding.interfaceSlug}`);
    }
    if (binding.interfaceId) {
      tags.push(`interfaceId:${binding.interfaceId}`);
    }
    if (binding.datasetId) {
      tags.push(`datasetId:${binding.datasetId}`);
    }
    if (binding.variableName) {
      tags.push(`variable:${binding.variableName}`);
    }

    return tags;
  }

  /**
   * 使缓存失效
   */
  invalidate(binding: DataBinding, params?: Record<string, any>): void {
    const key = this.generateCacheKey(binding, params);
    this.cacheManager.delete(key);
  }

  /**
   * 按标签使缓存失效
   */
  invalidateByTags(tags: string[]): number {
    return this.cacheManager.invalidateByTags(tags);
  }

  /**
   * 按接口 slug 使缓存失效
   */
  invalidateByInterface(interfaceSlug: string): number {
    return this.cacheManager.invalidateByTags([`interface:${interfaceSlug}`]);
  }

  /**
   * 按接口 ID 使缓存失效
   */
  invalidateByInterfaceId(interfaceId: number): number {
    return this.cacheManager.invalidateByTags([`interfaceId:${interfaceId}`]);
  }

  /**
   * 按数据集 ID 使缓存失效
   */
  invalidateByDataset(datasetId: number): number {
    return this.cacheManager.invalidateByTags([`datasetId:${datasetId}`]);
  }

  /**
   * 按绑定类型使缓存失效
   */
  invalidateByType(type: string): number {
    return this.cacheManager.invalidateByTags([type]);
  }

  /**
   * 清空所有缓存
   */
  clearAll(): void {
    this.cacheManager.clear();
  }

  /**
   * 获取缓存统计
   */
  getStats() {
    return this.cacheManager.getStats();
  }

  /**
   * 获取所有缓存条目
   */
  getEntries() {
    return this.cacheManager.entries();
  }

  /**
   * 预取数据（用于后台刷新）
   */
  async prefetch<T = any>(
    binding: DataBinding,
    fetcher: () => Promise<T>,
    params?: Record<string, any>,
    options?: {
      ttl?: number;
      tags?: string[];
    }
  ): Promise<T> {
    const key = this.generateCacheKey(binding, params);
    const cached = this.cacheManager.get<T>(key);

    // 如果有缓存且未过期，直接返回
    if (cached) {
      const entry = this.cacheManager.entries().find((e) => e.key === key);
      if (entry) {
        const age = Date.now() - entry.timestamp;
        const ttl = options?.ttl || this.config.cacheTime || this.config.defaultTTL;

        if (age < ttl) {
          return cached;
        }
      }
    }

    // 否则获取新数据
    const data = await fetcher();
    this.set(binding, data, params, options);
    return data;
  }

  /**
   * 乐观更新
   */
  optimisticUpdate<T = any>(
    binding: DataBinding,
    updater: (oldData: T | undefined) => T,
    params?: Record<string, any>
  ): T {
    const key = this.generateCacheKey(binding, params);
    const oldData = this.cacheManager.get<T>(key);
    const newData = updater(oldData);

    this.set(binding, newData, params, {
      ttl: this.config.cacheTime,
    });

    return newData;
  }

  /**
   * 订阅缓存变化
   */
  subscribe(
    binding: DataBinding,
    callback: (data: any) => void,
    params?: Record<string, any>
  ): () => void {
    const key = this.generateCacheKey(binding, params);

    const listener = (event: any) => {
      if (event.key === key && event.type === 'set') {
        callback(event.data);
      }
    };

    const unsubscribe = this.cacheManager.addListener(listener);

    return unsubscribe;
  }
}

// 导出单例
let instance: DataBindingCacheManager | null = null;

export function getDataBindingCacheManager(): DataBindingCacheManager {
  if (!instance) {
    instance = new DataBindingCacheManager();
  }
  return instance;
}

export default getDataBindingCacheManager;

/**
 * 数据缓存管理器
 */

import type {
  CacheEntry,
  CacheConfig,
  CacheStats,
  CacheEvent,
  CacheListener,
  CacheEventType,
} from './types';

const DEFAULT_CONFIG: Required<CacheConfig> = {
  maxEntries: 100,
  defaultTTL: 5 * 60 * 1000, // 5 分钟
  maxSize: 10 * 1024 * 1024, // 10MB
  enableOfflineCache: true,
  evictionPolicy: 'lru',
  autoCleanup: true,
  cleanupInterval: 60 * 1000, // 1 分钟
};

class CacheManager {
  private cache: Map<string, CacheEntry> = new Map();
  private config: Required<CacheConfig>;
  private stats: Omit<CacheStats, 'hitRate' | 'avgAccessCount'> = {
    totalEntries: 0,
    totalSize: 0,
    hits: 0,
    misses: 0,
    evictions: 0,
    expirations: 0,
    persistentEntries: 0,
  };
  private listeners: CacheListener[] = [];
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(config?: CacheConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadFromStorage();
    if (this.config.autoCleanup) {
      this.startAutoCleanup();
    }
  }

  /**
   * 获取缓存数据
   */
  get<T = any>(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      this.emit('miss', key);
      return undefined;
    }

    // 检查是否过期
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.delete(key, 'expire');
      this.stats.misses++;
      this.emit('miss', key);
      return undefined;
    }

    // 更新访问统计
    entry.lastAccessed = Date.now();
    entry.accessCount++;
    this.stats.hits++;
    this.emit('hit', key);

    return entry.data as T;
  }

  /**
   * 设置缓存数据
   */
  set<T = any>(
    key: string,
    data: T,
    options?: {
      ttl?: number;
      tags?: string[];
      persistent?: boolean;
    }
  ): void {
    const now = Date.now();
    const ttl = options?.ttl ?? this.config.defaultTTL;
    const size = this.estimateSize(data);

    // 检查是否需要淘汰
    if (this.cache.size >= this.config.maxEntries) {
      this.evict();
    }

    // 检查总大小
    const newTotalSize = this.stats.totalSize + size;
    if (newTotalSize > this.config.maxSize) {
      this.evictBySize(newTotalSize - this.config.maxSize);
    }

    const entry: CacheEntry<T> = {
      key,
      data,
      timestamp: now,
      expiresAt: ttl ? now + ttl : undefined,
      lastAccessed: now,
      accessCount: 0,
      tags: options?.tags ?? [],
      size,
      persistent: options?.persistent ?? false,
    };

    const existingEntry = this.cache.get(key);
    if (existingEntry) {
      this.stats.totalSize -= existingEntry.size;
      if (existingEntry.persistent) {
        this.stats.persistentEntries--;
      }
    }

    this.cache.set(key, entry);
    this.stats.totalSize += size;
    this.stats.totalEntries = this.cache.size;

    if (entry.persistent) {
      this.stats.persistentEntries++;
      this.saveToStorage(key, entry);
    }

    this.emit('set', key, { entry });
  }

  /**
   * 删除缓存数据
   */
  delete(key: string, reason: 'manual' | 'evict' | 'expire' = 'manual'): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    this.cache.delete(key);
    this.stats.totalSize -= entry.size;
    this.stats.totalEntries = this.cache.size;

    if (entry.persistent) {
      this.stats.persistentEntries--;
      this.removeFromStorage(key);
    }

    if (reason === 'evict') {
      this.stats.evictions++;
    } else if (reason === 'expire') {
      this.stats.expirations++;
    }

    this.emit(reason === 'manual' ? 'delete' : reason, key);
    return true;
  }

  /**
   * 根据标签失效缓存
   */
  invalidateByTags(tags: string[]): number {
    let count = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (entry.tags.some((tag) => tags.includes(tag))) {
        this.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * 根据键前缀失效缓存
   */
  invalidateByPrefix(prefix: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.cache.clear();
    this.stats.totalEntries = 0;
    this.stats.totalSize = 0;
    this.stats.persistentEntries = 0;
    this.clearStorage();
    this.emit('clear');
  }

  /**
   * 获取所有缓存键
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * 获取所有缓存条目
   */
  entries(): CacheEntry[] {
    return Array.from(this.cache.values());
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): CacheStats {
    const totalAccess = this.stats.hits + this.stats.misses;
    const hitRate = totalAccess > 0 ? this.stats.hits / totalAccess : 0;

    const entries = Array.from(this.cache.values());
    const avgAccessCount = entries.length > 0
      ? entries.reduce((sum, e) => sum + e.accessCount, 0) / entries.length
      : 0;

    return {
      ...this.stats,
      hitRate,
      avgAccessCount,
    };
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.evictions = 0;
    this.stats.expirations = 0;
  }

  /**
   * 添加事件监听器
   */
  addListener(listener: CacheListener): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...config };

    if (config.autoCleanup !== undefined) {
      if (config.autoCleanup) {
        this.startAutoCleanup();
      } else {
        this.stopAutoCleanup();
      }
    }
  }

  /**
   * 获取配置
   */
  getConfig(): Required<CacheConfig> {
    return { ...this.config };
  }

  /**
   * 销毁管理器
   */
  destroy(): void {
    this.stopAutoCleanup();
    this.listeners = [];
  }

  // ========== 私有方法 ==========

  /**
   * 淘汰缓存（基于策略）
   */
  private evict(): void {
    if (this.cache.size === 0) return;

    let keyToEvict: string | undefined;

    switch (this.config.evictionPolicy) {
      case 'lru': // Least Recently Used
        keyToEvict = this.findLRU();
        break;
      case 'lfu': // Least Frequently Used
        keyToEvict = this.findLFU();
        break;
      case 'fifo': // First In First Out
        keyToEvict = this.findFIFO();
        break;
    }

    if (keyToEvict) {
      this.delete(keyToEvict, 'evict');
    }
  }

  /**
   * 根据大小淘汰缓存
   */
  private evictBySize(targetSize: number): void {
    let freedSize = 0;
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

    for (const [key] of entries) {
      if (freedSize >= targetSize) break;
      const entry = this.cache.get(key);
      if (entry) {
        freedSize += entry.size;
        this.delete(key, 'evict');
      }
    }
  }

  /**
   * 查找 LRU 条目
   */
  private findLRU(): string | undefined {
    let oldest: [string, CacheEntry] | undefined;
    for (const entry of this.cache.entries()) {
      if (!oldest || entry[1].lastAccessed < oldest[1].lastAccessed) {
        oldest = entry;
      }
    }
    return oldest?.[0];
  }

  /**
   * 查找 LFU 条目
   */
  private findLFU(): string | undefined {
    let leastUsed: [string, CacheEntry] | undefined;
    for (const entry of this.cache.entries()) {
      if (!leastUsed || entry[1].accessCount < leastUsed[1].accessCount) {
        leastUsed = entry;
      }
    }
    return leastUsed?.[0];
  }

  /**
   * 查找 FIFO 条目
   */
  private findFIFO(): string | undefined {
    let oldest: [string, CacheEntry] | undefined;
    for (const entry of this.cache.entries()) {
      if (!oldest || entry[1].timestamp < oldest[1].timestamp) {
        oldest = entry;
      }
    }
    return oldest?.[0];
  }

  /**
   * 估算数据大小
   */
  private estimateSize(data: any): number {
    try {
      return new Blob([JSON.stringify(data)]).size;
    } catch {
      return 1024; // 默认 1KB
    }
  }

  /**
   * 触发事件
   */
  private emit(type: CacheEventType, key?: string, data?: any): void {
    const event: CacheEvent = {
      type,
      key,
      timestamp: Date.now(),
      data,
    };
    this.listeners.forEach((listener) => listener(event));
  }

  /**
   * 启动自动清理
   */
  private startAutoCleanup(): void {
    this.stopAutoCleanup();
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, this.config.cleanupInterval);
  }

  /**
   * 停止自动清理
   */
  private stopAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * 清理过期缓存
   */
  private cleanupExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this.delete(key, 'expire');
      }
    }
  }

  /**
   * 从 localStorage 加载
   */
  private loadFromStorage(): void {
    if (!this.config.enableOfflineCache) return;

    try {
      const keys = this.getStorageKeys();
      for (const key of keys) {
        const stored = localStorage.getItem(`cache:${key}`);
        if (stored) {
          const entry: CacheEntry = JSON.parse(stored);
          // 检查是否过期
          if (!entry.expiresAt || entry.expiresAt > Date.now()) {
            this.cache.set(key, entry);
            this.stats.totalSize += entry.size;
            this.stats.persistentEntries++;
          } else {
            localStorage.removeItem(`cache:${key}`);
          }
        }
      }
      this.stats.totalEntries = this.cache.size;
    } catch (error) {
      console.error('Failed to load cache from storage:', error);
    }
  }

  /**
   * 保存到 localStorage
   */
  private saveToStorage(key: string, entry: CacheEntry): void {
    if (!this.config.enableOfflineCache) return;

    try {
      localStorage.setItem(`cache:${key}`, JSON.stringify(entry));
      const keys = this.getStorageKeys();
      if (!keys.includes(key)) {
        keys.push(key);
        localStorage.setItem('cache:keys', JSON.stringify(keys));
      }
    } catch (error) {
      console.error('Failed to save cache to storage:', error);
    }
  }

  /**
   * 从 localStorage 移除
   */
  private removeFromStorage(key: string): void {
    if (!this.config.enableOfflineCache) return;

    try {
      localStorage.removeItem(`cache:${key}`);
      const keys = this.getStorageKeys().filter((k) => k !== key);
      localStorage.setItem('cache:keys', JSON.stringify(keys));
    } catch (error) {
      console.error('Failed to remove cache from storage:', error);
    }
  }

  /**
   * 清空 localStorage
   */
  private clearStorage(): void {
    if (!this.config.enableOfflineCache) return;

    try {
      const keys = this.getStorageKeys();
      for (const key of keys) {
        localStorage.removeItem(`cache:${key}`);
      }
      localStorage.removeItem('cache:keys');
    } catch (error) {
      console.error('Failed to clear cache storage:', error);
    }
  }

  /**
   * 获取 localStorage 中的所有键
   */
  private getStorageKeys(): string[] {
    try {
      const stored = localStorage.getItem('cache:keys');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }
}

// 全局单例
let instance: CacheManager | undefined;

export function getCacheManager(config?: CacheConfig): CacheManager {
  if (!instance) {
    instance = new CacheManager(config);
  }
  return instance;
}

export function resetCacheManager(): void {
  if (instance) {
    instance.destroy();
    instance = undefined;
  }
}

export default CacheManager;

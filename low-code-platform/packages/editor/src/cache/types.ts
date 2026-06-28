/**
 * 缓存策略类型定义
 */

/**
 * 缓存条目
 */
export interface CacheEntry<T = any> {
  /** 缓存键 */
  key: string;
  /** 缓存数据 */
  data: T;
  /** 创建时间戳 */
  timestamp: number;
  /** 过期时间戳（如果有） */
  expiresAt?: number;
  /** 最后访问时间戳 */
  lastAccessed: number;
  /** 访问次数 */
  accessCount: number;
  /** 缓存标签（用于批量失效） */
  tags: string[];
  /** 数据大小（字节） */
  size: number;
  /** 是否持久化到 localStorage */
  persistent: boolean;
}

/**
 * 缓存配置
 */
export interface CacheConfig {
  /** 最大缓存条目数 */
  maxEntries?: number;
  /** 默认 TTL（毫秒） */
  defaultTTL?: number;
  /** 最大缓存大小（字节） */
  maxSize?: number;
  /** 是否启用离线缓存 */
  enableOfflineCache?: boolean;
  /** 缓存淘汰策略 */
  evictionPolicy?: 'lru' | 'lfu' | 'fifo';
  /** 是否在后台自动清理过期缓存 */
  autoCleanup?: boolean;
  /** 自动清理间隔（毫秒） */
  cleanupInterval?: number;
}

/**
 * 缓存查询选项
 */
export interface CacheQueryOptions {
  /** 缓存键 */
  key: string;
  /** 数据获取函数 */
  fetcher: () => Promise<any>;
  /** TTL（毫秒） */
  ttl?: number;
  /** 缓存标签 */
  tags?: string[];
  /** 是否启用缓存 */
  enabled?: boolean;
  /** 是否在后台重新验证（stale-while-revalidate） */
  revalidateInBackground?: boolean;
  /** 是否持久化 */
  persistent?: boolean;
  /** 缓存命中时的回调 */
  onCacheHit?: (data: any) => void;
  /** 缓存未命中时的回调 */
  onCacheMiss?: () => void;
}

/**
 * 缓存修改选项
 */
export interface CacheMutationOptions {
  /** 修改函数 */
  mutator: () => Promise<any>;
  /** 成功后需要失效的缓存键 */
  invalidateKeys?: string[];
  /** 成功后需要失效的标签 */
  invalidateTags?: string[];
  /** 是否乐观更新 */
  optimistic?: boolean;
  /** 乐观更新的数据 */
  optimisticData?: any;
  /** 成功回调 */
  onSuccess?: (data: any) => void;
  /** 失败回调 */
  onError?: (error: Error) => void;
}

/**
 * 缓存统计信息
 */
export interface CacheStats {
  /** 总条目数 */
  totalEntries: number;
  /** 总大小（字节） */
  totalSize: number;
  /** 缓存命中次数 */
  hits: number;
  /** 缓存未命中次数 */
  misses: number;
  /** 命中率 */
  hitRate: number;
  /** 淘汰次数 */
  evictions: number;
  /** 过期次数 */
  expirations: number;
  /** 平均访问次数 */
  avgAccessCount: number;
  /** 持久化条目数 */
  persistentEntries: number;
}

/**
 * 缓存事件类型
 */
export type CacheEventType =
  | 'hit'
  | 'miss'
  | 'set'
  | 'delete'
  | 'clear'
  | 'evict'
  | 'expire';

/**
 * 缓存事件
 */
export interface CacheEvent {
  /** 事件类型 */
  type: CacheEventType;
  /** 缓存键 */
  key?: string;
  /** 时间戳 */
  timestamp: number;
  /** 额外数据 */
  data?: any;
}

/**
 * 缓存监听器
 */
export type CacheListener = (event: CacheEvent) => void;

/**
 * 数据绑定管理器
 */

import type {
  DataBinding,
  DataBindingConfig,
  BindingContext,
  DataBindingResult,
} from './types';
import { resolveExpression, transformData, evaluateExpression } from './types';
import { invokeOpenAPI } from '../data/dataInterfaceApi';
import { executeDataset } from '../data/datasetApi';
import { getDataBindingCacheManager } from './DataBindingCache';

class DataBindingManager {
  private bindings: Map<string, DataBindingConfig> = new Map();
  private cacheManager = getDataBindingCacheManager();
  private refreshTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private context: BindingContext = {
    variables: {},
    pageParams: {},
    queryParams: {},
    user: undefined,
    temp: {},
  };

  /**
   * 注册数据绑定
   */
  registerBinding(config: DataBindingConfig): void {
    this.bindings.set(config.id, config);

    // 如果启用了自动刷新，设置定时器
    if (config.enabled && config.binding.autoRefresh && config.binding.refreshInterval) {
      this.startAutoRefresh(config.id);
    }
  }

  /**
   * 取消注册数据绑定
   */
  unregisterBinding(id: string): void {
    this.bindings.delete(id);
    this.stopAutoRefresh(id);
    // 缓存由 CacheManager 统一管理，不需要手动删除
  }

  /**
   * 更新绑定配置
   */
  updateBinding(id: string, updates: Partial<DataBindingConfig>): void {
    const config = this.bindings.get(id);
    if (!config) return;

    const newConfig = { ...config, ...updates };
    this.bindings.set(id, newConfig);

    // 重新设置自动刷新
    this.stopAutoRefresh(id);
    if (newConfig.enabled && newConfig.binding.autoRefresh && newConfig.binding.refreshInterval) {
      this.startAutoRefresh(id);
    }
  }

  /**
   * 获取绑定配置
   */
  getBinding(id: string): DataBindingConfig | undefined {
    return this.bindings.get(id);
  }

  /**
   * 获取组件的所有绑定
   */
  getComponentBindings(componentId: string): DataBindingConfig[] {
    return Array.from(this.bindings.values()).filter((b) => b.componentId === componentId);
  }

  /**
   * 更新上下文
   */
  updateContext(updates: Partial<BindingContext>): void {
    this.context = { ...this.context, ...updates };
  }

  /**
   * 获取上下文
   */
  getContext(): BindingContext {
    return this.context;
  }

  /**
   * 执行数据绑定
   */
  async executeBinding(id: string, forceRefresh = false): Promise<DataBindingResult> {
    const config = this.bindings.get(id);
    if (!config || !config.enabled) {
      return {
        success: false,
        data: null,
        error: 'Binding not found or disabled',
        timestamp: Date.now(),
      };
    }

    // 检查缓存（使用新的缓存管理器）
    if (!forceRefresh && config.binding.cache) {
      const params = this.resolveParams(config.binding);
      const cached = await this.cacheManager.get(config.binding, params);

      if (cached !== undefined) {
        return {
          success: true,
          data: cached,
          cached: true,
          timestamp: Date.now(),
        };
      }
    }

    try {
      let data: any;

      // 根据绑定类型执行
      switch (config.binding.type) {
        case 'static':
          data = config.binding.staticValue;
          break;

        case 'interface':
          data = await this.executeInterfaceBinding(config.binding);
          break;

        case 'dataset':
          data = await this.executeDatasetBinding(config.binding);
          break;

        case 'variable':
          data = this.executeVariableBinding(config.binding);
          break;

        case 'expression':
          data = this.executeExpressionBinding(config.binding);
          break;

        default:
          throw new Error(`Unknown binding type: ${config.binding.type}`);
      }

      // 数据转换
      if (config.binding.transform) {
        data = transformData(data, config.binding.transform, this.context);
      }

      // 缓存结果（使用新的缓存管理器）
      if (config.binding.cache) {
        const params = this.resolveParams(config.binding);
        const ttl = config.binding.cacheDuration
          ? config.binding.cacheDuration * 1000
          : undefined;

        this.cacheManager.set(config.binding, data, params, {
          ttl,
          persistent: true,
        });
      }

      return {
        success: true,
        data,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      };
    }
  }

  /**
   * 执行接口绑定
   */
  private async executeInterfaceBinding(binding: DataBinding): Promise<any> {
    if (!binding.interfaceSlug) {
      throw new Error('Interface slug is required');
    }

    // 解析参数中的变量
    const params = this.resolveParams(binding.params || {});

    const result = await invokeOpenAPI(binding.interfaceSlug, params);

    if (result.error) {
      throw new Error(result.error);
    }

    return result.data;
  }

  /**
   * 执行数据集绑定
   */
  private async executeDatasetBinding(binding: DataBinding): Promise<any> {
    if (!binding.datasetId) {
      throw new Error('Dataset ID is required');
    }

    // 解析参数中的变量
    const params = this.resolveParams(binding.datasetParams || {});

    const result = await executeDataset(binding.datasetId, params);

    return result.data;
  }

  /**
   * 执行变量绑定
   */
  private executeVariableBinding(binding: DataBinding): any {
    if (!binding.variableName) {
      throw new Error('Variable name is required');
    }

    const value = this.context.variables[binding.variableName];
    if (value === undefined) {
      throw new Error(`Variable not found: ${binding.variableName}`);
    }

    return value;
  }

  /**
   * 执行表达式绑定
   */
  private executeExpressionBinding(binding: DataBinding): any {
    if (!binding.expression) {
      throw new Error('Expression is required');
    }

    return evaluateExpression(binding.expression, this.context);
  }

  /**
   * 解析参数中的变量（支持从绑定配置或参数对象中提取）
   */
  private resolveParams(bindingOrParams: DataBinding | Record<string, any>): Record<string, any> {
    // 如果是 DataBinding 对象，提取 params
    const params = 'params' in bindingOrParams && bindingOrParams.params
      ? bindingOrParams.params
      : bindingOrParams as Record<string, any>;

    const resolved: Record<string, any> = {};

    for (const [key, value] of Object.entries(params || {})) {
      if (typeof value === 'string' && value.includes('{{')) {
        // 解析表达式
        resolved[key] = resolveExpression(value, this.context);
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  /**
   * 开始自动刷新
   */
  private startAutoRefresh(id: string): void {
    const config = this.bindings.get(id);
    if (!config || !config.binding.refreshInterval) return;

    const timer = setInterval(() => {
      this.executeBinding(id, true);
    }, config.binding.refreshInterval * 1000);

    this.refreshTimers.set(id, timer);
  }

  /**
   * 停止自动刷新
   */
  private stopAutoRefresh(id: string): void {
    const timer = this.refreshTimers.get(id);
    if (timer) {
      clearInterval(timer);
      this.refreshTimers.delete(id);
    }
  }

  /**
   * 清除所有缓存
   */
  clearCache(): void {
    this.cacheManager.clearAll();
  }

  /**
   * 清除特定绑定的缓存
   */
  clearBindingCache(id: string): void {
    const config = this.bindings.get(id);
    if (config) {
      const params = this.resolveParams(config.binding);
      this.cacheManager.invalidate(config.binding, params);
    }
  }

  /**
   * 按接口 slug 清除缓存
   */
  clearInterfaceCache(interfaceSlug: string): void {
    this.cacheManager.invalidateByInterface(interfaceSlug);
  }

  /**
   * 按接口 ID 清除缓存
   */
  clearInterfaceCacheById(interfaceId: number): void {
    this.cacheManager.invalidateByInterfaceId(interfaceId);
  }

  /**
   * 按数据集 ID 清除缓存
   */
  clearDatasetCache(datasetId: number): void {
    this.cacheManager.invalidateByDataset(datasetId);
  }

  /**
   * 获取缓存统计
   */
  getCacheStats() {
    return this.cacheManager.getStats();
  }

  /**
   * 销毁管理器
   */
  destroy(): void {
    // 停止所有定时器
    for (const timer of this.refreshTimers.values()) {
      clearInterval(timer);
    }
    this.refreshTimers.clear();

    // 清除所有数据
    this.bindings.clear();
    this.cacheManager.clearAll();
  }
}

// 单例实例
export const dataBindingManager = new DataBindingManager();

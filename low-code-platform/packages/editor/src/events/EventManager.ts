// ============================================
// Event Manager - 核心事件管理器
// ============================================

export type EventType =
  // 生命周期事件
  | 'page:load'
  | 'page:unload'
  | 'page:show'
  | 'page:hide'
  // 用户交互事件
  | 'component:click'
  | 'component:change'
  | 'component:focus'
  | 'component:blur'
  | 'form:submit'
  | 'form:reset'
  // 数据事件
  | 'data:success'
  | 'data:error'
  | 'data:loading'
  // 外部事件
  | 'external:webhook'
  | 'external:stomp'
  | 'external:mqtt'
  // 扫描事件
  | 'scan:barcode'
  | 'scan:qrcode'
  | 'scan:nfc'
  // 工作流事件
  | 'workflow:start'
  | 'workflow:complete'
  | 'workflow:error';

export interface EventPayload {
  type: EventType;
  source?: string; // 事件来源（组件ID、页面ID等）
  data?: any; // 事件数据
  timestamp: number;
  metadata?: Record<string, any>; // 额外元数据
}

export interface EventHandler {
  id: string;
  type: EventType;
  handler: (payload: EventPayload) => void | Promise<void>;
  once?: boolean; // 是否只执行一次
  priority?: number; // 优先级（数字越大优先级越高）
}

export interface EventConfig {
  id?: number;
  pageId?: number;
  componentId?: string;
  eventType: EventType;
  workflowId?: string;
  workflowEnabled: boolean;
  actions?: EventAction[];
  condition?: string; // JavaScript 表达式
  enabled: boolean;
  priority?: number;
}

export interface EventAction {
  type: 'workflow' | 'navigation' | 'message' | 'custom';
  config: Record<string, any>;
}

class EventManagerClass {
  private handlers: Map<EventType, EventHandler[]> = new Map();
  private eventConfigs: Map<string, EventConfig> = new Map();
  private eventHistory: EventPayload[] = [];
  private maxHistorySize = 100;
  private globalContext: Record<string, any> = {};

  constructor() {
    this.initializeDefaultHandlers();
  }

  /**
   * 注册事件处理器
   */
  on(
    type: EventType,
    handler: (payload: EventPayload) => void | Promise<void>,
    options?: { once?: boolean; priority?: number; id?: string }
  ): string {
    const handlerId = options?.id || `handler_${Date.now()}_${Math.random()}`;

    const eventHandler: EventHandler = {
      id: handlerId,
      type,
      handler,
      once: options?.once,
      priority: options?.priority ?? 0,
    };

    const handlers = this.handlers.get(type) || [];
    handlers.push(eventHandler);
    // 按优先级排序（高优先级先执行）
    handlers.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    this.handlers.set(type, handlers);

    return handlerId;
  }

  /**
   * 注册一次性事件处理器
   */
  once(
    type: EventType,
    handler: (payload: EventPayload) => void | Promise<void>,
    options?: { priority?: number; id?: string }
  ): string {
    return this.on(type, handler, { ...options, once: true });
  }

  /**
   * 移除事件处理器
   */
  off(handlerId: string): void {
    for (const [type, handlers] of this.handlers.entries()) {
      const filtered = handlers.filter(h => h.id !== handlerId);
      if (filtered.length !== handlers.length) {
        this.handlers.set(type, filtered);
        break;
      }
    }
  }

  /**
   * 移除某类型的所有处理器
   */
  offType(type: EventType): void {
    this.handlers.delete(type);
  }

  /**
   * 触发事件
   */
  async emit(
    type: EventType,
    data?: any,
    options?: { source?: string; metadata?: Record<string, any> }
  ): Promise<void> {
    const payload: EventPayload = {
      type,
      source: options?.source,
      data,
      timestamp: Date.now(),
      metadata: options?.metadata,
    };

    // 记录事件历史
    this.eventHistory.push(payload);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // 执行事件配置
    await this.executeEventConfigs(payload);

    // 执行事件处理器
    const handlers = this.handlers.get(type) || [];
    const handlersToRemove: string[] = [];

    for (const handler of handlers) {
      try {
        await handler.handler(payload);
        if (handler.once) {
          handlersToRemove.push(handler.id);
        }
      } catch (error) {
        console.error(`Error in event handler ${handler.id}:`, error);
      }
    }

    // 移除一次性处理器
    if (handlersToRemove.length > 0) {
      handlersToRemove.forEach(id => this.off(id));
    }
  }

  /**
   * 注册事件配置
   */
  registerEventConfig(config: EventConfig): void {
    const key = this.getEventConfigKey(config);
    this.eventConfigs.set(key, config);
  }

  /**
   * 移除事件配置
   */
  unregisterEventConfig(config: EventConfig): void {
    const key = this.getEventConfigKey(config);
    this.eventConfigs.delete(key);
  }

  /**
   * 批量注册事件配置
   */
  registerEventConfigs(configs: EventConfig[]): void {
    configs.forEach(config => this.registerEventConfig(config));
  }

  /**
   * 清空事件配置
   */
  clearEventConfigs(): void {
    this.eventConfigs.clear();
  }

  /**
   * 获取事件配置
   */
  getEventConfigs(filter?: {
    pageId?: number;
    componentId?: string;
    eventType?: EventType;
  }): EventConfig[] {
    const configs = Array.from(this.eventConfigs.values());

    if (!filter) {
      return configs;
    }

    return configs.filter(config => {
      if (filter.pageId && config.pageId !== filter.pageId) {
        return false;
      }
      if (filter.componentId && config.componentId !== filter.componentId) {
        return false;
      }
      if (filter.eventType && config.eventType !== filter.eventType) {
        return false;
      }
      return true;
    });
  }

  /**
   * 执行事件配置
   */
  private async executeEventConfigs(payload: EventPayload): Promise<void> {
    const configs = this.getEventConfigs({ eventType: payload.type })
      .filter(c => c.enabled)
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    for (const config of configs) {
      try {
        // 检查条件
        if (config.condition && !this.evaluateCondition(config.condition, payload)) {
          continue;
        }

        // 执行工作流
        if (config.workflowEnabled && config.workflowId) {
          await this.triggerWorkflow(config.workflowId, payload);
        }

        // 执行动作
        if (config.actions) {
          await this.executeActions(config.actions, payload);
        }
      } catch (error) {
        console.error(`Error executing event config ${config.id}:`, error);
      }
    }
  }

  /**
   * 评估条件表达式
   */
  private evaluateCondition(expression: string, payload: EventPayload): boolean {
    try {
      const sandbox = {
        payload,
        data: payload.data,
        source: payload.source,
        context: this.globalContext,
      };
      const func = new Function(...Object.keys(sandbox), `return ${expression}`);
      return func(...Object.values(sandbox));
    } catch (error) {
      console.error('Error evaluating condition:', error);
      return false;
    }
  }

  /**
   * 触发工作流
   */
  private async triggerWorkflow(workflowId: string, payload: EventPayload): Promise<void> {
    // 触发工作流事件，由 WorkflowRunner 监听
    await this.emit('workflow:start', {
      workflowId,
      trigger: payload,
    });
  }

  /**
   * 执行动作
   */
  private async executeActions(actions: EventAction[], payload: EventPayload): Promise<void> {
    for (const action of actions) {
      try {
        switch (action.type) {
          case 'navigation':
            await this.executeNavigationAction(action.config, payload);
            break;
          case 'message':
            await this.executeMessageAction(action.config, payload);
            break;
          case 'custom':
            await this.executeCustomAction(action.config, payload);
            break;
        }
      } catch (error) {
        console.error(`Error executing action ${action.type}:`, error);
      }
    }
  }

  /**
   * 执行导航动作
   */
  private async executeNavigationAction(
    config: Record<string, any>,
    payload: EventPayload
  ): Promise<void> {
    const { target, params } = config;
    const resolvedTarget = this.resolveVariables(target, payload);
    const resolvedParams = this.resolveVariables(params, payload);

    // 触发导航事件
    await this.emit('navigation:navigate', {
      target: resolvedTarget,
      params: resolvedParams,
    });
  }

  /**
   * 执行消息动作
   */
  private async executeMessageAction(
    config: Record<string, any>,
    payload: EventPayload
  ): Promise<void> {
    const { message, type = 'info', duration = 3000 } = config;
    const resolvedMessage = this.resolveVariables(message, payload);

    // 触发消息事件
    await this.emit('message:show', {
      message: resolvedMessage,
      type,
      duration,
    });
  }

  /**
   * 执行自定义动作
   */
  private async executeCustomAction(
    config: Record<string, any>,
    payload: EventPayload
  ): Promise<void> {
    const { code } = config;
    if (!code) return;

    try {
      const sandbox = {
        payload,
        data: payload.data,
        context: this.globalContext,
        emit: this.emit.bind(this),
      };
      const func = new Function(...Object.keys(sandbox), code);
      await func(...Object.values(sandbox));
    } catch (error) {
      console.error('Error executing custom action:', error);
    }
  }

  /**
   * 解析变量
   */
  private resolveVariables(value: any, payload: EventPayload): any {
    if (typeof value === 'string') {
      return value.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
        const keys = path.trim().split('.');
        let result: any = { payload, context: this.globalContext };

        for (const key of keys) {
          result = result?.[key];
          if (result === undefined) break;
        }

        return result ?? '';
      });
    }

    if (Array.isArray(value)) {
      return value.map(v => this.resolveVariables(v, payload));
    }

    if (value && typeof value === 'object') {
      const resolved: Record<string, any> = {};
      for (const [k, v] of Object.entries(value)) {
        resolved[k] = this.resolveVariables(v, payload);
      }
      return resolved;
    }

    return value;
  }

  /**
   * 获取事件配置键
   */
  private getEventConfigKey(config: EventConfig): string {
    const parts = [
      config.pageId ?? 'global',
      config.componentId ?? 'page',
      config.eventType,
    ];
    return parts.join(':');
  }

  /**
   * 初始化默认处理器
   */
  private initializeDefaultHandlers(): void {
    // 默认处理器可以在这里注册
  }

  /**
   * 设置全局上下文
   */
  setContext(key: string, value: any): void {
    this.globalContext[key] = value;
  }

  /**
   * 获取全局上下文
   */
  getContext(key?: string): any {
    if (key) {
      return this.globalContext[key];
    }
    return { ...this.globalContext };
  }

  /**
   * 清空全局上下文
   */
  clearContext(): void {
    this.globalContext = {};
  }

  /**
   * 获取事件历史
   */
  getHistory(filter?: { type?: EventType; limit?: number }): EventPayload[] {
    let history = [...this.eventHistory];

    if (filter?.type) {
      history = history.filter(e => e.type === filter.type);
    }

    if (filter?.limit) {
      history = history.slice(-filter.limit);
    }

    return history;
  }

  /**
   * 清空事件历史
   */
  clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   * 重置事件管理器
   */
  reset(): void {
    this.handlers.clear();
    this.eventConfigs.clear();
    this.eventHistory = [];
    this.globalContext = {};
    this.initializeDefaultHandlers();
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    handlerCount: number;
    configCount: number;
    historySize: number;
    handlersByType: Record<string, number>;
  } {
    const handlersByType: Record<string, number> = {};

    for (const [type, handlers] of this.handlers.entries()) {
      handlersByType[type] = handlers.length;
    }

    return {
      handlerCount: Array.from(this.handlers.values()).reduce(
        (sum, handlers) => sum + handlers.length,
        0
      ),
      configCount: this.eventConfigs.size,
      historySize: this.eventHistory.length,
      handlersByType,
    };
  }
}

// 单例导出
export const EventManager = new EventManagerClass();

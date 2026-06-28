/**
 * 工作流执行引擎 - 前端版本
 *
 * 负责在浏览器端执行工作流定义
 * 支持的节点类型：
 * - formSubmit: 表单提交
 * - dataInterface: 数据接口调用
 * - outboundConnector: 外部连接器
 * - condition: 条件判断
 * - loop: 循环
 * - validation: 数据验证
 * - navigation: 页面导航
 * - http: HTTP 请求
 * - code: 代码执行
 * - delay: 延迟
 */

import type { WorkflowDefinition, WorkflowNode } from '@lowcode/schema';
import { EventManager } from '../events/EventManager';

// 执行上下文
export interface ExecutionContext {
  variables: Record<string, any>;        // 变量存储
  results: Record<string, any>;          // 节点执行结果
  formData: Record<string, any>;         // 表单数据
  config: Record<string, any>;           // 全局配置
}

// 节点执行结果
export interface NodeExecutionResult {
  success: boolean;
  output?: any;
  error?: string;
  nextNodes?: string[];                  // 下一个要执行的节点 ID
}

// 工作流执行状态
export type ExecutionStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';

// 节点状态
export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

// 工作流执行器
export class WorkflowRunner {
  private definition: WorkflowDefinition;
  private context: ExecutionContext;
  private nodeStatuses: Map<string, NodeStatus>;
  private status: ExecutionStatus;
  private onNodeStart?: (nodeId: string) => void;
  private onNodeComplete?: (nodeId: string, result: NodeExecutionResult) => void;
  private onComplete?: (success: boolean) => void;

  constructor(
    definition: WorkflowDefinition,
    initialContext: Partial<ExecutionContext> = {}
  ) {
    this.definition = definition;
    this.context = {
      variables: initialContext.variables || {},
      results: {},
      formData: initialContext.formData || {},
      config: initialContext.config || {},
    };
    this.nodeStatuses = new Map();
    this.status = 'idle';
  }

  // 设置事件监听器
  on(event: 'nodeStart', handler: (nodeId: string) => void): void;
  on(event: 'nodeComplete', handler: (nodeId: string, result: NodeExecutionResult) => void): void;
  on(event: 'complete', handler: (success: boolean) => void): void;
  on(event: string, handler: (...args: any[]) => void): void {
    switch (event) {
      case 'nodeStart':
        this.onNodeStart = handler;
        break;
      case 'nodeComplete':
        this.onNodeComplete = handler;
        break;
      case 'complete':
        this.onComplete = handler;
        break;
    }
  }

  // 开始执行工作流
  async execute(): Promise<boolean> {
    this.status = 'running';

    // 触发工作流开始事件
    await EventManager.emit('workflow:start', {
      workflowId: this.definition.id,
      context: this.context,
    });

    try {
      // 查找 start 节点
      const startNode = this.definition.nodes.find((n) => n.type === 'start');
      if (!startNode) {
        throw new Error('No start node found');
      }

      // 从 start 节点开始执行
      const success = await this.executeNode(startNode.id);

      this.status = success ? 'completed' : 'failed';
      this.onComplete?.(success);

      // 触发工作流完成/错误事件
      if (success) {
        await EventManager.emit('workflow:complete', {
          workflowId: this.definition.id,
          context: this.context,
          results: this.context.results,
        });
      } else {
        await EventManager.emit('workflow:error', {
          workflowId: this.definition.id,
          error: 'Workflow execution failed',
        });
      }

      return success;
    } catch (error) {
      console.error('Workflow execution failed:', error);
      this.status = 'failed';
      this.onComplete?.(false);

      // 触发工作流错误事件
      await EventManager.emit('workflow:error', {
        workflowId: this.definition.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return false;
    }
  }

  // 执行单个节点
  private async executeNode(nodeId: string): Promise<boolean> {
    const node = this.definition.nodes.find((n) => n.id === nodeId);
    if (!node) {
      console.error(`Node ${nodeId} not found`);
      return false;
    }

    // 标记节点为运行中
    this.nodeStatuses.set(nodeId, 'running');
    this.onNodeStart?.(nodeId);

    try {
      // 执行节点
      const result = await this.executeNodeByType(node);

      // 保存结果
      this.context.results[nodeId] = result.output;

      // 标记节点状态
      this.nodeStatuses.set(nodeId, result.success ? 'completed' : 'failed');
      this.onNodeComplete?.(nodeId, result);

      if (!result.success) {
        return false;
      }

      // 如果是 end 节点，停止执行
      if (node.type === 'end') {
        return true;
      }

      // 执行下一个节点
      const nextNodes = result.nextNodes || this.getNextNodes(nodeId);

      for (const nextNodeId of nextNodes) {
        const success = await this.executeNode(nextNodeId);
        if (!success) return false;
      }

      return true;
    } catch (error: any) {
      console.error(`Node ${nodeId} execution failed:`, error);
      this.nodeStatuses.set(nodeId, 'failed');
      this.onNodeComplete?.(nodeId, {
        success: false,
        error: error.message,
      });
      return false;
    }
  }

  // 根据节点类型执行
  private async executeNodeByType(node: WorkflowNode): Promise<NodeExecutionResult> {
    const config = node.config || {};

    switch (node.type) {
      case 'start':
        return this.executeStart(node, config);

      case 'end':
        return this.executeEnd(node, config);

      case 'formSubmit':
        return this.executeFormSubmit(node, config);

      case 'dataInterface':
        return this.executeDataInterface(node, config);

      case 'outboundConnector':
        return this.executeOutboundConnector(node, config);

      case 'condition':
        return this.executeCondition(node, config);

      case 'loop':
        return this.executeLoop(node, config);

      case 'validation':
        return this.executeValidation(node, config);

      case 'navigation':
        return this.executeNavigation(node, config);

      case 'http':
        return this.executeHttp(node, config);

      case 'code':
        return this.executeCode(node, config);

      case 'delay':
        return this.executeDelay(node, config);

      default:
        return {
          success: false,
          error: `Unsupported node type: ${node.type}`,
        };
    }
  }

  // ===== 节点执行器实现 =====

  private async executeStart(node: WorkflowNode, config: any): Promise<NodeExecutionResult> {
    return { success: true };
  }

  private async executeEnd(node: WorkflowNode, config: any): Promise<NodeExecutionResult> {
    return { success: true };
  }

  private async executeFormSubmit(node: WorkflowNode, config: any): Promise<NodeExecutionResult> {
    const { formContainerId, onSuccess = 'continue' } = config;

    if (!formContainerId) {
      return { success: false, error: 'formContainerId is required' };
    }

    // 获取表单数据（假设已经在 context.formData 中）
    const formData = this.context.formData[formContainerId];
    if (!formData) {
      return { success: false, error: `Form data not found for ${formContainerId}` };
    }

    // 保存到变量
    this.context.variables.formSubmitResult = formData;

    return {
      success: true,
      output: formData,
    };
  }

  private async executeDataInterface(node: WorkflowNode, config: any): Promise<NodeExecutionResult> {
    const { interfaceCode, params = {}, resultVariable = 'result' } = config;

    if (!interfaceCode) {
      return { success: false, error: 'interfaceCode is required' };
    }

    try {
      // 替换参数中的变量
      const resolvedParams = this.resolveVariables(params);

      // 调用数据接口
      const response = await fetch(`/api/data/interfaces/invoke/${interfaceCode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ param_values: resolvedParams }),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }

      const result = await response.json();

      // 保存结果到变量
      this.context.variables[resultVariable] = result;

      return {
        success: true,
        output: result,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  private async executeOutboundConnector(node: WorkflowNode, config: any): Promise<NodeExecutionResult> {
    const { connectorId, method = 'POST', params = {} } = config;

    if (!connectorId) {
      return { success: false, error: 'connectorId is required' };
    }

    try {
      const resolvedParams = this.resolveVariables(params);

      const response = await fetch(`/api/outbound/connectors/${connectorId}/invoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method,
          params: resolvedParams,
        }),
      });

      if (!response.ok) {
        throw new Error(`Connector request failed: ${response.statusText}`);
      }

      const result = await response.json();

      return {
        success: true,
        output: result,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  private async executeCondition(node: WorkflowNode, config: any): Promise<NodeExecutionResult> {
    const { expression } = config;

    if (!expression) {
      return { success: false, error: 'expression is required' };
    }

    try {
      // 评估表达式
      const result = this.evaluateExpression(expression);

      // 根据结果决定下一个节点
      const edges = this.definition.edges.filter((e) => e.source === node.id);
      const nextEdge = edges.find((e) => {
        if (e.label === 'true' || e.label === 'True') return result === true;
        if (e.label === 'false' || e.label === 'False') return result === false;
        return false;
      });

      const nextNodes = nextEdge ? [nextEdge.target] : [];

      return {
        success: true,
        output: result,
        nextNodes,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  private async executeLoop(node: WorkflowNode, config: any): Promise<NodeExecutionResult> {
    const { itemsVariable, itemVariable = 'item', indexVariable = 'index' } = config;

    if (!itemsVariable) {
      return { success: false, error: 'itemsVariable is required' };
    }

    const items = this.context.variables[itemsVariable];
    if (!Array.isArray(items)) {
      return { success: false, error: `${itemsVariable} is not an array` };
    }

    const results = [];

    for (let i = 0; i < items.length; i++) {
      // 设置循环变量
      this.context.variables[itemVariable] = items[i];
      this.context.variables[indexVariable] = i;

      // 执行循环体（下一个节点）
      const nextNodes = this.getNextNodes(node.id);
      for (const nextNodeId of nextNodes) {
        const success = await this.executeNode(nextNodeId);
        if (!success) {
          return { success: false, error: 'Loop iteration failed' };
        }
      }

      results.push(this.context.results[nextNodes[0]]);
    }

    return {
      success: true,
      output: results,
    };
  }

  private async executeValidation(node: WorkflowNode, config: any): Promise<NodeExecutionResult> {
    const { rules = [], onFailure = 'stop' } = config;

    const errors: string[] = [];

    for (const rule of rules) {
      const { field, type, message } = rule;
      const value = this.context.variables[field];

      let isValid = true;

      switch (type) {
        case 'required':
          isValid = value != null && value !== '';
          break;
        case 'email':
          isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
          break;
        case 'min':
          isValid = typeof value === 'number' && value >= rule.min;
          break;
        case 'max':
          isValid = typeof value === 'number' && value <= rule.max;
          break;
      }

      if (!isValid) {
        errors.push(message || `Validation failed for ${field}`);
      }
    }

    if (errors.length > 0) {
      return {
        success: onFailure === 'continue',
        error: errors.join(', '),
        output: { errors },
      };
    }

    return {
      success: true,
      output: { valid: true },
    };
  }

  private async executeNavigation(node: WorkflowNode, config: any): Promise<NodeExecutionResult> {
    const { targetPage, params = {}, mode = 'navigate' } = config;

    if (!targetPage) {
      return { success: false, error: 'targetPage is required' };
    }

    const resolvedParams = this.resolveVariables(params);
    const queryString = new URLSearchParams(resolvedParams).toString();

    switch (mode) {
      case 'navigate':
        window.location.href = `/pages/${targetPage}?${queryString}`;
        break;
      case 'modal':
        // TODO: 实现模态框导航
        console.log('Modal navigation not implemented yet');
        break;
      case 'drawer':
        // TODO: 实现抽屉导航
        console.log('Drawer navigation not implemented yet');
        break;
    }

    return {
      success: true,
      output: { targetPage, params: resolvedParams },
    };
  }

  private async executeHttp(node: WorkflowNode, config: any): Promise<NodeExecutionResult> {
    const { method = 'GET', url, headers = {}, body } = config;

    if (!url) {
      return { success: false, error: 'url is required' };
    }

    try {
      const resolvedUrl = this.resolveVariables(url);
      const resolvedHeaders = this.resolveVariables(headers);
      const resolvedBody = body ? this.resolveVariables(body) : undefined;

      const response = await fetch(resolvedUrl, {
        method,
        headers: resolvedHeaders,
        body: resolvedBody ? JSON.stringify(resolvedBody) : undefined,
      });

      const result = await response.json();

      return {
        success: response.ok,
        output: result,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  private async executeCode(node: WorkflowNode, config: any): Promise<NodeExecutionResult> {
    const { language = 'javascript', code } = config;

    if (!code) {
      return { success: false, error: 'code is required' };
    }

    try {
      if (language === 'javascript') {
        // 创建沙箱环境
        const sandbox = {
          context: this.context,
          variables: this.context.variables,
          console,
        };

        // 执行代码
        const func = new Function(...Object.keys(sandbox), code);
        const result = func(...Object.values(sandbox));

        return {
          success: true,
          output: result,
        };
      } else {
        return {
          success: false,
          error: `Unsupported language: ${language}`,
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  private async executeDelay(node: WorkflowNode, config: any): Promise<NodeExecutionResult> {
    const { duration = 1000 } = config;

    await new Promise((resolve) => setTimeout(resolve, duration));

    return {
      success: true,
      output: { delayed: duration },
    };
  }

  // ===== 辅助方法 =====

  // 获取节点的下一个节点
  private getNextNodes(nodeId: string): string[] {
    return this.definition.edges
      .filter((e) => e.source === nodeId)
      .map((e) => e.target);
  }

  // 解析变量（递归替换对象中的变量引用）
  private resolveVariables(value: any): any {
    if (typeof value === 'string') {
      // 替换 {{variable}} 格式的变量
      return value.replace(/\{\{([^}]+)\}\}/g, (_, varName) => {
        return this.context.variables[varName.trim()] ?? '';
      });
    } else if (Array.isArray(value)) {
      return value.map((item) => this.resolveVariables(item));
    } else if (typeof value === 'object' && value !== null) {
      const resolved: any = {};
      for (const key in value) {
        resolved[key] = this.resolveVariables(value[key]);
      }
      return resolved;
    }
    return value;
  }

  // 评估表达式
  private evaluateExpression(expression: string): any {
    try {
      // 创建沙箱环境
      const sandbox = {
        ...this.context.variables,
        context: this.context,
      };

      // 执行表达式
      const func = new Function(...Object.keys(sandbox), `return ${expression}`);
      return func(...Object.values(sandbox));
    } catch (error) {
      console.error('Expression evaluation failed:', error);
      return false;
    }
  }

  // 获取执行状态
  getStatus(): ExecutionStatus {
    return this.status;
  }

  // 获取节点状态
  getNodeStatus(nodeId: string): NodeStatus {
    return this.nodeStatuses.get(nodeId) || 'pending';
  }

  // 获取上下文
  getContext(): ExecutionContext {
    return this.context;
  }
}

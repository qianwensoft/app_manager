// ============================================
// EventWorkflowBridge - 事件与工作流的桥接器
// ============================================

import { EventManager } from '../events/EventManager';
import { WorkflowRunner } from '../workflow/WorkflowRunner';
import type { WorkflowDefinition } from '@lowcode/schema';

/**
 * 工作流注册表 - 存储可用的工作流定义
 */
class WorkflowRegistry {
  private workflows: Map<string, WorkflowDefinition> = new Map();

  register(workflow: WorkflowDefinition): void {
    this.workflows.set(workflow.id, workflow);
  }

  unregister(workflowId: string): void {
    this.workflows.delete(workflowId);
  }

  get(workflowId: string): WorkflowDefinition | undefined {
    return this.workflows.get(workflowId);
  }

  getAll(): WorkflowDefinition[] {
    return Array.from(this.workflows.values());
  }

  clear(): void {
    this.workflows.clear();
  }
}

export const workflowRegistry = new WorkflowRegistry();

/**
 * 事件工作流桥接器 - 监听 workflow:start 事件并执行工作流
 */
class EventWorkflowBridgeClass {
  private isInitialized = false;
  private runningWorkflows: Map<string, WorkflowRunner> = new Map();

  /**
   * 初始化桥接器
   */
  initialize(): void {
    if (this.isInitialized) {
      return;
    }

    // 监听工作流启动事件
    EventManager.on('workflow:start', async (payload) => {
      const { workflowId, trigger } = payload.data || {};

      if (!workflowId) {
        console.error('workflow:start event missing workflowId');
        return;
      }

      await this.executeWorkflow(workflowId, trigger);
    });

    this.isInitialized = true;
    console.log('EventWorkflowBridge initialized');
  }

  /**
   * 执行工作流
   */
  async executeWorkflow(
    workflowId: string,
    triggerPayload?: any
  ): Promise<boolean> {
    // 从注册表获取工作流定义
    const definition = workflowRegistry.get(workflowId);

    if (!definition) {
      console.error(`Workflow ${workflowId} not found in registry`);
      await EventManager.emit('workflow:error', {
        workflowId,
        error: 'Workflow not found',
      });
      return false;
    }

    // 检查是否已在运行
    if (this.runningWorkflows.has(workflowId)) {
      console.warn(`Workflow ${workflowId} is already running`);
      return false;
    }

    try {
      // 创建工作流运行器
      const runner = new WorkflowRunner(definition, {
        variables: {
          trigger: triggerPayload,
          timestamp: Date.now(),
        },
      });

      // 注册到运行中列表
      this.runningWorkflows.set(workflowId, runner);

      // 设置事件监听器
      runner.on('nodeStart', (nodeId) => {
        console.log(`[Workflow ${workflowId}] Node ${nodeId} started`);
      });

      runner.on('nodeComplete', (nodeId, result) => {
        console.log(
          `[Workflow ${workflowId}] Node ${nodeId} completed:`,
          result.success ? 'success' : 'failed'
        );
      });

      runner.on('complete', (success) => {
        console.log(
          `[Workflow ${workflowId}] Workflow completed:`,
          success ? 'success' : 'failed'
        );
        // 从运行中列表移除
        this.runningWorkflows.delete(workflowId);
      });

      // 执行工作流
      const success = await runner.execute();

      return success;
    } catch (error) {
      console.error(`Error executing workflow ${workflowId}:`, error);
      this.runningWorkflows.delete(workflowId);

      await EventManager.emit('workflow:error', {
        workflowId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return false;
    }
  }

  /**
   * 取消运行中的工作流
   */
  cancelWorkflow(workflowId: string): boolean {
    const runner = this.runningWorkflows.get(workflowId);
    if (!runner) {
      return false;
    }

    // WorkflowRunner 暂时没有 cancel 方法，这里先从列表移除
    this.runningWorkflows.delete(workflowId);
    console.log(`Workflow ${workflowId} cancelled`);

    return true;
  }

  /**
   * 获取运行中的工作流
   */
  getRunningWorkflows(): string[] {
    return Array.from(this.runningWorkflows.keys());
  }

  /**
   * 检查工作流是否在运行
   */
  isWorkflowRunning(workflowId: string): boolean {
    return this.runningWorkflows.has(workflowId);
  }

  /**
   * 重置桥接器
   */
  reset(): void {
    this.runningWorkflows.clear();
    this.isInitialized = false;
  }
}

export const EventWorkflowBridge = new EventWorkflowBridgeClass();

/**
 * 便捷函数：注册工作流并初始化桥接器
 */
export function registerWorkflow(workflow: WorkflowDefinition): void {
  workflowRegistry.register(workflow);
  EventWorkflowBridge.initialize();
}

/**
 * 便捷函数：批量注册工作流
 */
export function registerWorkflows(workflows: WorkflowDefinition[]): void {
  workflows.forEach((workflow) => workflowRegistry.register(workflow));
  EventWorkflowBridge.initialize();
}

/**
 * 便捷函数：取消注册工作流
 */
export function unregisterWorkflow(workflowId: string): void {
  workflowRegistry.unregister(workflowId);
}

/**
 * 便捷函数：触发工作流（通过事件）
 */
export async function triggerWorkflow(
  workflowId: string,
  data?: any
): Promise<void> {
  await EventManager.emit('workflow:start', {
    workflowId,
    trigger: {
      type: 'manual',
      data,
      timestamp: Date.now(),
    },
  });
}

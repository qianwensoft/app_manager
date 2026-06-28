/**
 * 工作流模板库
 *
 * 提供常用的工作流模板，用户可以基于这些模板快速创建工作流
 */

import type { WorkflowDefinition } from '@lowcode/schema';

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: 'form' | 'data' | 'integration' | 'automation';
  icon: string;
  definition: WorkflowDefinition;
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'simple-form-submit',
    name: '简单表单提交',
    description: '表单提交 → 数据接口保存 → 导航到结果页',
    category: 'form',
    icon: '📝',
    definition: {
      nodes: [
        {
          id: 'start',
          type: 'start',
          label: '开始',
          config: {},
        },
        {
          id: 'form-submit',
          type: 'formSubmit',
          label: '提交表单',
          config: {
            formContainerId: 'mainForm',
            onSuccess: 'continue',
            onError: 'stop',
          },
        },
        {
          id: 'save-data',
          type: 'dataInterface',
          label: '保存数据',
          config: {
            interfaceCode: 'save_form_data',
            params: {
              data: '{{formSubmitResult}}',
            },
            resultVariable: 'saveResult',
          },
        },
        {
          id: 'navigate',
          type: 'navigation',
          label: '跳转到结果页',
          config: {
            targetPage: 'result',
            params: {
              id: '{{saveResult.id}}',
            },
            mode: 'navigate',
          },
        },
        {
          id: 'end',
          type: 'end',
          label: '结束',
          config: {},
        },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'form-submit' },
        { id: 'e2', source: 'form-submit', target: 'save-data' },
        { id: 'e3', source: 'save-data', target: 'navigate' },
        { id: 'e4', source: 'navigate', target: 'end' },
      ],
      variables: {},
      triggers: [],
    },
  },

  {
    id: 'form-validation-submit',
    name: '表单验证提交',
    description: '表单提交 → 数据验证 → 保存 → 通知',
    category: 'form',
    icon: '✅',
    definition: {
      nodes: [
        {
          id: 'start',
          type: 'start',
          label: '开始',
          config: {},
        },
        {
          id: 'form-submit',
          type: 'formSubmit',
          label: '提交表单',
          config: {
            formContainerId: 'mainForm',
            onSuccess: 'continue',
            onError: 'stop',
          },
        },
        {
          id: 'validate',
          type: 'validation',
          label: '数据验证',
          config: {
            rules: [
              { field: 'email', type: 'email', message: '邮箱格式不正确' },
              { field: 'age', type: 'min', min: 18, message: '年龄必须大于18' },
            ],
            onFailure: 'stop',
          },
        },
        {
          id: 'save-data',
          type: 'dataInterface',
          label: '保存数据',
          config: {
            interfaceCode: 'save_form_data',
            params: {
              data: '{{formSubmitResult}}',
            },
            resultVariable: 'saveResult',
          },
        },
        {
          id: 'notify',
          type: 'http',
          label: '发送通知',
          config: {
            method: 'POST',
            url: 'https://api.example.com/notify',
            headers: {
              'Content-Type': 'application/json',
            },
            body: {
              message: '表单提交成功',
              data: '{{saveResult}}',
            },
          },
        },
        {
          id: 'end',
          type: 'end',
          label: '结束',
          config: {},
        },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'form-submit' },
        { id: 'e2', source: 'form-submit', target: 'validate' },
        { id: 'e3', source: 'validate', target: 'save-data' },
        { id: 'e4', source: 'save-data', target: 'notify' },
        { id: 'e5', source: 'notify', target: 'end' },
      ],
      variables: {},
      triggers: [],
    },
  },

  {
    id: 'data-sync',
    name: '数据同步',
    description: '读取数据 → 转换 → 同步到外部系统',
    category: 'data',
    icon: '🔄',
    definition: {
      nodes: [
        {
          id: 'start',
          type: 'start',
          label: '开始',
          config: {},
        },
        {
          id: 'fetch-data',
          type: 'dataInterface',
          label: '获取数据',
          config: {
            interfaceCode: 'get_pending_records',
            params: {},
            resultVariable: 'records',
          },
        },
        {
          id: 'transform',
          type: 'code',
          label: '数据转换',
          config: {
            language: 'javascript',
            code: `
              const records = variables.records;
              return records.map(r => ({
                id: r.id,
                name: r.name,
                timestamp: new Date().toISOString()
              }));
            `,
          },
        },
        {
          id: 'sync',
          type: 'outboundConnector',
          label: '同步到外部系统',
          config: {
            connectorId: 'external_system',
            method: 'POST',
            params: {
              records: '{{transform}}',
            },
          },
        },
        {
          id: 'end',
          type: 'end',
          label: '结束',
          config: {},
        },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'fetch-data' },
        { id: 'e2', source: 'fetch-data', target: 'transform' },
        { id: 'e3', source: 'transform', target: 'sync' },
        { id: 'e4', source: 'sync', target: 'end' },
      ],
      variables: {},
      triggers: [],
    },
  },

  {
    id: 'conditional-routing',
    name: '条件路由',
    description: '根据数据条件执行不同的处理逻辑',
    category: 'automation',
    icon: '❓',
    definition: {
      nodes: [
        {
          id: 'start',
          type: 'start',
          label: '开始',
          config: {},
        },
        {
          id: 'fetch-order',
          type: 'dataInterface',
          label: '获取订单',
          config: {
            interfaceCode: 'get_order',
            params: {
              orderId: '{{orderId}}',
            },
            resultVariable: 'order',
          },
        },
        {
          id: 'check-amount',
          type: 'condition',
          label: '检查金额',
          config: {
            expression: 'order.amount > 1000',
          },
        },
        {
          id: 'high-value',
          type: 'http',
          label: '高价值订单处理',
          config: {
            method: 'POST',
            url: 'https://api.example.com/high-value-order',
            body: { order: '{{order}}' },
          },
        },
        {
          id: 'normal-value',
          type: 'http',
          label: '普通订单处理',
          config: {
            method: 'POST',
            url: 'https://api.example.com/normal-order',
            body: { order: '{{order}}' },
          },
        },
        {
          id: 'end',
          type: 'end',
          label: '结束',
          config: {},
        },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'fetch-order' },
        { id: 'e2', source: 'fetch-order', target: 'check-amount' },
        { id: 'e3', source: 'check-amount', target: 'high-value', label: 'true' },
        { id: 'e4', source: 'check-amount', target: 'normal-value', label: 'false' },
        { id: 'e5', source: 'high-value', target: 'end' },
        { id: 'e6', source: 'normal-value', target: 'end' },
      ],
      variables: {},
      triggers: [],
    },
  },

  {
    id: 'batch-processing',
    name: '批量处理',
    description: '循环处理多条记录',
    category: 'data',
    icon: '📊',
    definition: {
      nodes: [
        {
          id: 'start',
          type: 'start',
          label: '开始',
          config: {},
        },
        {
          id: 'fetch-list',
          type: 'dataInterface',
          label: '获取列表',
          config: {
            interfaceCode: 'get_pending_list',
            params: {},
            resultVariable: 'items',
          },
        },
        {
          id: 'loop',
          type: 'loop',
          label: '循环处理',
          config: {
            itemsVariable: 'items',
            itemVariable: 'item',
            indexVariable: 'index',
          },
        },
        {
          id: 'process-item',
          type: 'dataInterface',
          label: '处理单项',
          config: {
            interfaceCode: 'process_item',
            params: {
              item: '{{item}}',
              index: '{{index}}',
            },
            resultVariable: 'processResult',
          },
        },
        {
          id: 'end',
          type: 'end',
          label: '结束',
          config: {},
        },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'fetch-list' },
        { id: 'e2', source: 'fetch-list', target: 'loop' },
        { id: 'e3', source: 'loop', target: 'process-item' },
        { id: 'e4', source: 'process-item', target: 'end' },
      ],
      variables: {},
      triggers: [],
    },
  },

  {
    id: 'api-integration',
    name: 'API 集成',
    description: 'HTTP 请求 → 数据转换 → 保存结果',
    category: 'integration',
    icon: '🌐',
    definition: {
      nodes: [
        {
          id: 'start',
          type: 'start',
          label: '开始',
          config: {},
        },
        {
          id: 'fetch-api',
          type: 'http',
          label: '调用外部 API',
          config: {
            method: 'GET',
            url: 'https://api.example.com/data',
            headers: {
              'Authorization': 'Bearer {{apiToken}}',
            },
          },
        },
        {
          id: 'transform',
          type: 'code',
          label: '数据转换',
          config: {
            language: 'javascript',
            code: `
              const apiData = variables.fetch_api;
              return {
                items: apiData.results.map(r => ({
                  id: r.id,
                  title: r.name,
                  createdAt: new Date().toISOString()
                }))
              };
            `,
          },
        },
        {
          id: 'save',
          type: 'dataInterface',
          label: '保存到数据库',
          config: {
            interfaceCode: 'bulk_insert',
            params: {
              items: '{{transform.items}}',
            },
            resultVariable: 'saveResult',
          },
        },
        {
          id: 'end',
          type: 'end',
          label: '结束',
          config: {},
        },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'fetch-api' },
        { id: 'e2', source: 'fetch-api', target: 'transform' },
        { id: 'e3', source: 'transform', target: 'save' },
        { id: 'e4', source: 'save', target: 'end' },
      ],
      variables: {},
      triggers: [],
    },
  },
];

// 根据分类获取模板
export function getTemplatesByCategory(category: string): WorkflowTemplate[] {
  return WORKFLOW_TEMPLATES.filter((t) => t.category === category);
}

// 根据 ID 获取模板
export function getTemplateById(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.id === id);
}

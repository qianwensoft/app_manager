import React from 'react';
import { useWorkflowStore } from '../store/workflowStore';
import type { WorkflowNodeType } from '../store/workflowStore';

export const NodeInspector: React.FC = () => {
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const nodes = useWorkflowStore((s) => s.nodes);
  const updateNodeConfig = useWorkflowStore((s) => s.updateNodeConfig);
  const updateNodeLabel = useWorkflowStore((s) => s.updateNodeLabel);
  const deleteNode = useWorkflowStore((s) => s.deleteNode);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  if (!selectedNode) {
    return (
      <div className="w-80 bg-white border-l border-gray-200 p-4">
        <div className="text-sm text-gray-500 text-center mt-8">
          选择一个节点以查看其属性
        </div>
      </div>
    );
  }

  const { data } = selectedNode;
  const { nodeType, label, config } = data;

  const handleLabelChange = (newLabel: string) => {
    updateNodeLabel(selectedNode.id, newLabel);
  };

  const handleConfigChange = (key: string, value: any) => {
    updateNodeConfig(selectedNode.id, { [key]: value });
  };

  const handleDelete = () => {
    if (confirm('确定要删除此节点吗？')) {
      deleteNode(selectedNode.id);
    }
  };

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col h-full">
      <div className="flex-1 overflow-y-scroll p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700">节点属性</h3>
          <button
            onClick={handleDelete}
            className="text-red-600 hover:text-red-700 text-sm"
            title="删除节点"
          >
            🗑️ 删除
          </button>
        </div>

        {/* Node Type */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">节点类型</label>
          <div className="text-sm text-gray-900 bg-gray-50 px-3 py-2 rounded">
            {nodeType}
          </div>
        </div>

        {/* Label */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">节点名称</label>
          <input
            type="text"
            value={label}
            onChange={(e) => handleLabelChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Node-specific config */}
        <div className="border-t border-gray-200 pt-4">
          <h4 className="text-xs font-medium text-gray-600 mb-3">节点配置</h4>
          <NodeConfigFields
            nodeType={nodeType}
            config={config}
            onChange={handleConfigChange}
          />
        </div>
      </div>
    </div>
  );
};

interface NodeConfigFieldsProps {
  nodeType: WorkflowNodeType;
  config: Record<string, any>;
  onChange: (key: string, value: any) => void;
}

const NodeConfigFields: React.FC<NodeConfigFieldsProps> = ({ nodeType, config, onChange }) => {
  switch (nodeType) {
    case 'start':
    case 'end':
      return <div className="text-sm text-gray-500">此节点无需配置</div>;

    case 'formSubmit':
      return (
        <>
          <FormField label="表单容器 ID">
            <input
              type="text"
              value={config.formContainerId || ''}
              onChange={(e) => onChange('formContainerId', e.target.value)}
              placeholder="输入表单容器的 ID"
              className="config-input"
            />
          </FormField>
          <FormField label="成功时">
            <select
              value={config.onSuccess || 'continue'}
              onChange={(e) => onChange('onSuccess', e.target.value)}
              className="config-input"
            >
              <option value="continue">继续执行</option>
              <option value="stop">停止</option>
              <option value="redirect">跳转</option>
            </select>
          </FormField>
          <FormField label="失败时">
            <select
              value={config.onError || 'stop'}
              onChange={(e) => onChange('onError', e.target.value)}
              className="config-input"
            >
              <option value="continue">继续执行</option>
              <option value="stop">停止</option>
              <option value="retry">重试</option>
            </select>
          </FormField>
        </>
      );

    case 'dataInterface':
      return (
        <>
          <FormField label="接口代码">
            <input
              type="text"
              value={config.interfaceCode || ''}
              onChange={(e) => onChange('interfaceCode', e.target.value)}
              placeholder="data_interface_code"
              className="config-input"
            />
          </FormField>
          <FormField label="结果变量名">
            <input
              type="text"
              value={config.resultVariable || 'result'}
              onChange={(e) => onChange('resultVariable', e.target.value)}
              placeholder="result"
              className="config-input"
            />
          </FormField>
          <FormField label="参数 (JSON)">
            <textarea
              value={JSON.stringify(config.params || {}, null, 2)}
              onChange={(e) => {
                try {
                  const params = JSON.parse(e.target.value);
                  onChange('params', params);
                } catch {}
              }}
              rows={4}
              className="config-input font-mono text-xs"
            />
          </FormField>
        </>
      );

    case 'outboundConnector':
      return (
        <>
          <FormField label="连接器 ID">
            <input
              type="text"
              value={config.connectorId || ''}
              onChange={(e) => onChange('connectorId', e.target.value)}
              placeholder="connector_id"
              className="config-input"
            />
          </FormField>
          <FormField label="HTTP 方法">
            <select
              value={config.method || 'POST'}
              onChange={(e) => onChange('method', e.target.value)}
              className="config-input"
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
          </FormField>
          <FormField label="参数 (JSON)">
            <textarea
              value={JSON.stringify(config.params || {}, null, 2)}
              onChange={(e) => {
                try {
                  const params = JSON.parse(e.target.value);
                  onChange('params', params);
                } catch {}
              }}
              rows={4}
              className="config-input font-mono text-xs"
            />
          </FormField>
        </>
      );

    case 'condition':
      return (
        <>
          <FormField label="条件表达式">
            <input
              type="text"
              value={config.expression || ''}
              onChange={(e) => onChange('expression', e.target.value)}
              placeholder="例如: data.age > 18"
              className="config-input font-mono text-xs"
            />
          </FormField>
          <div className="text-xs text-gray-500 mt-2">
            支持 JavaScript 表达式，可使用变量 data, context
          </div>
        </>
      );

    case 'loop':
      return (
        <>
          <FormField label="循环数组变量">
            <input
              type="text"
              value={config.itemsVariable || ''}
              onChange={(e) => onChange('itemsVariable', e.target.value)}
              placeholder="items"
              className="config-input"
            />
          </FormField>
          <FormField label="单项变量名">
            <input
              type="text"
              value={config.itemVariable || 'item'}
              onChange={(e) => onChange('itemVariable', e.target.value)}
              placeholder="item"
              className="config-input"
            />
          </FormField>
          <FormField label="索引变量名">
            <input
              type="text"
              value={config.indexVariable || 'index'}
              onChange={(e) => onChange('indexVariable', e.target.value)}
              placeholder="index"
              className="config-input"
            />
          </FormField>
        </>
      );

    case 'navigation':
      return (
        <>
          <FormField label="目标页面">
            <input
              type="text"
              value={config.targetPage || ''}
              onChange={(e) => onChange('targetPage', e.target.value)}
              placeholder="page_code"
              className="config-input"
            />
          </FormField>
          <FormField label="导航模式">
            <select
              value={config.mode || 'navigate'}
              onChange={(e) => onChange('mode', e.target.value)}
              className="config-input"
            >
              <option value="navigate">页面跳转</option>
              <option value="modal">弹窗</option>
              <option value="drawer">抽屉</option>
            </select>
          </FormField>
          <FormField label="参数 (JSON)">
            <textarea
              value={JSON.stringify(config.params || {}, null, 2)}
              onChange={(e) => {
                try {
                  const params = JSON.parse(e.target.value);
                  onChange('params', params);
                } catch {}
              }}
              rows={3}
              className="config-input font-mono text-xs"
            />
          </FormField>
        </>
      );

    case 'http':
      return (
        <>
          <FormField label="HTTP 方法">
            <select
              value={config.method || 'GET'}
              onChange={(e) => onChange('method', e.target.value)}
              className="config-input"
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
              <option value="PATCH">PATCH</option>
            </select>
          </FormField>
          <FormField label="URL">
            <input
              type="text"
              value={config.url || ''}
              onChange={(e) => onChange('url', e.target.value)}
              placeholder="https://api.example.com/endpoint"
              className="config-input"
            />
          </FormField>
          <FormField label="请求头 (JSON)">
            <textarea
              value={JSON.stringify(config.headers || {}, null, 2)}
              onChange={(e) => {
                try {
                  const headers = JSON.parse(e.target.value);
                  onChange('headers', headers);
                } catch {}
              }}
              rows={3}
              className="config-input font-mono text-xs"
            />
          </FormField>
          <FormField label="请求体">
            <textarea
              value={config.body || ''}
              onChange={(e) => onChange('body', e.target.value)}
              rows={4}
              className="config-input font-mono text-xs"
            />
          </FormField>
        </>
      );

    case 'code':
      return (
        <>
          <FormField label="编程语言">
            <select
              value={config.language || 'javascript'}
              onChange={(e) => onChange('language', e.target.value)}
              className="config-input"
            >
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
            </select>
          </FormField>
          <FormField label="代码">
            <textarea
              value={config.code || ''}
              onChange={(e) => onChange('code', e.target.value)}
              rows={8}
              placeholder="// 输入代码"
              className="config-input font-mono text-xs"
            />
          </FormField>
        </>
      );

    case 'llm':
      return (
        <>
          <FormField label="模型">
            <input
              type="text"
              value={config.model || 'claude-3-5-sonnet-20241022'}
              onChange={(e) => onChange('model', e.target.value)}
              className="config-input"
            />
          </FormField>
          <FormField label="系统提示">
            <textarea
              value={config.systemPrompt || ''}
              onChange={(e) => onChange('systemPrompt', e.target.value)}
              rows={3}
              placeholder="系统提示词"
              className="config-input text-xs"
            />
          </FormField>
          <FormField label="用户提示模板">
            <textarea
              value={config.userPromptTemplate || ''}
              onChange={(e) => onChange('userPromptTemplate', e.target.value)}
              rows={4}
              placeholder="用户提示词模板，使用 {{variable}} 插入变量"
              className="config-input text-xs"
            />
          </FormField>
          <FormField label="Temperature">
            <input
              type="number"
              min="0"
              max="1"
              step="0.1"
              value={config.temperature || 0.7}
              onChange={(e) => onChange('temperature', parseFloat(e.target.value))}
              className="config-input"
            />
          </FormField>
        </>
      );

    case 'delay':
      return (
        <FormField label="延迟时间 (毫秒)">
          <input
            type="number"
            min="0"
            value={config.duration || 1000}
            onChange={(e) => onChange('duration', parseInt(e.target.value))}
            className="config-input"
          />
        </FormField>
      );

    case 'validation':
      return (
        <>
          <FormField label="验证规则 (JSON)">
            <textarea
              value={JSON.stringify(config.rules || [], null, 2)}
              onChange={(e) => {
                try {
                  const rules = JSON.parse(e.target.value);
                  onChange('rules', rules);
                } catch {}
              }}
              rows={6}
              placeholder='[{"field": "email", "type": "email"}]'
              className="config-input font-mono text-xs"
            />
          </FormField>
          <FormField label="验证失败时">
            <select
              value={config.onFailure || 'stop'}
              onChange={(e) => onChange('onFailure', e.target.value)}
              className="config-input"
            >
              <option value="stop">停止执行</option>
              <option value="continue">继续执行</option>
            </select>
          </FormField>
        </>
      );

    case 'parallel':
      return (
        <FormField label="等待所有分支完成">
          <input
            type="checkbox"
            checked={config.waitAll !== false}
            onChange={(e) => onChange('waitAll', e.target.checked)}
            className="mr-2"
          />
          <span className="text-sm text-gray-700">
            {config.waitAll !== false ? '是' : '否'}
          </span>
        </FormField>
      );

    case 'merge':
      return (
        <FormField label="合并策略">
          <select
            value={config.strategy || 'first'}
            onChange={(e) => onChange('strategy', e.target.value)}
            className="config-input"
          >
            <option value="first">第一个完成</option>
            <option value="all">全部完成</option>
            <option value="race">竞速模式</option>
          </select>
        </FormField>
      );

    default:
      return (
        <div className="text-sm text-gray-500">
          此节点类型暂无配置项
        </div>
      );
  }
};

interface FormFieldProps {
  label: string;
  children: React.ReactNode;
}

const FormField: React.FC<FormFieldProps> = ({ label, children }) => {
  return (
    <div className="mb-3">
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
};

import React from 'react';
import type { WorkflowNodeType } from '../store/workflowStore';

interface NodePaletteProps {
  onAddNode: (type: WorkflowNodeType) => void;
}

interface NodeTypeInfo {
  type: WorkflowNodeType;
  label: string;
  icon: string;
  description: string;
  category: 'control' | 'form' | 'data' | 'integration' | 'logic';
}

const NODE_TYPES: NodeTypeInfo[] = [
  // Control
  { type: 'start', label: '开始', icon: '▶️', description: '工作流起点', category: 'control' },
  { type: 'end', label: '结束', icon: '⏹️', description: '工作流终点', category: 'control' },
  { type: 'delay', label: '延迟', icon: '⏱️', description: '延迟执行', category: 'control' },

  // Form
  { type: 'formSubmit', label: '表单提交', icon: '📝', description: '提交表单数据', category: 'form' },
  { type: 'validation', label: '数据验证', icon: '✅', description: '验证数据有效性', category: 'form' },

  // Data
  { type: 'dataInterface', label: '数据接口', icon: '🔌', description: '调用数据接口', category: 'data' },
  { type: 'code', label: '代码执行', icon: '💻', description: '执行自定义代码', category: 'data' },

  // Integration
  { type: 'outboundConnector', label: '外部连接器', icon: '🌐', description: '调用外部系统', category: 'integration' },
  { type: 'http', label: 'HTTP 请求', icon: '📡', description: 'HTTP API 调用', category: 'integration' },
  { type: 'llm', label: 'LLM 调用', icon: '🤖', description: '调用大语言模型', category: 'integration' },

  // Logic
  { type: 'condition', label: '条件判断', icon: '❓', description: '条件分支', category: 'logic' },
  { type: 'loop', label: '循环', icon: '🔄', description: '循环执行', category: 'logic' },
  { type: 'parallel', label: '并行执行', icon: '⚡', description: '并行分支', category: 'logic' },
  { type: 'merge', label: '合并', icon: '🔀', description: '合并多个分支', category: 'logic' },
  { type: 'navigation', label: '页面导航', icon: '🧭', description: '跳转到其他页面', category: 'logic' },
];

const CATEGORY_LABELS: Record<string, string> = {
  control: '控制',
  form: '表单',
  data: '数据',
  integration: '集成',
  logic: '逻辑',
};

export const NodePalette: React.FC<NodePaletteProps> = ({ onAddNode }) => {
  const categories = ['control', 'form', 'data', 'integration', 'logic'] as const;

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-full">
      <div className="p-4 border-b border-gray-200 flex-shrink-0">
        <h3 className="text-sm font-semibold text-gray-700">节点库</h3>
      </div>

      <div className="flex-1 overflow-y-scroll p-4">
        {categories.map((category) => {
          const nodes = NODE_TYPES.filter((n) => n.category === category);
          if (nodes.length === 0) return null;

          return (
            <div key={category} className="mb-4">
              <h4 className="text-xs font-medium text-gray-500 mb-2 uppercase">
                {CATEGORY_LABELS[category]}
              </h4>
              <div className="space-y-1">
                {nodes.map((node) => (
                  <button
                    key={node.type}
                    onClick={() => onAddNode(node.type)}
                    className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-gray-100 transition-colors text-left group"
                    title={node.description}
                  >
                    <span className="text-lg">{node.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
                        {node.label}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {node.description}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

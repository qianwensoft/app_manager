import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import type { WorkflowNodeData } from '../store/workflowStore';

// 节点类型图标映射
const NODE_ICONS: Record<string, string> = {
  start: '▶️',
  end: '⏹️',
  formSubmit: '📝',
  dataInterface: '🔌',
  outboundConnector: '🌐',
  condition: '❓',
  loop: '🔄',
  validation: '✅',
  navigation: '🧭',
  http: '📡',
  code: '💻',
  llm: '🤖',
  delay: '⏱️',
  parallel: '⚡',
  merge: '🔀',
};

// 节点类型颜色映射
const NODE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  start: { bg: 'bg-green-50', border: 'border-green-400', text: 'text-green-700' },
  end: { bg: 'bg-red-50', border: 'border-red-400', text: 'text-red-700' },
  formSubmit: { bg: 'bg-blue-50', border: 'border-blue-400', text: 'text-blue-700' },
  dataInterface: { bg: 'bg-purple-50', border: 'border-purple-400', text: 'text-purple-700' },
  outboundConnector: { bg: 'bg-cyan-50', border: 'border-cyan-400', text: 'text-cyan-700' },
  condition: { bg: 'bg-yellow-50', border: 'border-yellow-400', text: 'text-yellow-700' },
  loop: { bg: 'bg-orange-50', border: 'border-orange-400', text: 'text-orange-700' },
  validation: { bg: 'bg-emerald-50', border: 'border-emerald-400', text: 'text-emerald-700' },
  navigation: { bg: 'bg-indigo-50', border: 'border-indigo-400', text: 'text-indigo-700' },
  http: { bg: 'bg-pink-50', border: 'border-pink-400', text: 'text-pink-700' },
  code: { bg: 'bg-slate-50', border: 'border-slate-400', text: 'text-slate-700' },
  llm: { bg: 'bg-violet-50', border: 'border-violet-400', text: 'text-violet-700' },
  delay: { bg: 'bg-amber-50', border: 'border-amber-400', text: 'text-amber-700' },
  parallel: { bg: 'bg-teal-50', border: 'border-teal-400', text: 'text-teal-700' },
  merge: { bg: 'bg-lime-50', border: 'border-lime-400', text: 'text-lime-700' },
};

// 状态指示器颜色
const STATUS_COLORS: Record<string, string> = {
  idle: 'bg-gray-300',
  running: 'bg-blue-500 animate-pulse',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
};

export const WorkflowNode = memo(({ data, selected }: NodeProps) => {
  const { nodeType, label, status = 'idle' } = data as any;
  const colors = NODE_COLORS[nodeType] || NODE_COLORS.formSubmit;
  const icon = NODE_ICONS[nodeType] || '📦';

  return (
    <div
      className={`
        min-w-[180px] rounded-xl border-2 shadow-lg transition-all bg-white
        ${selected ? 'ring-4 ring-blue-400 ring-offset-2' : 'ring-1 ring-gray-200'}
        hover:shadow-xl
      `}
      style={{
        borderColor: selected ? '#3b82f6' : colors.border.replace('border-', '').replace('-400', ''),
      }}
    >
      {/* Source Handle (top) */}
      {nodeType !== 'start' && (
        <Handle
          type="target"
          position={Position.Top}
          className="w-3 h-3 !bg-gray-400 border-2 border-white shadow-sm"
        />
      )}

      {/* Node Content */}
      <div className={`px-4 py-3 rounded-t-xl ${colors.bg}`}>
        <div className="flex items-center gap-2">
          <span className="text-2xl">{icon}</span>
          <div className="flex-1">
            <div className={`font-semibold text-base ${colors.text}`}>{label}</div>
            <div className="text-xs text-gray-500 mt-0.5">{nodeType}</div>
          </div>
          {/* Status Indicator */}
          <div
            className={`w-3 h-3 rounded-full ${STATUS_COLORS[status]} shadow-sm`}
            title={status}
          />
        </div>
      </div>

      {/* Target Handle (bottom) */}
      {nodeType !== 'end' && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="w-3 h-3 !bg-gray-400 border-2 border-white shadow-sm"
        />
      )}

      {/* Condition node has multiple outputs */}
      {nodeType === 'condition' && (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            className="w-3 h-3 !bg-green-500 border-2 border-white shadow-sm"
            style={{ top: '40%' }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="false"
            className="w-3 h-3 !bg-red-500 border-2 border-white shadow-sm"
            style={{ top: '60%' }}
          />
        </>
      )}
    </div>
  );
});

WorkflowNode.displayName = 'WorkflowNode';

import React, { useState } from 'react';
import { WorkflowRunner } from './WorkflowRunner';
import type { WorkflowDefinition } from '@lowcode/schema';

interface WorkflowExecutorProps {
  definition: WorkflowDefinition;
  onClose: () => void;
}

export const WorkflowExecutor: React.FC<WorkflowExecutorProps> = ({ definition, onClose }) => {
  const [executing, setExecuting] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const addLog = (message: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const handleExecute = async () => {
    setExecuting(true);
    setLogs([]);
    setNodeStatuses({});
    setResult(null);

    addLog('开始执行工作流...');

    // 创建工作流执行器
    const runner = new WorkflowRunner(definition, {
      variables: {},
      formData: {},
      config: {},
    });

    // 监听节点开始
    runner.on('nodeStart', (nodeId) => {
      const node = definition.nodes.find((n) => n.id === nodeId);
      addLog(`开始执行节点: ${node?.label || nodeId} (${node?.type})`);
      setNodeStatuses((prev) => ({ ...prev, [nodeId]: 'running' }));
    });

    // 监听节点完成
    runner.on('nodeComplete', (nodeId, result) => {
      const node = definition.nodes.find((n) => n.id === nodeId);
      if (result.success) {
        addLog(`✅ 节点完成: ${node?.label || nodeId}`);
        if (result.output) {
          addLog(`   输出: ${JSON.stringify(result.output)}`);
        }
        setNodeStatuses((prev) => ({ ...prev, [nodeId]: 'completed' }));
      } else {
        addLog(`❌ 节点失败: ${node?.label || nodeId} - ${result.error}`);
        setNodeStatuses((prev) => ({ ...prev, [nodeId]: 'failed' }));
      }
    });

    // 监听工作流完成
    runner.on('complete', (success) => {
      if (success) {
        addLog('✅ 工作流执行成功！');
        setResult({ success: true, message: '工作流执行成功' });
      } else {
        addLog('❌ 工作流执行失败');
        setResult({ success: false, message: '工作流执行失败' });
      }
      setExecuting(false);
    });

    // 执行工作流
    try {
      await runner.execute();
    } catch (error: any) {
      addLog(`❌ 执行出错: ${error.message}`);
      setResult({ success: false, message: error.message });
      setExecuting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[800px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">工作流执行</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={executing}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Node Statuses */}
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-sm font-medium text-gray-700 mb-2">节点状态</h3>
            <div className="flex flex-wrap gap-2">
              {definition.nodes.map((node) => {
                const status = nodeStatuses[node.id] || 'pending';
                const statusColors = {
                  pending: 'bg-gray-100 text-gray-600',
                  running: 'bg-blue-100 text-blue-700 animate-pulse',
                  completed: 'bg-green-100 text-green-700',
                  failed: 'bg-red-100 text-red-700',
                };

                return (
                  <div
                    key={node.id}
                    className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[status]}`}
                  >
                    {node.label || node.id}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Logs */}
          <div className="flex-1 overflow-y-auto px-6 py-4 bg-gray-50">
            <div className="font-mono text-xs space-y-1">
              {logs.map((log, index) => (
                <div
                  key={index}
                  className={
                    log.includes('❌')
                      ? 'text-red-600'
                      : log.includes('✅')
                      ? 'text-green-600'
                      : 'text-gray-700'
                  }
                >
                  {log}
                </div>
              ))}
              {logs.length === 0 && (
                <div className="text-gray-400 text-center py-8">
                  点击"开始执行"按钮运行工作流
                </div>
              )}
            </div>
          </div>

          {/* Result */}
          {result && (
            <div
              className={`px-6 py-3 border-t ${
                result.success
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              }`}
            >
              <div
                className={`text-sm font-medium ${
                  result.success ? 'text-green-800' : 'text-red-800'
                }`}
              >
                {result.message}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
            disabled={executing}
          >
            关闭
          </button>
          <button
            onClick={handleExecute}
            disabled={executing}
            className="px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-md disabled:opacity-50"
          >
            {executing ? '执行中...' : '开始执行'}
          </button>
        </div>
      </div>
    </div>
  );
};

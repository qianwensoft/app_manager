import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  BackgroundVariant,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useWorkflowStore } from '../store/workflowStore';
import { WorkflowNode } from '../components/WorkflowNode';
import { NodePalette } from '../components/NodePalette';
import { NodeInspector } from '../components/NodeInspector';
import { WorkflowExecutor } from '../workflow/WorkflowExecutor';
import { WorkflowEventTrigger } from '../components/WorkflowEventTrigger';
import type { WorkflowNodeType } from '../store/workflowStore';
import { workflowApi } from '../api/client';

const nodeTypes: NodeTypes = {
  default: WorkflowNode as any,
};

export const WorkflowEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showExecutor, setShowExecutor] = useState(false);
  const [showEventTrigger, setShowEventTrigger] = useState(false);

  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const onNodesChange = useWorkflowStore((s) => s.onNodesChange);
  const onEdgesChange = useWorkflowStore((s) => s.onEdgesChange);
  const onConnect = useWorkflowStore((s) => s.onConnect);
  const addNode = useWorkflowStore((s) => s.addNode);
  const selectNode = useWorkflowStore((s) => s.selectNode);
  const loadWorkflow = useWorkflowStore((s) => s.loadWorkflow);
  const toWorkflowDefinition = useWorkflowStore((s) => s.toWorkflowDefinition);
  const setWorkflowMetadata = useWorkflowStore((s) => s.setWorkflowMetadata);
  const workflowName = useWorkflowStore((s) => s.workflowName);
  const clearGraph = useWorkflowStore((s) => s.clearGraph);
  const exportWorkflow = useWorkflowStore((s) => s.exportWorkflow);
  const importWorkflow = useWorkflowStore((s) => s.importWorkflow);
  const execution = useWorkflowStore((s) => s.execution);
  const startExecution = useWorkflowStore((s) => s.startExecution);
  const stopExecution = useWorkflowStore((s) => s.stopExecution);

  // 加载工作流
  useEffect(() => {
    if (id && id !== 'new') {
      workflowApi.get(parseInt(id))
        .then((data) => {
          setWorkflowMetadata(data.id, data.name, data.description || '');
          if (data.workflow_def) {
            loadWorkflow(JSON.parse(data.workflow_def));
          }
        })
        .catch((err) => {
          console.error('Failed to load workflow:', err);
          alert(`加载工作流失败: ${err instanceof Error ? err.message : '未知错误'}`);
        });
    } else if (id === 'new') {
      clearGraph();
      setWorkflowMetadata('', '新工作流', '');
    }
  }, [id]);

  const handleAddNode = useCallback(
    (type: WorkflowNodeType) => {
      addNode(type, { x: 300 + Math.random() * 200, y: 200 + Math.random() * 150 });
    },
    [addNode]
  );

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: any) => {
      selectNode(node.id);
    },
    [selectNode]
  );

  const handlePaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  const handleSave = async () => {
    const definition = toWorkflowDefinition();
    const payload = {
      name: workflowName,
      description: '',
      code: `workflow_${Date.now()}`, // 添加必需的 code 字段
      workflow_def: JSON.stringify(definition),
    };

    try {
      let saved;
      if (id && id !== 'new') {
        // 更新现有工作流
        saved = await workflowApi.update(parseInt(id), payload);
      } else {
        // 创建新工作流
        saved = await workflowApi.create(payload);
      }

      alert('工作流保存成功！');

      // 如果是新创建的，导航到编辑页面
      if (id === 'new' && saved.id) {
        navigate(`/workflows/${saved.id}`, { replace: true });
      }
    } catch (error) {
      console.error('Failed to save workflow:', error);
      alert(`保存失败: ${error instanceof Error ? error.message : '请重试'}`);
    }
  };

  const handleExport = () => {
    const json = exportWorkflow();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workflow-${workflowName || 'export'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const json = event.target?.result as string;
        try {
          importWorkflow(json);
          alert('导入成功！');
        } catch (error) {
          console.error('Failed to import workflow:', error);
          alert('导入失败，JSON 格式不正确');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleRun = () => {
    setShowExecutor(true);
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Toolbar */}
      <div className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/workflows')}
            className="text-gray-600 hover:text-gray-900"
          >
            ← 返回
          </button>
          <h1 className="text-lg font-semibold text-gray-900">{workflowName}</h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowEventTrigger(!showEventTrigger)}
            className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
          >
            ⚡ 事件触发器
          </button>
          <button
            onClick={handleImport}
            className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
          >
            📥 导入
          </button>
          <button
            onClick={handleExport}
            className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
          >
            📤 导出
          </button>
          <button
            onClick={handleRun}
            className={`px-3 py-1.5 text-sm text-white rounded-md ${
              execution?.status === 'running'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {execution?.status === 'running' ? '⏹️ 停止' : '▶️ 运行'}
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-md"
          >
            💾 保存
          </button>
        </div>
      </div>

      {/* Main Editor */}
      <div className="flex-1 flex min-h-0">
        {/* Node Palette */}
        <NodePalette onAddNode={handleAddNode} />

        {/* Canvas */}
        <div className="flex-1 bg-gray-50 relative">
          <ReactFlow
            nodes={nodes as any}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={handleNodeClick}
            onPaneClick={handlePaneClick}
            nodeTypes={nodeTypes}
            fitView
            attributionPosition="bottom-right"
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
            <Controls />
            <MiniMap
              nodeStrokeWidth={3}
              zoomable
              pannable
              className="!bg-white !border-2 !border-gray-300 !rounded-lg !shadow-lg"
              style={{
                width: 200,
                height: 150,
                bottom: 80,
                right: 10
              }}
              nodeColor={(node) => {
                const nodeType = (node.data as any)?.nodeType;
                const colors: Record<string, string> = {
                  start: '#86efac',
                  end: '#fca5a5',
                  formSubmit: '#93c5fd',
                  dataInterface: '#c4b5fd',
                  outboundConnector: '#a5f3fc',
                  condition: '#fde047',
                  loop: '#fdba74',
                  validation: '#6ee7b7',
                  navigation: '#a5b4fc',
                  http: '#f9a8d4',
                  code: '#cbd5e1',
                  llm: '#ddd6fe',
                  delay: '#fcd34d',
                  parallel: '#5eead4',
                  merge: '#d9f99d',
                };
                return colors[nodeType] || '#93c5fd';
              }}
            />
          </ReactFlow>

          {/* Event Trigger Panel (Overlay) */}
          {showEventTrigger && id && id !== 'new' && (
            <div className="absolute top-4 right-4 w-96 max-h-[calc(100vh-200px)] overflow-auto bg-white rounded-lg shadow-xl z-10">
              <WorkflowEventTrigger
                workflowId={id}
                onSave={() => {
                  // 可选：保存后刷新或提示
                }}
              />
            </div>
          )}
        </div>

        {/* Node Inspector */}
        <NodeInspector />
      </div>

      {/* Workflow Executor Modal */}
      {showExecutor && (
        <WorkflowExecutor
          definition={toWorkflowDefinition()}
          onClose={() => setShowExecutor(false)}
        />
      )}

      {/* Execution Status Bar */}
      {execution && (
        <div
          className={`h-10 flex items-center px-4 text-sm ${
            execution.status === 'running'
              ? 'bg-blue-50 text-blue-700'
              : execution.status === 'completed'
              ? 'bg-green-50 text-green-700'
              : execution.status === 'failed'
              ? 'bg-red-50 text-red-700'
              : 'bg-gray-50 text-gray-700'
          }`}
        >
          <span className="font-medium">
            执行状态:{' '}
            {execution.status === 'running'
              ? '运行中...'
              : execution.status === 'completed'
              ? '已完成'
              : execution.status === 'failed'
              ? '失败'
              : '已取消'}
          </span>
          {execution.error && (
            <span className="ml-4 text-xs">错误: {execution.error}</span>
          )}
        </div>
      )}
    </div>
  );
};

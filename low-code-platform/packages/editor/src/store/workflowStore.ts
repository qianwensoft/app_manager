import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from '@xyflow/react';
import type { WorkflowDefinition, WorkflowNode } from '@lowcode/schema';

// 工作流节点类型（扩展自 workflow-engine 标准节点）
export type WorkflowNodeType =
  | 'start'
  | 'end'
  | 'formSubmit'      // 表单提交
  | 'dataInterface'   // 数据接口调用
  | 'outboundConnector' // 外部连接器
  | 'condition'       // 条件判断
  | 'loop'            // 循环
  | 'validation'      // 数据验证
  | 'navigation'      // 页面导航
  | 'http'            // HTTP 请求
  | 'code'            // 代码执行
  | 'llm'             // LLM 调用
  | 'delay'           // 延迟
  | 'parallel'        // 并行执行
  | 'merge';          // 合并节点

// React Flow 节点数据
export interface WorkflowNodeData extends Record<string, any> {
  nodeType: WorkflowNodeType;
  label: string;
  config: Record<string, any>;
  status?: 'idle' | 'running' | 'completed' | 'failed';
  output?: any;
}

export type RFNode = Node<WorkflowNodeData>;
export type RFEdge = Edge;

// 工作流执行状态
export interface ExecutionState {
  id: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  nodeStates: Record<string, { status: string; output?: any }>;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

interface WorkflowStore {
  // 图数据
  nodes: RFNode[];
  edges: RFEdge[];
  selectedNodeId: string | null;

  // 工作流元数据
  workflowId: string | null;
  workflowName: string;
  workflowDescription: string;

  // 执行状态
  execution: ExecutionState | null;

  // 图操作
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (type: WorkflowNodeType, position: { x: number; y: number }) => void;
  updateNodeConfig: (id: string, config: Record<string, any>) => void;
  updateNodeLabel: (id: string, label: string) => void;
  deleteNode: (id: string) => void;
  selectNode: (id: string | null) => void;
  clearGraph: () => void;

  // 工作流操作
  setWorkflowMetadata: (id: string, name: string, description: string) => void;
  loadWorkflow: (definition: WorkflowDefinition) => void;
  toWorkflowDefinition: () => WorkflowDefinition;

  // 执行控制
  startExecution: () => Promise<void>;
  stopExecution: () => Promise<void>;
  setExecutionState: (state: ExecutionState | null) => void;

  // 导入导出
  exportWorkflow: () => string;
  importWorkflow: (json: string) => void;
}

let nodeCounter = 0;
const generateNodeId = () => `node-${Date.now()}-${++nodeCounter}`;

// 节点类型默认配置
const DEFAULT_NODE_CONFIG: Record<WorkflowNodeType, any> = {
  start: {},
  end: {},
  formSubmit: {
    formContainerId: '',
    onSuccess: 'continue',
    onError: 'stop',
  },
  dataInterface: {
    interfaceCode: '',
    params: {},
    resultVariable: 'result',
  },
  outboundConnector: {
    connectorId: '',
    method: 'POST',
    params: {},
  },
  condition: {
    expression: '',
    branches: [
      { id: 'true', label: 'True', condition: 'true' },
      { id: 'false', label: 'False', condition: 'false' },
    ],
  },
  loop: {
    itemsVariable: '',
    itemVariable: 'item',
    indexVariable: 'index',
  },
  validation: {
    rules: [],
    onFailure: 'stop',
  },
  navigation: {
    targetPage: '',
    params: {},
    mode: 'navigate', // navigate | modal | drawer
  },
  http: {
    method: 'GET',
    url: '',
    headers: {},
    body: '',
  },
  code: {
    language: 'javascript',
    code: '',
    inputVariables: [],
    outputVariables: [],
  },
  llm: {
    model: 'claude-3-5-sonnet-20241022',
    systemPrompt: '',
    userPromptTemplate: '',
    temperature: 0.7,
  },
  delay: {
    duration: 1000, // ms
  },
  parallel: {
    branches: [],
    waitAll: true,
  },
  merge: {
    strategy: 'first', // first | all | race
  },
};

// 节点类型默认标签
const DEFAULT_NODE_LABELS: Record<WorkflowNodeType, string> = {
  start: '开始',
  end: '结束',
  formSubmit: '表单提交',
  dataInterface: '数据接口',
  outboundConnector: '外部连接器',
  condition: '条件判断',
  loop: '循环',
  validation: '数据验证',
  navigation: '页面导航',
  http: 'HTTP 请求',
  code: '代码执行',
  llm: 'LLM 调用',
  delay: '延迟',
  parallel: '并行执行',
  merge: '合并',
};

export const useWorkflowStore = create<WorkflowStore>()(
  immer((set, get) => ({
    // 初始状态
    nodes: [],
    edges: [],
    selectedNodeId: null,
    workflowId: null,
    workflowName: '未命名工作流',
    workflowDescription: '',
    execution: null,

    // 图操作
    onNodesChange: (changes) => {
      set((state) => {
        state.nodes = applyNodeChanges(changes, state.nodes) as RFNode[];
      });
    },

    onEdgesChange: (changes) => {
      set((state) => {
        state.edges = applyEdgeChanges(changes, state.edges);
      });
    },

    onConnect: (connection) => {
      set((state) => {
        state.edges = addEdge(connection, state.edges);
      });
    },

    addNode: (type, position) => {
      const id = generateNodeId();
      const newNode: RFNode = {
        id,
        type: 'default',
        position,
        data: {
          nodeType: type,
          label: DEFAULT_NODE_LABELS[type],
          config: { ...DEFAULT_NODE_CONFIG[type] },
        },
      };

      set((state) => {
        state.nodes.push(newNode);
        state.selectedNodeId = id;
      });
    },

    updateNodeConfig: (id, config) => {
      set((state) => {
        const node = state.nodes.find((n) => n.id === id);
        if (node) {
          node.data.config = { ...node.data.config, ...config };
        }
      });
    },

    updateNodeLabel: (id, label) => {
      set((state) => {
        const node = state.nodes.find((n) => n.id === id);
        if (node) {
          node.data.label = label;
        }
      });
    },

    deleteNode: (id) => {
      set((state) => {
        state.nodes = state.nodes.filter((n) => n.id !== id);
        state.edges = state.edges.filter((e) => e.source !== id && e.target !== id);
        if (state.selectedNodeId === id) {
          state.selectedNodeId = null;
        }
      });
    },

    selectNode: (id) => {
      set((state) => {
        state.selectedNodeId = id;
      });
    },

    clearGraph: () => {
      set((state) => {
        state.nodes = [];
        state.edges = [];
        state.selectedNodeId = null;
        state.execution = null;
      });
    },

    // 工作流操作
    setWorkflowMetadata: (id, name, description) => {
      set((state) => {
        state.workflowId = id;
        state.workflowName = name;
        state.workflowDescription = description;
      });
    },

    loadWorkflow: (definition) => {
      set((state) => {
        // 转换工作流定义为 React Flow 节点
        state.nodes = definition.nodes.map((node: any, index: number) => ({
          id: node.id,
          type: 'default',
          position: { x: 100 + index * 200, y: 100 + Math.floor(index / 5) * 150 },
          data: {
            nodeType: node.type as WorkflowNodeType,
            label: node.label || DEFAULT_NODE_LABELS[node.type as WorkflowNodeType] || node.type,
            config: node.config || {},
          },
        })) as RFNode[];

        // 转换边
        state.edges = definition.edges.map((edge: any) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: edge.label,
        }));

        state.selectedNodeId = null;
        state.execution = null;
      });
    },

    toWorkflowDefinition: () => {
      const state = get();
      const nodes: WorkflowNode[] = state.nodes.map((node) => ({
        id: node.id,
        type: node.data.nodeType,
        label: node.data.label,
        config: node.data.config,
      }));

      const edges = state.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label as string | undefined,
      }));

      return {
        nodes,
        edges,
        variables: {},
        triggers: [],
      };
    },

    // 执行控制
    startExecution: async () => {
      const state = get();
      if (!state.workflowId) {
        console.error('No workflow ID set');
        return;
      }

      try {
        const response = await fetch(`/api/lowcode/workflows/${state.workflowId}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            definition: state.toWorkflowDefinition(),
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to start execution');
        }

        const execution = await response.json();
        set((state) => {
          state.execution = execution;
        });
      } catch (error) {
        console.error('Failed to start execution:', error);
      }
    },

    stopExecution: async () => {
      const state = get();
      if (!state.execution) return;

      try {
        await fetch(`/api/lowcode/workflows/executions/${state.execution.id}/cancel`, {
          method: 'POST',
        });

        set((state) => {
          if (state.execution) {
            state.execution.status = 'cancelled';
          }
        });
      } catch (error) {
        console.error('Failed to stop execution:', error);
      }
    },

    setExecutionState: (state) => {
      set((s) => {
        s.execution = state;
      });
    },

    // 导入导出
    exportWorkflow: () => {
      const state = get();
      const definition = state.toWorkflowDefinition();
      return JSON.stringify(
        {
          metadata: {
            id: state.workflowId,
            name: state.workflowName,
            description: state.workflowDescription,
          },
          definition,
        },
        null,
        2
      );
    },

    importWorkflow: (json) => {
      try {
        const data = JSON.parse(json);
        const { metadata, definition } = data;

        set((state) => {
          if (metadata) {
            state.workflowId = metadata.id;
            state.workflowName = metadata.name;
            state.workflowDescription = metadata.description;
          }
          get().loadWorkflow(definition);
        });
      } catch (error) {
        console.error('Failed to import workflow:', error);
      }
    },
  }))
);

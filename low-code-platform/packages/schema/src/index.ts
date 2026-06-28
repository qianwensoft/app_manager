// ============================================
// Low-Code Platform Schema Definitions
// ============================================

// ===== Page Schema =====

export interface LowCodePage {
  id: number;
  code: string;
  name: string;
  category: 'form' | 'dashboard' | 'workflow' | 'custom';
  puckState: PuckState;
  workflowDef?: WorkflowDefinition;
  dataSourceId?: number;
  publishStatus: 0 | 1; // 0=草稿 1=已发布
  version: number;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

export interface PuckState {
  content: PuckComponent[];
  root: PuckRoot;
  zones?: Record<string, PuckComponent[]>;
}

export interface PuckComponent {
  type: string;
  props: Record<string, any>;
}

export interface PuckRoot {
  props?: Record<string, any>;
  title?: string;
}

// ===== Component Schema =====

export interface ComponentDefinition {
  type: string;
  label: string;
  category: 'layout' | 'form' | 'data' | 'business';
  fields: Record<string, FieldDefinition>;
  defaultProps?: Record<string, any>;
  render?: string; // 组件渲染代码
}

export interface FieldDefinition {
  type: 'text' | 'number' | 'select' | 'custom';
  label: string;
  required?: boolean;
  defaultValue?: any;
  options?: Array<{ label: string; value: any }>;
  render?: (props: any) => any;
}

// ===== Formily Integration =====

export interface FormilyFieldComponent extends PuckComponent {
  type: 'FormilyField';
  props: {
    fieldSchema: FormilyFieldSchema;
    fieldKey: string;
  };
}

export interface FormilyFieldSchema {
  type: string;
  title?: string;
  'x-component'?: string;
  'x-component-props'?: Record<string, any>;
  'x-decorator'?: string;
  'x-decorator-props'?: Record<string, any>;
  'x-validator'?: any;
  'x-reactions'?: any;
  properties?: Record<string, FormilyFieldSchema>;
}

// ===== Workflow Schema =====

export interface WorkflowDefinition {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: WorkflowNodeData;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface WorkflowNodeData {
  label: string;
  config: Record<string, any>;
}

// ===== Extended Workflow Nodes =====

// DataInterface 节点
export interface DataInterfaceNodeConfig {
  interface_code: string;
  params: Record<string, any>; // 支持 JSONPath 表达式
  output_mapping?: Record<string, string>;
}

// OutboundConnector 节点
export interface OutboundConnectorNodeConfig {
  connector_id: number;
  event_type: string;
  data_mapping: Record<string, string>; // JSONPath 映射
}

// FormSubmit 节点
export interface FormSubmitNodeConfig {
  dataset_id: number;
  interface_code: string;
  validation_rules?: any[];
  success_action?: 'navigate' | 'message' | 'workflow';
  success_target?: string;
}

// ===== Event Schema =====

export interface LowCodeEvent {
  id: number;
  pageId: number;
  eventType: 'lifecycle' | 'user_interaction' | 'data_event' | 'external';
  triggerType: string; // mounted | clicked | changed | scanned | mqtt | webhook
  workflowId?: number;
  workflowEnabled: boolean;
  priority: number;
  enabled: boolean;
}

export interface EventRoute {
  id: number;
  formAppId: number;
  eventType: string; // barcode | qrcode | nfc | custom
  matcherType: 'prefix' | 'regex' | 'exact' | 'all';
  matcherValue: string;
  targetPageKey: string;
  workflowId?: number;
  priority: number;
  enabled: boolean;
}

// ===== DataStack Integration =====

export interface DataSourceReference {
  id: number;
  type: 'mysql' | 'postgresql' | 'sqlite' | 'http';
  name: string;
  isReadOnly: boolean;
}

export interface DatasetReference {
  id: number;
  code: string;
  kind: 'query' | 'buffer' | 'transaction' | 'static';
  dataSourceId: number;
}

export interface DataInterfaceReference {
  id: number;
  code: string;
  slug?: string;
  kind: 'query' | 'queryOne' | 'mutation';
  datasetId: number;
  paramDefaults?: Record<string, any>;
}

// ===== Collaboration Schema =====

export interface CollabSession {
  id: number;
  pageId: number;
  userId: number;
  sessionId: string;
  yjsClientId: number;
  joinedAt: string;
  lastSeenAt: string;
}

// ===== AI Generation =====

export interface AIGenerateRequest {
  prompt: string;
  dataSourceId: number;
  mode: 'quick' | 'full';
  screenshot?: string; // base64 image
}

export interface AIGenerateResponse {
  puckState: PuckState;
  formilySchemas: Record<string, FormilyFieldSchema>;
  workflowDef: WorkflowDefinition;
  dataInterfaces: DataInterfaceReference[];
  eventRoutes: EventRoute[];
}

// ===== Auto Generation =====

export interface AutoGenerateFromTableRequest {
  dataSourceId: number;
  table: string;
  primaryKey: string;
  mode: 'select_schema' | 'create_schema';
  options?: {
    generateList?: boolean;
    generateDetail?: boolean;
    generateForm?: boolean;
    autoWorkflow?: boolean;
  };
}

export interface AutoGenerateFromTableResponse {
  pages: LowCodePage[];
  datasets: DatasetReference[];
  dataInterfaces: DataInterfaceReference[];
  workflows?: WorkflowDefinition[];
}

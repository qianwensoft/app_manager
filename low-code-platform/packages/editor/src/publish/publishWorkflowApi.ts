import type { PublishTarget } from './types';

// ==================== 通用请求封装 ====================

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`,
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || error.message || response.statusText);
  }

  return response.json();
}

// ==================== 类型定义 ====================

/**
 * 发布状态
 */
export type PublishStatus =
  | 'pending'     // 待发布
  | 'checking'    // 检查中
  | 'ready'       // 准备就绪
  | 'publishing'  // 发布中
  | 'success'     // 发布成功
  | 'failed'      // 发布失败
  | 'rolled_back' // 已回滚
  | 'rolling_back'; // 回滚中

/**
 * 检查项类型
 */
export type CheckItemType = 'version' | 'environment' | 'build' | 'dependencies' | 'permissions';

/**
 * 检查项状态
 */
export type CheckStatus = 'pending' | 'checking' | 'passed' | 'warning' | 'failed';

/**
 * 发布检查项
 */
export interface PublishCheckItem {
  type: CheckItemType;
  name: string;
  status: CheckStatus;
  message?: string;
  details?: any;
}

/**
 * 发布配置
 */
export interface PublishConfig {
  id: number;
  appId: number;
  versionId: number;
  versionNumber: string;
  environmentId: number;
  environment: PublishTarget;
  buildId?: number;
  autoRollback: boolean;
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
  prePublishChecks: CheckItemType[];
  createdAt: string;
  updatedAt: string;
}

/**
 * 创建发布配置请求
 */
export interface CreatePublishConfigRequest {
  versionId: number;
  environmentId: number;
  buildId?: number;
  autoRollback?: boolean;
  notifyOnSuccess?: boolean;
  notifyOnFailure?: boolean;
  prePublishChecks?: CheckItemType[];
}

/**
 * 更新发布配置请求
 */
export interface UpdatePublishConfigRequest {
  versionId?: number;
  environmentId?: number;
  buildId?: number;
  autoRollback?: boolean;
  notifyOnSuccess?: boolean;
  notifyOnFailure?: boolean;
  prePublishChecks?: CheckItemType[];
}

/**
 * 发布前检查结果
 */
export interface PrePublishCheckResult {
  configId: number;
  appId: number;
  overallStatus: CheckStatus;
  checks: PublishCheckItem[];
  canPublish: boolean;
  warnings: string[];
  errors: string[];
  checkedAt: string;
}

/**
 * 发布执行请求
 */
export interface ExecutePublishRequest {
  configId: number;
  skipChecks?: boolean;
  deployNotes?: string;
}

/**
 * 发布记录
 */
export interface PublishRecord {
  id: number;
  appId: number;
  configId: number;
  versionId: number;
  versionNumber: string;
  environmentId: number;
  environment: PublishTarget;
  buildId?: number;
  status: PublishStatus;
  deployNotes?: string;
  checkResult?: PrePublishCheckResult;
  startedAt: string;
  completedAt?: string;
  duration?: number;
  publishedBy: string;
  rollbackFromId?: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 发布进度
 */
export interface PublishProgress {
  recordId: number;
  status: PublishStatus;
  progress: number;
  currentStep: string;
  totalSteps: number;
  completedSteps: number;
  message?: string;
  startedAt: string;
  estimatedCompletion?: string;
}

/**
 * 回滚请求
 */
export interface RollbackRequest {
  recordId: number;
  reason?: string;
}

/**
 * 发布统计
 */
export interface PublishStatistics {
  appId: number;
  totalPublishes: number;
  successCount: number;
  failureCount: number;
  rollbackCount: number;
  averageDuration: number;
  lastPublishAt?: string;
  environments: {
    [key in PublishTarget]?: {
      count: number;
      successRate: number;
      lastPublishAt?: string;
    };
  };
}

// ==================== API 方法 ====================

const API_BASE = '/api/publish';

/**
 * 获取应用的发布配置列表
 */
export async function listPublishConfigs(appId: number): Promise<PublishConfig[]> {
  return request<PublishConfig[]>(`${API_BASE}/apps/${appId}/configs`);
}

/**
 * 获取发布配置详情
 */
export async function getPublishConfig(configId: number): Promise<PublishConfig> {
  return request<PublishConfig>(`${API_BASE}/configs/${configId}`);
}

/**
 * 创建发布配置
 */
export async function createPublishConfig(
  appId: number,
  data: CreatePublishConfigRequest
): Promise<PublishConfig> {
  return request<PublishConfig>(`${API_BASE}/apps/${appId}/configs`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * 更新发布配置
 */
export async function updatePublishConfig(
  configId: number,
  data: UpdatePublishConfigRequest
): Promise<PublishConfig> {
  return request<PublishConfig>(`${API_BASE}/configs/${configId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/**
 * 删除发布配置
 */
export async function deletePublishConfig(configId: number): Promise<void> {
  return request<void>(`${API_BASE}/configs/${configId}`, {
    method: 'DELETE',
  });
}

/**
 * 执行发布前检查
 */
export async function executePrePublishCheck(configId: number): Promise<PrePublishCheckResult> {
  return request<PrePublishCheckResult>(`${API_BASE}/configs/${configId}/check`, {
    method: 'POST',
  });
}

/**
 * 执行发布
 */
export async function executePublish(data: ExecutePublishRequest): Promise<PublishRecord> {
  return request<PublishRecord>(`${API_BASE}/execute`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * 获取发布记录列表
 */
export async function listPublishRecords(
  appId: number,
  params?: {
    environment?: PublishTarget;
    status?: PublishStatus;
    limit?: number;
    offset?: number;
  }
): Promise<{ records: PublishRecord[]; total: number }> {
  const queryParams = new URLSearchParams();
  if (params?.environment) queryParams.append('environment', params.environment);
  if (params?.status) queryParams.append('status', params.status);
  if (params?.limit) queryParams.append('limit', params.limit.toString());
  if (params?.offset) queryParams.append('offset', params.offset.toString());

  const queryString = queryParams.toString();
  const url = queryString ? `${API_BASE}/apps/${appId}/records?${queryString}` : `${API_BASE}/apps/${appId}/records`;

  return request<{ records: PublishRecord[]; total: number }>(url);
}

/**
 * 获取发布记录详情
 */
export async function getPublishRecord(recordId: number): Promise<PublishRecord> {
  return request<PublishRecord>(`${API_BASE}/records/${recordId}`);
}

/**
 * 获取发布进度
 */
export async function getPublishProgress(recordId: number): Promise<PublishProgress> {
  return request<PublishProgress>(`${API_BASE}/records/${recordId}/progress`);
}

/**
 * 取消发布
 */
export async function cancelPublish(recordId: number): Promise<void> {
  return request<void>(`${API_BASE}/records/${recordId}/cancel`, {
    method: 'POST',
  });
}

/**
 * 执行回滚
 */
export async function executeRollback(data: RollbackRequest): Promise<PublishRecord> {
  return request<PublishRecord>(`${API_BASE}/rollback`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * 快速回滚到上一个成功版本
 */
export async function quickRollback(appId: number, environment: PublishTarget): Promise<PublishRecord> {
  return request<PublishRecord>(`${API_BASE}/apps/${appId}/quick-rollback`, {
    method: 'POST',
    body: JSON.stringify({ environment }),
  });
}

/**
 * 获取发布统计数据
 */
export async function getPublishStatistics(appId: number): Promise<PublishStatistics> {
  return request<PublishStatistics>(`${API_BASE}/apps/${appId}/statistics`);
}

/**
 * 获取环境当前运行的版本
 */
export async function getCurrentVersion(
  appId: number,
  environment: PublishTarget
): Promise<{ versionId: number; versionNumber: string; publishedAt: string } | null> {
  const queryParams = new URLSearchParams({ environment });
  return request<{ versionId: number; versionNumber: string; publishedAt: string } | null>(
    `${API_BASE}/apps/${appId}/current-version?${queryParams}`
  );
}

/**
 * 重新运行发布
 */
export async function retryPublish(recordId: number): Promise<PublishRecord> {
  return request<PublishRecord>(`${API_BASE}/records/${recordId}/retry`, {
    method: 'POST',
  });
}

/**
 * 获取发布日志
 */
export async function getPublishLogs(recordId: number): Promise<string[]> {
  return request<string[]>(`${API_BASE}/records/${recordId}/logs`);
}

async function createPublishWorkflow(
  appId: number,
  data: { version: string; environment: string; notes: string }
): Promise<{ workflowId: string }> {
  return request<{ workflowId: string }>(`${API_BASE}/apps/${appId}/workflow`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export const publishWorkflowApi = {
  listPublishConfigs,
  getPublishConfig,
  createPublishConfig,
  updatePublishConfig,
  deletePublishConfig,
  executePrePublishCheck,
  executePublish,
  listPublishRecords,
  getPublishRecord,
  getPublishProgress,
  cancelPublish,
  executeRollback,
  quickRollback,
  getPublishStatistics,
  getCurrentVersion,
  retryPublish,
  getPublishLogs,
  createPublishWorkflow,
};

export default publishWorkflowApi;

/**
 * Phase 5: 应用发布 - 构建 API
 *
 * 提供应用构建管理接口
 */

import type {
  AppBuild,
  CreateBuildRequest,
  BuildFilters,
  PaginatedResponse,
  BuildLogEntry,
  PublishRequest,
  PublishRecord,
} from './types';

const BASE_URL = '/api/apps';

// 通用请求封装
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
    throw new Error(error.error || 'Request failed');
  }

  const data = await response.json();
  return data.data || data;
}

/**
 * 构建 API 服务
 */
export const buildApi = {
  /**
   * 获取应用的构建列表
   */
  async list(appId: number, filters?: BuildFilters): Promise<PaginatedResponse<AppBuild>> {
    const params = new URLSearchParams();

    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.pageSize) params.append('pageSize', filters.pageSize.toString());
    if (filters?.sortBy) params.append('sortBy', filters.sortBy);
    if (filters?.sortOrder) params.append('sortOrder', filters.sortOrder);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.buildType) params.append('buildType', filters.buildType);
    if (filters?.version) params.append('version', filters.version);

    const response = await request<PaginatedResponse<AppBuild>>(
      `${BASE_URL}/${appId}/builds?${params.toString()}`
    );
    return response;
  },

  /**
   * 获取构建详情
   */
  async get(appId: number, buildId: number): Promise<AppBuild> {
    const response = await request<AppBuild>(
      `${BASE_URL}/${appId}/builds/${buildId}`
    );
    return response;
  },

  /**
   * 创建新构建
   */
  async create(appId: number, data: CreateBuildRequest): Promise<AppBuild> {
    const response = await request<AppBuild>(
      `${BASE_URL}/${appId}/builds`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return response;
  },

  /**
   * 取消构建
   */
  async cancel(appId: number, buildId: number): Promise<AppBuild> {
    const response = await request<AppBuild>(
      `${BASE_URL}/${appId}/builds/${buildId}/cancel`,
      { method: 'POST' }
    );
    return response;
  },

  /**
   * 删除构建
   */
  async delete(appId: number, buildId: number): Promise<void> {
    await request(`${BASE_URL}/${appId}/builds/${buildId}`, {
      method: 'DELETE',
    });
  },

  /**
   * 重试构建
   */
  async retry(appId: number, buildId: number): Promise<AppBuild> {
    const response = await request<AppBuild>(
      `${BASE_URL}/${appId}/builds/${buildId}/retry`,
      { method: 'POST' }
    );
    return response;
  },

  /**
   * 获取构建日志
   */
  async getLogs(appId: number, buildId: number): Promise<BuildLogEntry[]> {
    const response = await request<BuildLogEntry[]>(
      `${BASE_URL}/${appId}/builds/${buildId}/logs`
    );
    return response;
  },

  /**
   * 流式获取构建日志（SSE）
   */
  streamLogs(
    appId: number,
    buildId: number,
    onLog: (log: BuildLogEntry) => void,
    onError?: (error: Error) => void,
    onComplete?: () => void
  ): () => void {
    const token = localStorage.getItem('token');
    const eventSource = new EventSource(
      `${BASE_URL}/${appId}/builds/${buildId}/logs/stream?token=${token}`
    );

    eventSource.onmessage = (event) => {
      try {
        const log = JSON.parse(event.data) as BuildLogEntry;
        onLog(log);
      } catch (error) {
        console.error('Failed to parse log entry:', error);
      }
    };

    eventSource.onerror = (error) => {
      eventSource.close();
      if (onError) {
        onError(new Error('Stream connection error'));
      }
    };

    eventSource.addEventListener('complete', () => {
      eventSource.close();
      if (onComplete) {
        onComplete();
      }
    });

    // 返回取消函数
    return () => {
      eventSource.close();
    };
  },

  /**
   * 获取构建产物下载 URL
   */
  async getDownloadUrl(appId: number, buildId: number): Promise<{ url: string }> {
    const response = await request<{ url: string }>(
      `${BASE_URL}/${appId}/builds/${buildId}/download-url`
    );
    return response;
  },

  /**
   * 下载构建产物
   */
  async download(appId: number, buildId: number): Promise<Blob> {
    const response = await fetch(
      `${BASE_URL}/${appId}/builds/${buildId}/download`,
      {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to download build artifact');
    }

    return response.blob();
  },

  /**
   * 获取构建统计
   */
  async getStats(appId: number): Promise<{
    totalBuilds: number;
    successBuilds: number;
    failedBuilds: number;
    averageDuration: number;
    totalSize: number;
    buildsByType: Record<string, number>;
    buildsByStatus: Record<string, number>;
  }> {
    const response = await request(
      `${BASE_URL}/${appId}/builds/stats`
    );
    return response;
  },

  /**
   * 批量删除构建
   */
  async batchDelete(appId: number, buildIds: number[]): Promise<void> {
    await request(`${BASE_URL}/${appId}/builds/batch-delete`, {
      method: 'POST',
      body: JSON.stringify({ ids: buildIds }),
    });
  },

  /**
   * 清理旧构建（保留最近 N 个）
   */
  async cleanup(appId: number, keepCount: number = 10): Promise<{ deleted: number }> {
    const response = await request<{ deleted: number }>(
      `${BASE_URL}/${appId}/builds/cleanup`,
      {
        method: 'POST',
        body: JSON.stringify({ keepCount }),
      }
    );
    return response;
  },
};

/**
 * 发布 API 服务
 */
export const publishApi = {
  /**
   * 发布应用
   */
  async publish(appId: number, data: PublishRequest): Promise<PublishRecord> {
    const response = await request<PublishRecord>(
      `${BASE_URL}/${appId}/publish`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return response;
  },

  /**
   * 获取发布历史
   */
  async getHistory(appId: number): Promise<PublishRecord[]> {
    const response = await request<PublishRecord[]>(
      `${BASE_URL}/${appId}/publish-history`
    );
    return response;
  },

  /**
   * 获取发布详情
   */
  async getRecord(appId: number, recordId: number): Promise<PublishRecord> {
    const response = await request<PublishRecord>(
      `${BASE_URL}/${appId}/publish-history/${recordId}`
    );
    return response;
  },

  /**
   * 回滚发布
   */
  async rollback(appId: number, recordId: number): Promise<PublishRecord> {
    const response = await request<PublishRecord>(
      `${BASE_URL}/${appId}/publish-history/${recordId}/rollback`,
      { method: 'POST' }
    );
    return response;
  },

  /**
   * 获取当前发布状态
   */
  async getStatus(appId: number, target: string): Promise<{
    version?: string;
    publishedAt?: string;
    publishedBy?: string;
    status: 'idle' | 'deploying' | 'deployed' | 'failed';
  }> {
    const response = await apiClient.get(
      `${BASE_URL}/${appId}/publish-status?target=${target}`
    );
    return response;
  },
};

export default buildApi;

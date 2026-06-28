/**
 * Phase 5: 应用发布 - 应用 API
 *
 * 提供应用的 CRUD 操作接口
 */

import type {
  App,
  CreateAppRequest,
  UpdateAppRequest,
  AppFilters,
  PaginatedResponse,
  ApiResponse,
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
 * 应用 API 服务
 */
export const appApi = {
  /**
   * 获取应用列表
   */
  async list(filters?: AppFilters): Promise<PaginatedResponse<App>> {
    const params = new URLSearchParams();

    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.pageSize) params.append('pageSize', filters.pageSize.toString());
    if (filters?.sortBy) params.append('sortBy', filters.sortBy);
    if (filters?.sortOrder) params.append('sortOrder', filters.sortOrder);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.createdBy) params.append('createdBy', filters.createdBy);
    if (filters?.tags && filters.tags.length > 0) {
      params.append('tags', filters.tags.join(','));
    }

    const response = await request<PaginatedResponse<App>>(
      `${BASE_URL}?${params.toString()}`
    );
    return response;
  },

  /**
   * 获取应用详情
   */
  async get(id: number): Promise<App> {
    const response = await request<App>(`${BASE_URL}/${id}`);
    return response;
  },

  /**
   * 根据 code 获取应用
   */
  async getByCode(code: string): Promise<App> {
    const response = await request<App>(`${BASE_URL}/by-code/${code}`);
    return response;
  },

  /**
   * 创建应用
   */
  async create(data: CreateAppRequest): Promise<App> {
    const response = await request<App>(BASE_URL, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response;
  },

  /**
   * 更新应用
   */
  async update(id: number, data: UpdateAppRequest): Promise<App> {
    const response = await request<App>(`${BASE_URL}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return response;
  },

  /**
   * 删除应用
   */
  async delete(id: number): Promise<void> {
    await request<void>(`${BASE_URL}/${id}`, { method: 'DELETE' });
  },

  /**
   * 发布应用
   */
  async publish(id: number): Promise<App> {
    const response = await request<App>(`${BASE_URL}/${id}/publish`, { method: 'POST' });
    return response;
  },

  /**
   * 归档应用
   */
  async archive(id: number): Promise<App> {
    const response = await request<App>(`${BASE_URL}/${id}/archive`, { method: 'POST' });
    return response;
  },

  /**
   * 恢复归档的应用
   */
  async unarchive(id: number): Promise<App> {
    const response = await request<App>(`${BASE_URL}/${id}/unarchive`, { method: 'POST' });
    return response;
  },

  /**
   * 克隆应用
   */
  async clone(id: number, newCode: string, newName: string): Promise<App> {
    const response = await request<App>(`${BASE_URL}/${id}/clone`, {
      method: 'POST',
      body: JSON.stringify({ code: newCode, name: newName }),
    });
    return response;
  },

  /**
   * 获取应用统计信息
   */
  async getStats(id: number): Promise<{
    totalPages: number;
    totalWorkflows: number;
    totalDataSources: number;
    totalDatasets: number;
    totalDataInterfaces: number;
    buildCount: number;
    versionCount: number;
    lastPublishedAt?: string;
    createdAt: string;
  }> {
    const response = await request(`${BASE_URL}/${id}/stats`);
    return response;
  },

  /**
   * 验证应用 code 是否可用
   */
  async validateCode(code: string, excludeId?: number): Promise<{ available: boolean }> {
    const params = new URLSearchParams({ code });
    if (excludeId) params.append('excludeId', excludeId.toString());

    const response = await request<{ available: boolean }>(
      `${BASE_URL}/validate-code?${params.toString()}`
    );
    return response;
  },

  /**
   * 获取应用预览 URL
   */
  async getPreviewUrl(id: number): Promise<{ url: string }> {
    const response = await request<{ url: string }>(`${BASE_URL}/${id}/preview-url`);
    return response;
  },

  /**
   * 导出应用配置（JSON）
   */
  async export(id: number): Promise<Blob> {
    // 返回 Blob 用于下载
    const response = await fetch(`${BASE_URL}/${id}/export`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to export app');
    }

    return response.blob();
  },

  /**
   * 导入应用配置
   */
  async import(file: File): Promise<App> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${BASE_URL}/import`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Failed to import app');
    }

    return response.json();
  },

  /**
   * 批量删除应用
   */
  async batchDelete(ids: number[]): Promise<void> {
    await request(`${BASE_URL}/batch-delete`, {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  },

  /**
   * 批量归档应用
   */
  async batchArchive(ids: number[]): Promise<void> {
    await request(`${BASE_URL}/batch-archive`, {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  },
};

export default appApi;

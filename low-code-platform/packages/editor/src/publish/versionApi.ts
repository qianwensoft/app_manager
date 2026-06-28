/**
 * Phase 5: 应用发布 - 版本 API
 *
 * 提供应用版本管理接口
 */

import type {
  AppVersion,
  CreateVersionRequest,
  VersionFilters,
  PaginatedResponse,
  VersionComparison,
  AppSnapshot,
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
 * 版本 API 服务
 */
export const versionApi = {
  /**
   * 获取应用的版本列表
   */
  async list(appId: number, filters?: VersionFilters): Promise<PaginatedResponse<AppVersion>> {
    const params = new URLSearchParams();

    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.pageSize) params.append('pageSize', filters.pageSize.toString());
    if (filters?.sortBy) params.append('sortBy', filters.sortBy);
    if (filters?.sortOrder) params.append('sortOrder', filters.sortOrder);
    if (filters?.version) params.append('version', filters.version);
    if (filters?.tags && filters.tags.length > 0) {
      params.append('tags', filters.tags.join(','));
    }

    const response = await request<PaginatedResponse<AppVersion>>(
      `${BASE_URL}/${appId}/versions?${params.toString()}`
    );
    return response;
  },

  /**
   * 获取版本详情
   */
  async get(appId: number, versionId: number): Promise<AppVersion> {
    const response = await request<AppVersion>(
      `${BASE_URL}/${appId}/versions/${versionId}`
    );
    return response;
  },

  /**
   * 根据版本号获取版本
   */
  async getByVersion(appId: number, version: string): Promise<AppVersion> {
    const response = await request<AppVersion>(
      `${BASE_URL}/${appId}/versions/by-version/${version}`
    );
    return response;
  },

  /**
   * 创建新版本
   */
  async create(appId: number, data: CreateVersionRequest): Promise<AppVersion> {
    const response = await request<AppVersion>(
      `${BASE_URL}/${appId}/versions`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return response;
  },

  /**
   * 删除版本
   */
  async delete(appId: number, versionId: number): Promise<void> {
    await request(`${BASE_URL}/${appId}/versions/${versionId}`, {
      method: 'DELETE',
    });
  },

  /**
   * 比较两个版本
   */
  async compare(
    appId: number,
    fromVersion: string,
    toVersion: string
  ): Promise<VersionComparison> {
    const response = await request<VersionComparison>(
      `${BASE_URL}/${appId}/versions/compare?from=${fromVersion}&to=${toVersion}`
    );
    return response;
  },

  /**
   * 回滚到指定版本
   */
  async rollback(appId: number, versionId: number): Promise<AppVersion> {
    const response = await request<AppVersion>(
      `${BASE_URL}/${appId}/versions/${versionId}/rollback`,
      { method: 'POST' }
    );
    return response;
  },

  /**
   * 获取版本快照
   */
  async getSnapshot(appId: number, versionId: number): Promise<AppSnapshot> {
    const response = await request<AppSnapshot>(
      `${BASE_URL}/${appId}/versions/${versionId}/snapshot`
    );
    return response;
  },

  /**
   * 更新版本标签
   */
  async updateTags(appId: number, versionId: number, tags: string[]): Promise<AppVersion> {
    const response = await request<AppVersion>(
      `${BASE_URL}/${appId}/versions/${versionId}/tags`,
      {
        method: 'PUT',
        body: JSON.stringify({ tags }),
      }
    );
    return response;
  },

  /**
   * 更新版本变更日志
   */
  async updateChangelog(
    appId: number,
    versionId: number,
    changelog: string
  ): Promise<AppVersion> {
    const response = await request<AppVersion>(
      `${BASE_URL}/${appId}/versions/${versionId}/changelog`,
      {
        method: 'PUT',
        body: JSON.stringify({ changelog }),
      }
    );
    return response;
  },

  /**
   * 获取最新版本
   */
  async getLatest(appId: number): Promise<AppVersion | null> {
    try {
      const response = await request<AppVersion>(
        `${BASE_URL}/${appId}/versions/latest`
      );
      return response;
    } catch (error) {
      return null;
    }
  },

  /**
   * 获取所有标签
   */
  async getAllTags(appId: number): Promise<string[]> {
    const response = await request<string[]>(
      `${BASE_URL}/${appId}/versions/tags`
    );
    return response;
  },

  /**
   * 验证版本号
   */
  async validateVersion(
    appId: number,
    version: string,
    excludeId?: number
  ): Promise<{ valid: boolean; message?: string }> {
    const params = new URLSearchParams({ version });
    if (excludeId) params.append('excludeId', excludeId.toString());

    const response = await request<{ valid: boolean; message?: string }>(
      `${BASE_URL}/${appId}/versions/validate?${params.toString()}`
    );
    return response;
  },

  /**
   * 导出版本快照（JSON）
   */
  async exportSnapshot(appId: number, versionId: number): Promise<Blob> {
    const response = await fetch(
      `${BASE_URL}/${appId}/versions/${versionId}/export`,
      {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to export version snapshot');
    }

    return response.blob();
  },

  /**
   * 批量删除版本
   */
  async batchDelete(appId: number, versionIds: number[]): Promise<void> {
    await request(`${BASE_URL}/${appId}/versions/batch-delete`, {
      method: 'POST',
      body: JSON.stringify({ ids: versionIds }),
    });
  },
};

export default versionApi;

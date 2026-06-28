/**
 * Phase 5.5: 环境配置 - API
 *
 * 提供环境配置管理接口
 */

import type { PublishTarget } from './types';

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
 * 环境配置
 */
export interface EnvironmentConfig {
  id: number;
  appId: number;
  environment: PublishTarget;
  name: string;                          // 环境显示名称
  description?: string;                  // 环境描述
  variables: Record<string, string>;     // 环境变量
  config: {                              // 环境特定配置
    baseURL?: string;                    // API 基础 URL
    timeout?: number;                    // 请求超时
    debug?: boolean;                     // 调试模式
    features?: string[];                 // 功能开关
    analytics?: {
      enabled: boolean;
      trackingId?: string;
    };
    [key: string]: any;
  };
  secrets?: string[];                    // 敏感信息键名列表（值不返回）
  isActive: boolean;                     // 是否为当前激活环境
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

/**
 * 创建环境配置请求
 */
export interface CreateEnvironmentRequest {
  environment: PublishTarget;
  name: string;
  description?: string;
  variables?: Record<string, string>;
  config?: Record<string, any>;
  secrets?: string[];
}

/**
 * 更新环境配置请求
 */
export interface UpdateEnvironmentRequest {
  name?: string;
  description?: string;
  variables?: Record<string, string>;
  config?: Record<string, any>;
  secrets?: string[];
}

/**
 * 环境配置导入/导出格式
 */
export interface EnvironmentExport {
  environment: PublishTarget;
  name: string;
  description?: string;
  variables: Record<string, string>;
  config: Record<string, any>;
  exportedAt: string;
  exportedBy: string;
}

/**
 * 环境变量验证结果
 */
export interface VariableValidation {
  key: string;
  valid: boolean;
  message?: string;
}

/**
 * 环境配置 API 服务
 */
export const environmentApi = {
  /**
   * 获取应用的所有环境配置
   */
  async list(appId: number): Promise<EnvironmentConfig[]> {
    const response = await request<EnvironmentConfig[]>(
      `${BASE_URL}/${appId}/environments`
    );
    return response;
  },

  /**
   * 获取特定环境配置
   */
  async get(appId: number, environment: PublishTarget): Promise<EnvironmentConfig> {
    const response = await request<EnvironmentConfig>(
      `${BASE_URL}/${appId}/environments/${environment}`
    );
    return response;
  },

  /**
   * 创建环境配置
   */
  async create(appId: number, data: CreateEnvironmentRequest): Promise<EnvironmentConfig> {
    const response = await request<EnvironmentConfig>(
      `${BASE_URL}/${appId}/environments`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return response;
  },

  /**
   * 更新环境配置
   */
  async update(
    appId: number,
    environment: PublishTarget,
    data: UpdateEnvironmentRequest
  ): Promise<EnvironmentConfig> {
    const response = await request<EnvironmentConfig>(
      `${BASE_URL}/${appId}/environments/${environment}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      }
    );
    return response;
  },

  /**
   * 删除环境配置
   */
  async delete(appId: number, environment: PublishTarget): Promise<void> {
    await request(`${BASE_URL}/${appId}/environments/${environment}`, {
      method: 'DELETE',
    });
  },

  /**
   * 激活环境
   */
  async activate(appId: number, environment: PublishTarget): Promise<EnvironmentConfig> {
    const response = await request<EnvironmentConfig>(
      `${BASE_URL}/${appId}/environments/${environment}/activate`,
      { method: 'POST' }
    );
    return response;
  },

  /**
   * 获取环境变量（包含敏感信息）
   * 需要额外权限
   */
  async getVariables(
    appId: number,
    environment: PublishTarget,
    includeSecrets: boolean = false
  ): Promise<Record<string, string>> {
    const params = new URLSearchParams();
    if (includeSecrets) params.append('includeSecrets', 'true');

    const response = await request<Record<string, string>>(
      `${BASE_URL}/${appId}/environments/${environment}/variables?${params.toString()}`
    );
    return response;
  },

  /**
   * 更新环境变量
   */
  async updateVariables(
    appId: number,
    environment: PublishTarget,
    variables: Record<string, string>
  ): Promise<EnvironmentConfig> {
    const response = await request<EnvironmentConfig>(
      `${BASE_URL}/${appId}/environments/${environment}/variables`,
      {
        method: 'PUT',
        body: JSON.stringify({ variables }),
      }
    );
    return response;
  },

  /**
   * 更新环境配置
   */
  async updateConfig(
    appId: number,
    environment: PublishTarget,
    config: Record<string, any>
  ): Promise<EnvironmentConfig> {
    const response = await request<EnvironmentConfig>(
      `${BASE_URL}/${appId}/environments/${environment}/config`,
      {
        method: 'PUT',
        body: JSON.stringify({ config }),
      }
    );
    return response;
  },

  /**
   * 验证环境变量
   */
  async validateVariables(
    appId: number,
    variables: Record<string, string>
  ): Promise<VariableValidation[]> {
    const response = await request<VariableValidation[]>(
      `${BASE_URL}/${appId}/environments/validate-variables`,
      {
        method: 'POST',
        body: JSON.stringify({ variables }),
      }
    );
    return response;
  },

  /**
   * 导出环境配置
   */
  async exportConfig(
    appId: number,
    environment: PublishTarget,
    includeSecrets: boolean = false
  ): Promise<Blob> {
    const params = new URLSearchParams();
    if (includeSecrets) params.append('includeSecrets', 'true');

    const response = await fetch(
      `${BASE_URL}/${appId}/environments/${environment}/export?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to export environment config');
    }

    return response.blob();
  },

  /**
   * 导入环境配置
   */
  async importConfig(
    appId: number,
    environment: PublishTarget,
    file: File
  ): Promise<EnvironmentConfig> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(
      `${BASE_URL}/${appId}/environments/${environment}/import`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || 'Import failed');
    }

    const data = await response.json();
    return data.data || data;
  },

  /**
   * 复制环境配置
   */
  async clone(
    appId: number,
    fromEnvironment: PublishTarget,
    toEnvironment: PublishTarget,
    includeSecrets: boolean = false
  ): Promise<EnvironmentConfig> {
    const response = await request<EnvironmentConfig>(
      `${BASE_URL}/${appId}/environments/${fromEnvironment}/clone`,
      {
        method: 'POST',
        body: JSON.stringify({ toEnvironment, includeSecrets }),
      }
    );
    return response;
  },

  /**
   * 比较两个环境配置
   */
  async compare(
    appId: number,
    fromEnvironment: PublishTarget,
    toEnvironment: PublishTarget
  ): Promise<{
    variablesDiff: {
      added: string[];
      removed: string[];
      modified: string[];
      same: string[];
    };
    configDiff: {
      added: string[];
      removed: string[];
      modified: string[];
      same: string[];
    };
  }> {
    const response = await request<any>(
      `${BASE_URL}/${appId}/environments/compare?from=${fromEnvironment}&to=${toEnvironment}`
    );
    return response;
  },

  /**
   * 获取环境配置历史
   */
  async getHistory(
    appId: number,
    environment: PublishTarget,
    limit: number = 20
  ): Promise<{
    id: number;
    action: 'create' | 'update' | 'delete' | 'activate';
    changes: Record<string, any>;
    createdAt: string;
    createdBy: string;
  }[]> {
    const response = await request<any[]>(
      `${BASE_URL}/${appId}/environments/${environment}/history?limit=${limit}`
    );
    return response;
  },
};

export default environmentApi;

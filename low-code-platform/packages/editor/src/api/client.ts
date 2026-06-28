// API 客户端
import type { LowCodePage, AIGenerateRequest, AutoGenerateFromTableRequest } from '@lowcode/schema';

const API_BASE = '/api/lowcode';

// Token 管理
const TOKEN_KEY = 'auth_token';

export const auth = {
  setToken: (token: string) => {
    localStorage.setItem(TOKEN_KEY, token);
  },
  getToken: () => {
    return localStorage.getItem(TOKEN_KEY);
  },
  clearToken: () => {
    localStorage.removeItem(TOKEN_KEY);
  },
};

// 通用请求封装
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token = auth.getToken();

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (!response.ok) {
    // 401 未授权 - 清除 token 并跳转到登录页
    if (response.status === 401) {
      auth.clearToken();
      window.location.href = '/login';
      throw new Error('认证已过期，请重新登录');
    }

    // 如果返回的是 HTML，说明路由问题或认证失败
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('text/html')) {
      // 清除无效 token 并跳转到登录页
      auth.clearToken();
      window.location.href = '/login';
      throw new Error('需要登录');
    }

    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || '请求失败');
  }

  const data = await response.json();
  return data.data || data;
}

// 页面管理
export const pageApi = {
  list: (category?: string) =>
    request<LowCodePage[]>(`${API_BASE}/pages${category ? `?category=${category}` : ''}`),

  get: (id: number) =>
    request<LowCodePage>(`${API_BASE}/pages/${id}`),

  create: (page: Partial<LowCodePage>) =>
    request<LowCodePage>(`${API_BASE}/pages`, {
      method: 'POST',
      body: JSON.stringify(page),
    }),

  update: (id: number, page: Partial<LowCodePage>) =>
    request<LowCodePage>(`${API_BASE}/pages/${id}`, {
      method: 'PUT',
      body: JSON.stringify(page),
    }),

  delete: (id: number) =>
    request<void>(`${API_BASE}/pages/${id}`, { method: 'DELETE' }),

  publish: (id: number) =>
    request<void>(`${API_BASE}/pages/${id}/publish`, { method: 'POST' }),

  versions: (id: number) =>
    request<any[]>(`${API_BASE}/pages/${id}/versions`),

  rollback: (id: number, version: number) =>
    request<LowCodePage>(`${API_BASE}/pages/${id}/rollback/${version}`, { method: 'POST' }),
};

// 自动生成
export const generateApi = {
  fromTable: (req: AutoGenerateFromTableRequest) =>
    request<LowCodePage>(`${API_BASE}/pages/generate-from-table`, {
      method: 'POST',
      body: JSON.stringify(req),
    }),

  ai: (req: AIGenerateRequest) =>
    request<{ data: LowCodePage; ai_response: any }>(`${API_BASE}/pages/ai-generate`, {
      method: 'POST',
      body: JSON.stringify(req),
    }),
};

// 工作流管理
export const workflowApi = {
  list: () =>
    request<any[]>(`${API_BASE}/workflows`),

  get: (id: number) =>
    request<any>(`${API_BASE}/workflows/${id}`),

  create: (workflow: any) =>
    request<any>(`${API_BASE}/workflows`, {
      method: 'POST',
      body: JSON.stringify(workflow),
    }),

  update: (id: number, workflow: any) =>
    request<any>(`${API_BASE}/workflows/${id}`, {
      method: 'PUT',
      body: JSON.stringify(workflow),
    }),

  delete: (id: number) =>
    request<void>(`${API_BASE}/workflows/${id}`, { method: 'DELETE' }),
};

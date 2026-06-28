/**
 * Phase 5: 应用发布 - 应用状态管理
 *
 * 使用 Zustand 管理应用状态
 */

import { create } from 'zustand';
import type {
  App,
  AppVersion,
  AppBuild,
  AppFilters,
  CreateAppRequest,
  UpdateAppRequest,
} from './types';
import appApi from './appApi';
import versionApi from './versionApi';
import buildApi from './buildApi';

interface AppState {
  // 应用列表
  apps: App[];
  currentApp: App | null;
  loading: boolean;
  error: string | null;

  // 版本列表
  versions: AppVersion[];
  currentVersion: AppVersion | null;
  versionsLoading: boolean;

  // 构建列表
  builds: AppBuild[];
  currentBuild: AppBuild | null;
  buildsLoading: boolean;

  // 分页
  pagination: {
    total: number;
    page: number;
    pageSize: number;
  };

  // 筛选
  filters: AppFilters;

  // Actions - 应用管理
  fetchApps: (filters?: AppFilters) => Promise<void>;
  fetchApp: (id: number) => Promise<void>;
  createApp: (data: CreateAppRequest) => Promise<App>;
  updateApp: (id: number, data: UpdateAppRequest) => Promise<App>;
  deleteApp: (id: number) => Promise<void>;
  setCurrentApp: (app: App | null) => void;
  clearCurrentApp: () => void;

  // Actions - 版本管理
  fetchVersions: (appId: number) => Promise<void>;
  fetchVersion: (appId: number, versionId: number) => Promise<void>;
  createVersion: (appId: number, version: string, changelog?: string) => Promise<AppVersion>;
  setCurrentVersion: (version: AppVersion | null) => void;

  // Actions - 构建管理
  fetchBuilds: (appId: number) => Promise<void>;
  fetchBuild: (appId: number, buildId: number) => Promise<void>;
  createBuild: (appId: number, version: string, buildType: string) => Promise<AppBuild>;
  setCurrentBuild: (build: AppBuild | null) => void;

  // Actions - 筛选
  setFilters: (filters: Partial<AppFilters>) => void;
  clearFilters: () => void;

  // Actions - 错误处理
  setError: (error: string | null) => void;
  clearError: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // 初始状态
  apps: [],
  currentApp: null,
  loading: false,
  error: null,

  versions: [],
  currentVersion: null,
  versionsLoading: false,

  builds: [],
  currentBuild: null,
  buildsLoading: false,

  pagination: {
    total: 0,
    page: 1,
    pageSize: 20,
  },

  filters: {
    page: 1,
    pageSize: 20,
    sortBy: 'updatedAt',
    sortOrder: 'desc',
  },

  // ========================================================================
  // 应用管理 Actions
  // ========================================================================

  fetchApps: async (filters?: AppFilters) => {
    set({ loading: true, error: null });
    try {
      const finalFilters = { ...get().filters, ...filters };
      const response = await appApi.list(finalFilters);

      set({
        apps: response.items,
        pagination: {
          total: response.total,
          page: response.page,
          pageSize: response.pageSize,
        },
        filters: finalFilters,
        loading: false,
      });
    } catch (error: any) {
      set({ error: error.message || 'Failed to fetch apps', loading: false });
      throw error;
    }
  },

  fetchApp: async (id: number) => {
    set({ loading: true, error: null });
    try {
      const app = await appApi.get(id);
      set({ currentApp: app, loading: false });
    } catch (error: any) {
      set({ error: error.message || 'Failed to fetch app', loading: false });
      throw error;
    }
  },

  createApp: async (data: CreateAppRequest) => {
    set({ loading: true, error: null });
    try {
      const app = await appApi.create(data);
      set((state) => ({
        apps: [app, ...state.apps],
        loading: false,
      }));
      return app;
    } catch (error: any) {
      set({ error: error.message || 'Failed to create app', loading: false });
      throw error;
    }
  },

  updateApp: async (id: number, data: UpdateAppRequest) => {
    set({ loading: true, error: null });
    try {
      const app = await appApi.update(id, data);
      set((state) => ({
        apps: state.apps.map((a) => (a.id === id ? app : a)),
        currentApp: state.currentApp?.id === id ? app : state.currentApp,
        loading: false,
      }));
      return app;
    } catch (error: any) {
      set({ error: error.message || 'Failed to update app', loading: false });
      throw error;
    }
  },

  deleteApp: async (id: number) => {
    set({ loading: true, error: null });
    try {
      await appApi.delete(id);
      set((state) => ({
        apps: state.apps.filter((a) => a.id !== id),
        currentApp: state.currentApp?.id === id ? null : state.currentApp,
        loading: false,
      }));
    } catch (error: any) {
      set({ error: error.message || 'Failed to delete app', loading: false });
      throw error;
    }
  },

  setCurrentApp: (app: App | null) => {
    set({ currentApp: app });
  },

  clearCurrentApp: () => {
    set({ currentApp: null });
  },

  // ========================================================================
  // 版本管理 Actions
  // ========================================================================

  fetchVersions: async (appId: number) => {
    set({ versionsLoading: true, error: null });
    try {
      const response = await versionApi.list(appId, {
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
      set({ versions: response.items, versionsLoading: false });
    } catch (error: any) {
      set({
        error: error.message || 'Failed to fetch versions',
        versionsLoading: false,
      });
      throw error;
    }
  },

  fetchVersion: async (appId: number, versionId: number) => {
    set({ versionsLoading: true, error: null });
    try {
      const version = await versionApi.get(appId, versionId);
      set({ currentVersion: version, versionsLoading: false });
    } catch (error: any) {
      set({
        error: error.message || 'Failed to fetch version',
        versionsLoading: false,
      });
      throw error;
    }
  },

  createVersion: async (appId: number, version: string, changelog?: string) => {
    set({ versionsLoading: true, error: null });
    try {
      const newVersion = await versionApi.create(appId, { version, changelog });
      set((state) => ({
        versions: [newVersion, ...state.versions],
        versionsLoading: false,
      }));
      return newVersion;
    } catch (error: any) {
      set({
        error: error.message || 'Failed to create version',
        versionsLoading: false,
      });
      throw error;
    }
  },

  setCurrentVersion: (version: AppVersion | null) => {
    set({ currentVersion: version });
  },

  // ========================================================================
  // 构建管理 Actions
  // ========================================================================

  fetchBuilds: async (appId: number) => {
    set({ buildsLoading: true, error: null });
    try {
      const response = await buildApi.list(appId, {
        sortBy: 'startedAt',
        sortOrder: 'desc',
      });
      set({ builds: response.items, buildsLoading: false });
    } catch (error: any) {
      set({
        error: error.message || 'Failed to fetch builds',
        buildsLoading: false,
      });
      throw error;
    }
  },

  fetchBuild: async (appId: number, buildId: number) => {
    set({ buildsLoading: true, error: null });
    try {
      const build = await buildApi.get(appId, buildId);
      set({ currentBuild: build, buildsLoading: false });
    } catch (error: any) {
      set({
        error: error.message || 'Failed to fetch build',
        buildsLoading: false,
      });
      throw error;
    }
  },

  createBuild: async (appId: number, version: string, buildType: string) => {
    set({ buildsLoading: true, error: null });
    try {
      const build = await buildApi.create(appId, {
        version,
        buildType: buildType as any,
      });
      set((state) => ({
        builds: [build, ...state.builds],
        buildsLoading: false,
      }));
      return build;
    } catch (error: any) {
      set({
        error: error.message || 'Failed to create build',
        buildsLoading: false,
      });
      throw error;
    }
  },

  setCurrentBuild: (build: AppBuild | null) => {
    set({ currentBuild: build });
  },

  // ========================================================================
  // 筛选 Actions
  // ========================================================================

  setFilters: (filters: Partial<AppFilters>) => {
    set((state) => ({
      filters: { ...state.filters, ...filters },
    }));
  },

  clearFilters: () => {
    set({
      filters: {
        page: 1,
        pageSize: 20,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      },
    });
  },

  // ========================================================================
  // 错误处理 Actions
  // ========================================================================

  setError: (error: string | null) => {
    set({ error });
  },

  clearError: () => {
    set({ error: null });
  },
}));

export default useAppStore;

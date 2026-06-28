/**
 * 缓存使用演示页面
 */

import React, { useState } from 'react';
import { useCacheQuery, useCacheMutation, useCacheInvalidation } from '../cache';
import './CacheDemoPage.css';

// 模拟 API 调用
const mockFetchUsers = async (): Promise<any[]> => {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return [
    { id: 1, name: 'Alice', email: 'alice@example.com' },
    { id: 2, name: 'Bob', email: 'bob@example.com' },
    { id: 3, name: 'Charlie', email: 'charlie@example.com' },
  ];
};

const mockFetchUserDetail = async (id: number): Promise<any> => {
  await new Promise((resolve) => setTimeout(resolve, 800));
  return {
    id,
    name: `User ${id}`,
    email: `user${id}@example.com`,
    bio: 'This is a user bio...',
    lastLogin: new Date().toISOString(),
  };
};

const mockUpdateUser = async (id: number, data: any): Promise<any> => {
  await new Promise((resolve) => setTimeout(resolve, 500));
  return { id, ...data, updatedAt: new Date().toISOString() };
};

export const CacheDemoPage: React.FC = () => {
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [optimisticUpdate, setOptimisticUpdate] = useState(false);
  const { invalidateByTags, invalidateByPrefix } = useCacheInvalidation();

  // 查询用户列表（带缓存）
  const {
    data: users,
    isLoading: usersLoading,
    isFetching: usersFetching,
    error: usersError,
    refetch: refetchUsers,
  } = useCacheQuery({
    key: 'users-list',
    fetcher: mockFetchUsers,
    enabled: true,
    ttl: 30000, // 30秒
    tags: ['users'],
    revalidateInBackground: true,
    onCacheHit: (data) => console.log('Cache hit for users:', data),
    onCacheMiss: () => console.log('Cache miss for users'),
  });

  // 查询用户详情（带缓存）
  const {
    data: userDetail,
    isLoading: detailLoading,
    refetch: refetchDetail,
  } = useCacheQuery({
    key: `user-${selectedUserId}`,
    fetcher: () => mockFetchUserDetail(selectedUserId!),
    enabled: selectedUserId !== null,
    ttl: 60000, // 60秒
    tags: ['users', `user-${selectedUserId}`],
  });

  // 修改用户（带缓存失效）
  const { mutate: updateUser, isLoading: updateLoading } = useCacheMutation({
    invalidateKeys: ['users-list'],
    invalidateTags: selectedUserId ? [`user-${selectedUserId}`] : [],
    optimistic: optimisticUpdate,
    optimisticData: { name: 'Updating...' },
    onSuccess: (data) => {
      console.log('User updated:', data);
      alert('用户更新成功！');
    },
    onError: (error) => {
      console.error('Update failed:', error);
      alert('更新失败：' + error.message);
    },
  });

  const handleUpdate = async () => {
    if (!selectedUserId) return;
    try {
      await updateUser(() =>
        mockUpdateUser(selectedUserId, { name: 'Updated Name' })
      );
    } catch (error) {
      // Error already handled in onError
    }
  };

  return (
    <div className="cache-demo-page">
      <div className="page-header">
        <h1>缓存使用演示</h1>
        <div className="header-actions">
          <a href="/data/cache" className="btn btn-primary">
            打开缓存管理
          </a>
        </div>
      </div>

      <div className="demo-grid">
        {/* 用户列表 */}
        <div className="demo-section">
          <div className="section-header">
            <h2>用户列表</h2>
            <div className="section-actions">
              <button
                className="btn btn-sm"
                onClick={() => refetchUsers()}
                disabled={usersLoading}
              >
                {usersFetching ? '刷新中...' : '🔄 刷新'}
              </button>
              <button
                className="btn btn-sm"
                onClick={() => invalidateByTags(['users'])}
              >
                🗑️ 清除缓存
              </button>
            </div>
          </div>

          {usersLoading ? (
            <div className="loading">加载中...</div>
          ) : usersError ? (
            <div className="error">错误：{usersError.message}</div>
          ) : (
            <div className="user-list">
              {users?.map((user: any) => (
                <div
                  key={user.id}
                  className={`user-item ${selectedUserId === user.id ? 'active' : ''}`}
                  onClick={() => setSelectedUserId(user.id)}
                >
                  <div className="user-name">{user.name}</div>
                  <div className="user-email">{user.email}</div>
                </div>
              ))}
            </div>
          )}

          <div className="cache-info">
            {usersFetching && !usersLoading && (
              <span className="badge badge-info">后台重新验证中...</span>
            )}
          </div>
        </div>

        {/* 用户详情 */}
        <div className="demo-section">
          <div className="section-header">
            <h2>用户详情</h2>
            {selectedUserId && (
              <div className="section-actions">
                <button
                  className="btn btn-sm"
                  onClick={() => refetchDetail()}
                  disabled={detailLoading}
                >
                  🔄 刷新
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => invalidateByPrefix(`user-${selectedUserId}`)}
                >
                  🗑️ 清除缓存
                </button>
              </div>
            )}
          </div>

          {!selectedUserId ? (
            <div className="empty-state">请从左侧选择一个用户</div>
          ) : detailLoading ? (
            <div className="loading">加载中...</div>
          ) : userDetail ? (
            <div className="user-detail">
              <div className="detail-row">
                <strong>ID:</strong>
                <span>{userDetail.id}</span>
              </div>
              <div className="detail-row">
                <strong>姓名:</strong>
                <span>{userDetail.name}</span>
              </div>
              <div className="detail-row">
                <strong>邮箱:</strong>
                <span>{userDetail.email}</span>
              </div>
              <div className="detail-row">
                <strong>简介:</strong>
                <span>{userDetail.bio}</span>
              </div>
              <div className="detail-row">
                <strong>最后登录:</strong>
                <span>{new Date(userDetail.lastLogin).toLocaleString()}</span>
              </div>

              <div className="detail-actions">
                <label>
                  <input
                    type="checkbox"
                    checked={optimisticUpdate}
                    onChange={(e) => setOptimisticUpdate(e.target.checked)}
                  />
                  启用乐观更新
                </label>
                <button
                  className="btn btn-primary"
                  onClick={handleUpdate}
                  disabled={updateLoading}
                >
                  {updateLoading ? '更新中...' : '更新用户'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* 使用说明 */}
      <div className="usage-guide">
        <h2>💡 使用说明</h2>

        <div className="guide-section">
          <h3>1. useCacheQuery - 缓存查询</h3>
          <pre>{`const { data, isLoading, refetch } = useCacheQuery({
  key: 'users-list',
  fetcher: fetchUsers,
  ttl: 30000,              // 30秒缓存
  tags: ['users'],          // 标签分组
  revalidateInBackground: true,  // 后台重新验证
});`}</pre>
          <p className="guide-desc">
            自动缓存数据，支持 TTL、标签分组、后台重新验证等特性。
          </p>
        </div>

        <div className="guide-section">
          <h3>2. useCacheMutation - 缓存修改</h3>
          <pre>{`const { mutate, isLoading } = useCacheMutation({
  invalidateKeys: ['users-list'],  // 失效指定键
  invalidateTags: ['users'],       // 失效标签
  optimistic: true,                // 乐观更新
  optimisticData: { name: '...' }, // 乐观数据
  onSuccess: (data) => { ... },
});

await mutate(() => updateUser(id, data));`}</pre>
          <p className="guide-desc">
            修改数据并自动失效相关缓存，支持乐观更新。
          </p>
        </div>

        <div className="guide-section">
          <h3>3. useCacheInvalidation - 缓存失效</h3>
          <pre>{`const {
  invalidateKey,      // 失效单个键
  invalidateKeys,     // 失效多个键
  invalidateByTags,   // 按标签失效
  invalidateByPrefix, // 按前缀失效
  clearAll,           // 清空所有
} = useCacheInvalidation();`}</pre>
          <p className="guide-desc">
            提供多种缓存失效策略。
          </p>
        </div>

        <div className="guide-section">
          <h3>4. 缓存策略</h3>
          <ul>
            <li>
              <strong>LRU (Least Recently Used)</strong> - 淘汰最久未访问的条目
            </li>
            <li>
              <strong>LFU (Least Frequently Used)</strong> - 淘汰访问次数最少的条目
            </li>
            <li>
              <strong>FIFO (First In First Out)</strong> - 淘汰最早创建的条目
            </li>
          </ul>
        </div>

        <div className="guide-section">
          <h3>5. 高级特性</h3>
          <ul>
            <li>✅ 自动 TTL 过期</li>
            <li>✅ 基于标签的批量失效</li>
            <li>✅ 离线缓存（localStorage）</li>
            <li>✅ 乐观更新</li>
            <li>✅ 后台重新验证</li>
            <li>✅ 缓存统计和监控</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

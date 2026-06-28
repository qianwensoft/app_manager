import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { pageApi } from '../api/client';
import type { LowCodePage } from '@lowcode/schema';

export default function PageListPage() {
  const [pages, setPages] = useState<LowCodePage[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const loadPages = async () => {
    setLoading(true);
    try {
      const data = await pageApi.list();
      setPages(data);
    } catch (error: any) {
      console.error('Failed to load pages:', error);
      alert('Failed to load pages: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPages();
  }, []);

  const handleCreate = async () => {
    const code = prompt('Enter page code:');
    if (!code) return;

    const name = prompt('Enter page name:');
    if (!name) return;

    setCreating(true);
    try {
      const page = await pageApi.create({
        code,
        name,
        category: 'form',
        puckState: JSON.stringify({ content: [], root: {} }),
        workflowDef: '',
      });
      alert('Page created successfully!');
      window.location.href = `/editor?id=${page.id}`;
    } catch (error: any) {
      console.error('Failed to create page:', error);
      alert('Failed to create page: ' + error.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this page?')) return;

    try {
      await pageApi.delete(id);
      alert('Page deleted successfully!');
      loadPages();
    } catch (error: any) {
      console.error('Failed to delete page:', error);
      alert('Failed to delete page: ' + error.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* 头部 */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Low-Code Platform</h1>
          <div className="flex gap-3">
            <Link
              to="/workflows"
              className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
            >
              ⚙️ 工作流管理
            </Link>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Page'}
            </button>
          </div>
        </div>

        {/* 页面列表 */}
        {pages.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <p className="text-gray-500">No pages yet. Create one to get started!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pages.map((page) => (
              <div key={page.id} className="bg-white rounded-lg shadow p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-semibold">{page.name}</h3>
                    <p className="text-sm text-gray-500">{page.code}</p>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs rounded ${
                      page.publishStatus === 1
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {page.publishStatus === 1 ? 'Published' : 'Draft'}
                  </span>
                </div>

                <div className="text-sm text-gray-600 mb-4">
                  <div>Category: {page.category}</div>
                  <div>Version: {page.version}</div>
                  <div>Updated: {new Date(page.updatedAt).toLocaleDateString()}</div>
                </div>

                <div className="flex gap-2">
                  <a
                    href={`/editor?id=${page.id}`}
                    className="flex-1 text-center px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    Edit
                  </a>
                  <button
                    onClick={() => handleDelete(page.id)}
                    className="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

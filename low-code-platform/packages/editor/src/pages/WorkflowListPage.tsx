import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { workflowApi } from '../api/client';
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from '../workflow/WorkflowTemplates';

interface WorkflowItem {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export const WorkflowListPage: React.FC = () => {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = async () => {
    try {
      const data = await workflowApi.list();
      setWorkflows(data);
    } catch (error) {
      console.error('Failed to load workflows:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setShowTemplates(true);
  };

  const handleCreateFromTemplate = async (template: WorkflowTemplate) => {
    try {
      const created = await workflowApi.create({
        name: template.name,
        description: template.description,
        code: `workflow_${Date.now()}`,
        workflow_def: JSON.stringify(template.definition),
      });

      if (!response.ok) throw new Error('Failed to create workflow');

      setShowTemplates(false);
      alert('创建成功！');
      navigate(`/workflows/${created.id}`);
    } catch (error) {
      console.error('Failed to create workflow:', error);
      alert('创建失败，请重试');
    }
  };

  const handleCreateBlank = () => {
    navigate('/workflows/new');
  };

  const handleEdit = (id: number) => {
    navigate(`/workflows/${id}`);
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`确定要删除工作流 "${name}" 吗？`)) return;

    try {
      await workflowApi.delete(id);
      alert('删除成功！');
      loadWorkflows();
    } catch (error) {
      console.error('Failed to delete workflow:', error);
      alert('删除失败，请重试');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">工作流管理</h1>
            <p className="text-sm text-gray-600 mt-1">
              创建和管理自动化工作流
            </p>
          </div>
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
          >
            <span>➕</span>
            <span>新建工作流</span>
          </button>
        </div>

        {/* Template Modal */}
        {showTemplates && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-[900px] max-h-[80vh] flex flex-col">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">选择工作流模板</h2>
                <button
                  onClick={() => setShowTemplates(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <button
                    onClick={handleCreateBlank}
                    className="p-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
                  >
                    <div className="text-3xl mb-2">📄</div>
                    <div className="font-medium text-gray-900">空白工作流</div>
                    <div className="text-sm text-gray-600 mt-1">从头开始创建工作流</div>
                  </button>
                  {WORKFLOW_TEMPLATES.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => handleCreateFromTemplate(template)}
                      className="p-6 border border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-md transition-all text-left"
                    >
                      <div className="text-3xl mb-2">{template.icon}</div>
                      <div className="font-medium text-gray-900">{template.name}</div>
                      <div className="text-sm text-gray-600 mt-1">{template.description}</div>
                      <div className="mt-3">
                        <span className="inline-block px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                          {template.category}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Workflow List */}
        {workflows.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <div className="text-gray-400 text-4xl mb-4">📋</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              还没有工作流
            </h3>
            <p className="text-gray-600 mb-6">
              创建第一个工作流来自动化您的业务流程
            </p>
            <button
              onClick={handleCreate}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              创建工作流
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workflows.map((workflow) => (
              <div
                key={workflow.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {workflow.name}
                    </h3>
                    <span className="text-2xl">⚙️</span>
                  </div>

                  {workflow.description && (
                    <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                      {workflow.description}
                    </p>
                  )}

                  <div className="text-xs text-gray-500 mb-4">
                    <div>创建: {formatDate(workflow.created_at)}</div>
                    <div>更新: {formatDate(workflow.updated_at)}</div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(workflow.id)}
                      className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDelete(workflow.id, workflow.name)}
                      className="px-3 py-2 text-sm text-red-600 border border-red-200 rounded-md hover:bg-red-50"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

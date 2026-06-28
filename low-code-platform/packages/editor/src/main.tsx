import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import EditorPage from './pages/EditorPage';
import PreviewPage from './pages/PreviewPage';
import PageListPage from './pages/PageListPage';
import LoginPage from './pages/LoginPage';
import ProtectedRoute from './components/ProtectedRoute';
import { WorkflowEditorPage } from './pages/WorkflowEditorPage';
import { WorkflowListPage } from './pages/WorkflowListPage';
import { EventManagementPage } from './pages/EventManagementPage';
import { DataSourceListPage, DatasetListPage, DataInterfaceListPage } from './data';
import { DataBindingDemoPage } from './pages/DataBindingDemoPage';
import { StompDemoPage } from './pages/StompDemoPage';
import { CacheManagementPage } from './pages/CacheManagementPage';
import { CacheDemoPage } from './pages/CacheDemoPage';
import { DataBindingCacheDemo } from './pages/DataBindingCacheDemo';
import { AppListPage, AppBuilderPage } from './publish';
import { VersionManagementPage } from './pages/VersionManagementPage';
import { EnvironmentManagementPage } from './pages/EnvironmentManagementPage';
import { PublishWorkflowPage } from './pages/PublishWorkflowPage';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected Routes */}
        <Route path="/" element={<ProtectedRoute><PageListPage /></ProtectedRoute>} />
        <Route path="/editor" element={<ProtectedRoute><EditorPage /></ProtectedRoute>} />
        <Route path="/preview" element={<PreviewPage />} />

        {/* Workflow Routes */}
        <Route path="/workflows" element={<ProtectedRoute><WorkflowListPage /></ProtectedRoute>} />
        <Route path="/workflows/:id" element={<ProtectedRoute><WorkflowEditorPage /></ProtectedRoute>} />

        {/* Event Management Routes */}
        <Route path="/events" element={<ProtectedRoute><EventManagementPage /></ProtectedRoute>} />

        {/* Data Integration Routes */}
        <Route path="/data/sources" element={<ProtectedRoute><DataSourceListPage /></ProtectedRoute>} />
        <Route path="/data/datasets" element={<ProtectedRoute><DatasetListPage /></ProtectedRoute>} />
        <Route path="/data/interfaces" element={<ProtectedRoute><DataInterfaceListPage /></ProtectedRoute>} />
        <Route path="/data/bindings" element={<ProtectedRoute><DataBindingDemoPage /></ProtectedRoute>} />
        <Route path="/data/stomp" element={<ProtectedRoute><StompDemoPage /></ProtectedRoute>} />
        <Route path="/data/cache" element={<ProtectedRoute><CacheManagementPage /></ProtectedRoute>} />
        <Route path="/data/cache/demo" element={<ProtectedRoute><CacheDemoPage /></ProtectedRoute>} />
        <Route path="/data/bindings/cache" element={<ProtectedRoute><DataBindingCacheDemo /></ProtectedRoute>} />

        {/* Application Publishing Routes */}
        <Route path="/publish/apps" element={<ProtectedRoute><AppListPage /></ProtectedRoute>} />
        <Route path="/publish/apps/:id/build" element={<ProtectedRoute><AppBuilderPage /></ProtectedRoute>} />
        <Route path="/publish/apps/:appId/versions" element={<ProtectedRoute><VersionManagementPage /></ProtectedRoute>} />
        <Route path="/publish/apps/:appId/environments" element={<ProtectedRoute><EnvironmentManagementPage /></ProtectedRoute>} />
        <Route path="/publish/apps/:appId/workflow" element={<ProtectedRoute><PublishWorkflowPage /></ProtectedRoute>} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

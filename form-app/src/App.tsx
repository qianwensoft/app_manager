import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import FormAppListPage from '@/pages/FormAppListPage'
import FormDesignerPage from '@/pages/FormDesignerPage'
import FormAppDesignerV2 from '@/pages/FormAppDesignerV2'
import FormAppCreateWizard from '@/pages/FormAppCreateWizard'
import PageEditorPage from '@/pages/PageEditorPage'
import PageDesignerPage from '@/pages/PageDesignerPage'
import PageLinkEditorPage from '@/pages/PageLinkEditorPage'
import EventRouteEditorPage from '@/pages/EventRouteEditorPage'
import FormPreviewPage from '@/pages/FormPreviewPage'
import SchemaPage from '@/pages/SchemaPage'
import GeneratedFormAppPage from '@/pages/GeneratedFormAppPage'

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<Navigate to="/forms" replace />} />
        <Route path="/forms" element={<FormAppListPage />} />
        <Route path="/create-wizard" element={<FormAppCreateWizard />} />
        <Route path="/editor/:id" element={<FormAppDesignerV2 />} />
        <Route path="/page-designer/:pageId" element={<PageDesignerPage />} />
        <Route path="/designer-v2/:id" element={<FormAppDesignerV2 />} />
        <Route path="/page-editor/:pageId" element={<PageEditorPage />} />
        <Route path="/page-links/:id" element={<PageLinkEditorPage />} />
        <Route path="/event-routes/:id" element={<EventRouteEditorPage />} />
        <Route path="/preview/:id" element={<FormPreviewPage />} />
        <Route path="/generated/:code/:pageType" element={<GeneratedFormAppPage />} />
        <Route path="/schema" element={<SchemaPage />} />
      </Routes>
    </BrowserRouter>
  )
}

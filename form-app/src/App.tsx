import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import FormAppListPage from '@/pages/FormAppListPage'
import FormAppDesignerV2 from '@/pages/FormAppDesignerV2'
import FormAppCreateWizard from '@/pages/FormAppCreateWizard'
import PageEditorPage from '@/pages/PageEditorPage'
import PageDesignerPage from '@/pages/PageDesignerPage'
import SchemaPage from '@/pages/SchemaPage'
import GeneratedFormAppPage from '@/pages/GeneratedFormAppPage'
import MultiPageRuntimePage from '@/pages/MultiPageRuntimePage'

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<Navigate to="/forms" replace />} />
        <Route path="/forms" element={<FormAppListPage />} />
        <Route path="/create-wizard" element={<FormAppCreateWizard />} />
        <Route path="/editor/:id" element={<FormAppDesignerV2 />} />
        <Route path="/designer-v2/:id" element={<FormAppDesignerV2 />} />
        <Route path="/page-designer/:pageId" element={<PageDesignerPage />} />
        <Route path="/page-editor/:pageId" element={<PageEditorPage />} />
        <Route path="/generated/:code/:pageType" element={<GeneratedFormAppPage />} />
        <Route path="/runtime/:code" element={<MultiPageRuntimePage />} />
        <Route path="/schema" element={<SchemaPage />} />
      </Routes>
    </BrowserRouter>
  )
}

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import ScadaListPage from '@/pages/ScadaListPage'
import EditorPage from '@/pages/EditorPage'
import PreviewPage from '@/pages/PreviewPage'
import SharePage from '@/pages/SharePage'
import SchemaPage from '@/pages/SchemaPage'
import SimPointsPage from '@/pages/SimPointsPage'
import CustomizeComponentsPage from '@/pages/CustomizeComponentsPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
})

export default function App() {
  const showDevtools = import.meta.env.DEV && new URLSearchParams(window.location.search).has('devtools')

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route path="/" element={<Navigate to="/scada" replace />} />
          <Route path="/scada" element={<ScadaListPage />} />
          <Route path="/editor/:id" element={<EditorPage />} />
          <Route path="/preview/:id" element={<PreviewPage />} />
          <Route path="/share/:token" element={<SharePage />} />
          <Route path="/schema" element={<SchemaPage />} />
          <Route path="/sim-points" element={<SimPointsPage />} />
          <Route path="/customize" element={<CustomizeComponentsPage />} />
        </Routes>
      </BrowserRouter>
      {showDevtools && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  )
}

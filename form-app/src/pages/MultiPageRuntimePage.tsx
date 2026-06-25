import { useParams } from 'react-router-dom'
import MultiPageRuntime from '@/runtime/MultiPageRuntime'

export default function MultiPageRuntimePage() {
  const { code = '' } = useParams()
  return <MultiPageRuntime formAppCode={code} />
}

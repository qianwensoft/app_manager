import http from './http'

const ek = k => encodeURIComponent(String(k))

export const listDataSources = () => http.get('/data/sources')
export const createDataSource = data => http.post('/data/sources', data)
export const updateDataSource = (key, data) => http.put(`/data/sources/${ek(key)}`, data)
export const deleteDataSource = key => http.delete(`/data/sources/${ek(key)}`)
export const testDataSource = key => http.get(`/data/sources/${ek(key)}/test`)
export const getDataSourcePoolStats = key => http.get(`/data/sources/${ek(key)}/pool-stats`)
export const listDataSourceTables = key => http.get(`/data/sources/${ek(key)}/tables`)
export const listDataSourceTableColumns = (key, table) =>
  http.get(`/data/sources/${ek(key)}/tables/${encodeURIComponent(table)}/columns`)
export const getDataSourceSelectAllSql = (key, table) =>
  http.get(`/data/sources/${ek(key)}/select-all-sql`, { params: { table } })
export const execDataSourceDDL = (key, body) => http.post(`/data/sources/${ek(key)}/exec-ddl`, body)

export const listDatasets = () => http.get('/data/datasets')
export const createDataset = data => http.post('/data/datasets', data)
export const updateDataset = (key, data) => http.put(`/data/datasets/${ek(key)}`, data)
export const deleteDataset = key => http.delete(`/data/datasets/${ek(key)}`)
export const listDatasetStructures = key => http.get(`/data/datasets/${ek(key)}/structures`)
export const createDatasetStructure = (key, data) => http.post(`/data/datasets/${ek(key)}/structures`, data)
export const updateDatasetStructure = (dk, sk, data) =>
  http.put(`/data/datasets/${ek(dk)}/structures/${ek(sk)}`, data)
export const deleteDatasetStructure = (dk, sk) =>
  http.delete(`/data/datasets/${ek(dk)}/structures/${ek(sk)}`)
export const previewDataset = (key, body) => http.post(`/data/datasets/${ek(key)}/preview`, body)
export const getDatasetEventRows = (key, limit = 50) => http.get(`/data/datasets/${ek(key)}/event-rows`, { params: { limit } })
export const debugDataset = (key, body) => http.post(`/data/datasets/${ek(key)}/debug`, body)
export const debugDataInterface = (key, body) => http.post(`/data/interfaces/${ek(key)}/debug`, body)
export const mockParamsDataset = (key) => http.get(`/data/datasets/${ek(key)}/mock-params`)
export const mockParamsInterface = (key) => http.get(`/data/interfaces/${ek(key)}/mock-params`)
export const getInterfaceParamSchema = (key) => http.get(`/data/interfaces/${ek(key)}/param-schema`)
export const applyDatasetDDL = (key, body) => http.post(`/data/datasets/${ek(key)}/apply-ddl`, body)
export const generateStaticCrudInterfaces = (key, body) =>
  http.post(`/data/datasets/${ek(key)}/generate-static-crud-interfaces`, body)
export const generateCrudInterfaces = (key, body) =>
  http.post(`/data/datasets/${ek(key)}/generate-crud-interfaces`, body)

export const listInterfaceGroups = () => http.get('/data/interface-groups')
export const createInterfaceGroup = data => http.post('/data/interface-groups', data)
export const updateInterfaceGroup = (id, data) => http.put(`/data/interface-groups/${ek(id)}`, data)
export const deleteInterfaceGroup = id => http.delete(`/data/interface-groups/${ek(id)}`)

export const listDataInterfaces = params => http.get('/data/interfaces', { params })
export const createDataInterface = data => http.post('/data/interfaces', data)
export const updateDataInterface = (key, data) => http.put(`/data/interfaces/${ek(key)}`, data)
export const deleteDataInterface = key => http.delete(`/data/interfaces/${ek(key)}`)
export const batchDeleteDataInterfaces = ids => http.post('/data/interfaces/batch-delete', { ids })

import http from './http'

// 工单列表 / 详情
export const getWorkOrders = (params = {}) => http.get('/work-orders', { params })
export const getWorkOrder = (id) => http.get(`/work-orders/${id}`)
export const updateWorkOrder = (id, data) => http.put(`/work-orders/${id}`, data)
export const deleteWorkOrder = (id) => http.delete(`/work-orders/${id}`)
export const assignWorkOrder = (id, assignedTo, comment) =>
  http.post(`/work-orders/${id}/assign`, { assigned_to: assignedTo, comment })
export const changeWorkOrderStatus = (id, status, comment) =>
  http.post(`/work-orders/${id}/status`, { status, comment })
// 批量归档 / 取消归档
export const batchArchiveWorkOrders = (ids) => http.post('/work-orders/batch/archive', { ids })
export const batchUnarchiveWorkOrders = (ids) => http.post('/work-orders/batch/unarchive', { ids })
export const workOrderItemDownloadUrl = (id, itemId) =>
  `/api/work-orders/${id}/items/${itemId}/download?token=${encodeURIComponent(localStorage.getItem('token') || '')}`

export const updateWorkOrderItem = (workOrderId, itemId, file) => {
  const formData = new FormData()
  formData.append('file', file)
  return http.put(`/work-orders/${workOrderId}/items/${itemId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}

// 工单类型
export const getWorkOrderTypes = () => http.get('/work-orders/types')
export const createWorkOrderType = (data) => http.post('/work-orders/types', data)
export const updateWorkOrderType = (id, data) => http.put(`/work-orders/types/${id}`, data)
export const deleteWorkOrderType = (id) => http.delete(`/work-orders/types/${id}`)

// 外发 webhook
export const getWorkOrderWebhooks = (params = {}) => http.get('/work-orders/webhooks', { params })
export const createWorkOrderWebhook = (data) => http.post('/work-orders/webhooks', data)
export const updateWorkOrderWebhook = (id, data) => http.put(`/work-orders/webhooks/${id}`, data)
export const deleteWorkOrderWebhook = (id) => http.delete(`/work-orders/webhooks/${id}`)

// 外发历史日志
export const getWorkOrderWebhookLogs = (params = {}) => http.get('/work-orders/webhooks/logs', { params })
export const getWorkOrderWebhookLog = (id) => http.get(`/work-orders/webhooks/logs/${id}`)

// 标签字典（管理端 CRUD）
export const listWorkOrderTags = () => http.get('/work-orders/tag-dict')
export const createWorkOrderTag = (data) => http.post('/work-orders/tag-dict', data)
export const updateWorkOrderTag = (id, data) => http.put(`/work-orders/tag-dict/${id}`, data)
export const deleteWorkOrderTag = (id) => http.delete(`/work-orders/tag-dict/${id}`)
// 标签字典（启用项，处理端选择用）+ 工单标签维护
export const getWorkOrderTagDict = () => http.get('/work-orders/tags')
export const setWorkOrderTags = (id, tags) => http.put(`/work-orders/${id}/tags`, { tags })

// 工作流管理
export const getWorkOrderWorkflows = (params = {}) => http.get('/work-orders/workflows', { params })
export const getWorkOrderWorkflow = (id) => http.get(`/work-orders/workflows/${id}`)
export const createWorkOrderWorkflow = (data) => http.post('/work-orders/workflows', data)
export const updateWorkOrderWorkflow = (id, data) => http.put(`/work-orders/workflows/${id}`, data)
export const deleteWorkOrderWorkflow = (id) => http.delete(`/work-orders/workflows/${id}`)
export const testWorkOrderWorkflow = (id, workOrderId, event) =>
  http.post(`/work-orders/workflows/${id}/test`, { work_order_id: workOrderId, event })
export const getWorkOrderWorkflowLogs = (params = {}) => http.get('/work-orders/workflow-logs', { params })

// 识别工单附件中的二维码/条形码
export const recognizeWorkOrderItemBarcode = (itemId) => http.post(`/work-orders/items/${itemId}/recognize-barcode`)

// 工单进展
export const getWorkOrderProgress = (id) => http.get(`/work-orders/${id}/progress`)
export const createWorkOrderProgress = (id, content) => http.post(`/work-orders/${id}/progress`, { content })
export const uploadWorkOrderProgressAttachment = (progressId, file, kind, metaJSON) => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('kind', kind)
  if (metaJSON) formData.append('meta_json', metaJSON)
  return http.post(`/work-orders/progress/${progressId}/attachments`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}
export const workOrderProgressAttachmentDownloadUrl = (attId) =>
  `/api/work-orders/progress/attachments/${attId}/download?token=${encodeURIComponent(localStorage.getItem('token') || '')}`

// 统计分析报告
export const getWorkOrderStatistics = (params = {}) => http.get('/work-orders/statistics', { params })

// 报告分享
export const createWorkOrderReportShare = (data) => http.post('/work-orders/report-shares', data)
export const listWorkOrderReportShares = () => http.get('/work-orders/report-shares')
export const getWorkOrderReportShareViews = (id) => http.get(`/work-orders/report-shares/${id}/views`)
export const deleteWorkOrderReportShare = (id) => http.delete(`/work-orders/report-shares/${id}`)
export const getWorkOrderReportShare = (token) => http.get(`/share/work-order-reports/${token}`)
export const getSharedWorkOrders = (token, params = {}) => http.get(`/share/work-order-reports/${token}/work-orders`, { params })
export const getSharedWorkOrderStatistics = (token, params = {}) => http.get(`/share/work-order-reports/${token}/statistics`, { params })
export const getSharedWorkOrderProgress = (token, workOrderId) => http.get(`/share/work-order-reports/${token}/work-orders/${workOrderId}/progress`)

// 分享链接需登录模式下的工单操作
export const getSharedWorkOrderDetail = (token, workOrderId) => http.get(`/share/work-order-reports/${token}/work-orders/${workOrderId}/detail`)
export const addSharedWorkOrderComment = (token, workOrderId, comment) => http.post(`/share/work-order-reports/${token}/work-orders/${workOrderId}/comment`, { comment })
export const updateSharedWorkOrderStatus = (token, workOrderId, status, comment) => http.post(`/share/work-order-reports/${token}/work-orders/${workOrderId}/status`, { status, comment })
export const updateSharedWorkOrderFields = (token, workOrderId, fields) => http.put(`/share/work-order-reports/${token}/work-orders/${workOrderId}/fields`, fields)

import http from './http'

export const listAgentMenuItems = () => http.get('/agent-menus')
export const createAgentMenuItem = data => http.post('/agent-menus', data)
export const updateAgentMenuItem = (id, data) => http.put(`/agent-menus/${id}`, data)
export const deleteAgentMenuItem = id => http.delete(`/agent-menus/${id}`)
export const deployAgentMenus = data => http.post('/agent-menus/deploy', data)

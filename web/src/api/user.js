import http from './http'

export const listUsers = () => http.get('/users')
export const createUser = (data) => http.post('/users', data)
export const updateUser = (id, data) => http.put(`/users/${id}`, data)
export const deleteUser = (id) => http.delete(`/users/${id}`)

export const getRegisterSetting = () => http.get('/settings/register')
export const updateRegisterSetting = (allow) => http.put('/settings/register', { allow_register: allow })

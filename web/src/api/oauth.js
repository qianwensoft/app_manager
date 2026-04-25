import http from './http'

export const listOAuthClients = () => http.get('/oauth/clients')
export const getOAuthClient = (id) => http.get(`/oauth/clients/${id}`)
export const createOAuthClient = (data) => http.post('/oauth/clients', data)
export const updateOAuthClient = (id, data) => http.put(`/oauth/clients/${id}`, data)
export const deleteOAuthClient = (id) => http.delete(`/oauth/clients/${id}`)
export const revokeOAuthClientTokens = (id) => http.post(`/oauth/clients/${id}/revoke-tokens`)
export const getScopeCatalogOAuth = () => http.get('/auth/scope-catalog')

// Authorization Code flow
export const getOAuthAuthorizeInfo = (params) => http.get('/oauth/authorize', { params })
export const postOAuthAuthorizeConsent = (data) => http.post('/oauth/authorize', data)

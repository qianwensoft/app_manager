import http from './http'

export const listThirdPartyProviders = () => http.get('/thirdparty')
export const getThirdPartyProvider = (id) => http.get(`/thirdparty/${id}`)
export const createThirdPartyProvider = (data) => http.post('/thirdparty', data)
export const updateThirdPartyProvider = (id, data) => http.put(`/thirdparty/${id}`, data)
export const deleteThirdPartyProvider = (id) => http.delete(`/thirdparty/${id}`)
export const getThirdPartyTokenStatus = (id) => http.get(`/thirdparty/${id}/token`)

// FreePass
export const getFreePassAuthorizeURL = (id) => http.get(`/thirdparty/${id}/authorize`)
export const refreshFreePassToken = (id) => http.post(`/thirdparty/${id}/freepass/refresh`)

// WeChat
export const getWechatPreAuthCode = (id) => http.post(`/thirdparty/${id}/wechat/preauthcode`)
export const refreshWechatToken = (id, authorizerAppid) =>
  http.post(`/thirdparty/${id}/wechat/refresh${authorizerAppid ? '?authorizer_appid=' + authorizerAppid : ''}`)
export const setWechatTicket = (id, ticket) => http.post(`/thirdparty/${id}/wechat/ticket`, { ticket })

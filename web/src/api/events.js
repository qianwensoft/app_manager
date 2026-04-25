import http from './http'

export const listDeviceEvents = (params) => http.get('/events', { params })
export const getEventTypes = () => http.get('/events/types')
/** @param {{ definitionIds?: number[], groupIds?: number[] }} [scope] 不传则下发全部已启用定义 */
export const batchStartCustomEventListen = (deviceIds, scope = {}) =>
  http.post('/custom-events/listen/start', {
    device_ids: deviceIds,
    definition_ids: scope.definitionIds?.length ? scope.definitionIds : undefined,
    group_ids: scope.groupIds?.length ? scope.groupIds : undefined
  })
export const batchStopCustomEventListen = (deviceIds) =>
  http.post('/custom-events/listen/stop', { device_ids: deviceIds })

/** 删除某台设备的监听快照（会先尽力下发 stop_custom_event_listen） */
export const deleteCustomEventListenState = (deviceId) =>
  http.delete(`/custom-events/listen-state/device/${deviceId}`)

/** @param {{ device_id?: string, event_key?: string, include_inactive?: string }} [params] */
export const getCustomListenState = (params) => http.get('/custom-events/listen-state', { params })
export const getCustomListenAggregates = () => http.get('/custom-events/listen-state/aggregates')

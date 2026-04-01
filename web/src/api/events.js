import http from './http'

export function listDeviceEvents(params = {}) {
  return http.get('/events', { params })
}

export function getEventTypes() {
  return http.get('/events/types')
}

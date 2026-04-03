import http from './http'

export const getSetupStatus = () => http.get('/setup/status')
export const testDbConnection = (data) => http.post('/setup/test-db', data)
export const completeSetup = (data) => http.post('/setup/complete', data)

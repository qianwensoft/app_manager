import http from './http'

export interface Device { id: number; name: string; serial: string }
export interface OrgUser { id: number; username: string; role: string }
export interface Department { id: number; name: string }
export interface Position { id: number; name: string }

export const orgApi = {
  listDevices: (): Promise<{ data: Device[] }> =>
    http.get('/devices'),

  listUsers: (): Promise<{ data: OrgUser[] }> =>
    http.get('/users'),

  listDepartments: (): Promise<{ data: Department[] }> =>
    http.get('/org/departments'),

  listPositions: (): Promise<{ data: Position[] }> =>
    http.get('/org/positions'),
}

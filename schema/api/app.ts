// App (APK) and InstallTask schemas

export interface App {
  id: number
  name: string
  package_name: string
  version_name: string
  version_code: number
  file_path: string
  file_size: number
  md5: string
  description: string
  uploaded_by: number
  created_at: string
}

export interface ListAppsResponse {
  data: App[]
}

export interface GetAppResponse {
  data: App
}

/** POST /api/apps — multipart/form-data with "file" (.apk) and optional "description" */
export interface UploadAppResponse {
  data: App
}

export interface UpdateAppMetaRequest {
  description: string
}

export interface InstallAppRequest {
  device_ids: number[]
  /** Default true: attempt to launch the app after install */
  start_after_install?: boolean
}

export interface UninstallAppRequest {
  device_ids: number[]
}

export interface InstallTask {
  id: number
  app_id: number
  device_id: number
  /** "install" | "uninstall" */
  action: string
  /** "pending" | "running" | "success" | "failed" | "cancelled" */
  status: string
  output: string
  start_after_install: boolean
  created_by: number
  created_at: string
  finished_at: string | null
}

export interface InstallAppResponse {
  data: InstallTask[]
}

export interface ListTasksResponse {
  data: InstallTask[]
}

export interface GetTaskResponse {
  data: InstallTask
}

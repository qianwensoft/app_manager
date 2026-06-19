import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { scadaApi } from '@/api/scada'
import type { ScadaGroup, ScadaInfo, CanvasProject } from '@/types'
import { useEditorStore } from '@/store/editorStore'

export const scadaKeys = {
  groups: ['scada', 'groups'] as const,
  infos: (groupId?: number) => ['scada', 'infos', groupId] as const,
  info: (id: number) => ['scada', 'info', id] as const,
}

// groups
export function useScadaGroups() {
  return useQuery({
    queryKey: scadaKeys.groups,
    queryFn: () => scadaApi.listGroups().then((r) => r.data),
  })
}

export function useCreateGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<ScadaGroup>) => scadaApi.createGroup(body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: scadaKeys.groups }),
  })
}

export function useUpdateGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<ScadaGroup> }) =>
      scadaApi.updateGroup(id, body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: scadaKeys.groups }),
  })
}

export function useDeleteGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => scadaApi.deleteGroup(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: scadaKeys.groups }),
  })
}

// infos
export function useScadaInfos(groupId?: number) {
  return useQuery({
    queryKey: scadaKeys.infos(groupId),
    queryFn: () => scadaApi.listInfos(groupId).then((r) => r.data),
  })
}

export function useScadaInfo(id: number) {
  return useQuery({
    queryKey: scadaKeys.info(id),
    queryFn: () => scadaApi.getInfo(id).then((r) => r.data),
    enabled: id > 0,
  })
}

// 免登分享：按 share_token 拉取已发布组态（供 app 端 WebView / 外部分享）
export function useScadaByShareToken(token?: string) {
  return useQuery({
    queryKey: ['scada', 'share', token] as const,
    queryFn: () => scadaApi.getByShareToken(token!).then((r) => r.data),
    enabled: !!token,
    retry: false,
  })
}

export function useCreateInfo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<ScadaInfo>) => scadaApi.createInfo(body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scada', 'infos'] }),
  })
}

export function useUpdateInfo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<ScadaInfo> }) =>
      scadaApi.updateInfo(id, body).then((r) => r.data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: scadaKeys.info(id) })
      qc.invalidateQueries({ queryKey: ['scada', 'infos'] })
    },
  })
}

export function useDeleteInfo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => scadaApi.deleteInfo(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scada', 'infos'] }),
  })
}

// save canvas
export function useSaveCanvas() {
  const qc = useQueryClient()
  const markClean = useEditorStore((s) => s.markClean)
  return useMutation({
    mutationFn: (vars: { id: number; project: CanvasProject; previewImage?: string }) =>
      scadaApi.saveCanvas({
        id: vars.id,
        canvas_data: JSON.stringify(vars.project),
        preview_image: vars.previewImage,
      }).then((r) => r.data),
    onSuccess: (data) => {
      markClean()
      qc.invalidateQueries({ queryKey: scadaKeys.info(data.id) })
    },
  })
}

export function usePublish() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => scadaApi.publish(id).then((r) => r.data),
    onSuccess: (data) => qc.invalidateQueries({ queryKey: scadaKeys.info(data.id) }),
  })
}

export function useUnpublish() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => scadaApi.unpublish(id).then((r) => r.data),
    onSuccess: (data) => qc.invalidateQueries({ queryKey: scadaKeys.info(data.id) }),
  })
}

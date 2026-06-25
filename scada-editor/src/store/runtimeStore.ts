import { create } from 'zustand'

interface RuntimeState {
  // modal element ID → visible
  modalVisible: Record<string, boolean>
  openModal: (id: string) => void
  closeModal: (id: string) => void
  toggleModal: (id: string) => void
  isModalVisible: (id: string) => boolean
}

export const useRuntimeStore = create<RuntimeState>((set, get) => ({
  modalVisible: {},
  openModal: (id) => set((s) => ({ modalVisible: { ...s.modalVisible, [id]: true } })),
  closeModal: (id) => set((s) => ({ modalVisible: { ...s.modalVisible, [id]: false } })),
  toggleModal: (id) => set((s) => ({ modalVisible: { ...s.modalVisible, [id]: !s.modalVisible[id] } })),
  isModalVisible: (id) => !!get().modalVisible[id],
}))

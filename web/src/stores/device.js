import { defineStore } from 'pinia'
import { ref } from 'vue'
import http from '@/api/http'

export const useDeviceStore = defineStore('device', () => {
  const devices = ref([])
  const current = ref(null)

  const fetchDevices = async () => {
    const res = await http.get('/devices')
    devices.value = res.data
  }

  const fetchDevice = async (id) => {
    const res = await http.get(`/devices/${id}`)
    current.value = res.data
  }

  const scanDevices = async () => {
    const res = await http.post('/devices/scan')
    await fetchDevices()
    return res.data
  }

  return { devices, current, fetchDevices, fetchDevice, scanDevices }
})

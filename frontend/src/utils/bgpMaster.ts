import type { Device } from '../services/api'

export const STORAGE_MASTER_KEY = 'netpulse_bgp_master_device_id'

/**
 * Detects whether a device is the BGP Master / Central Controller based on:
 * 1. Explicit user designation in localStorage or device.is_master
 * 2. Exact match with the production master router: 'BGP-RT.01.PA.PIRB.01'
 * 3. Heuristic matching names like 'RT.01', 'PIRB.01', 'BGP-01', 'BGP.01', 'MASTER', 'PRINCIPAL'
 * 4. Fallback to the first BGP-enabled device
 */
export function isBGPMasterDevice(device: Device, allDevices: Device[] = []): boolean {
  if (!device) return false

  // 1. Explicitly saved ID in localStorage
  try {
    const savedMasterId = localStorage.getItem(STORAGE_MASTER_KEY)
    if (savedMasterId) {
      if (device.id === savedMasterId) return true
      // If the saved ID matches a valid device in allDevices, other devices are not master
      if (allDevices.some((d) => d.id === savedMasterId)) {
        return false
      }
    }
  } catch {
    // localStorage unavailable
  }

  // 2. Explicitly flagged on device object
  if (device.is_master) return true

  // 3. Exact match with primary router specified by user
  const nameUpper = (device.name || '').toUpperCase().trim()
  const hostUpper = (device.host || '').toUpperCase().trim()

  if (nameUpper === 'BGP-RT.01.PA.PIRB.01' || nameUpper.includes('PIRB.01') || nameUpper.includes('PIRB')) {
    return true
  }

  // 4. Pattern heuristics for primary router (RT.01, RT-01, BGP.01, BGP-01, MASTER, PRINCIPAL)
  const isCandidate =
    nameUpper.includes('RT.01') ||
    nameUpper.includes('RT-01') ||
    nameUpper.includes('BGP.01') ||
    nameUpper.includes('BGP-01') ||
    nameUpper.includes('MASTER') ||
    nameUpper.includes('PRINCIPAL') ||
    hostUpper.includes('PIRB')

  if (isCandidate) {
    const hasExactPIRB = allDevices.some(
      (d) => d.id !== device.id && d.name?.toUpperCase().includes('PIRB')
    )
    if (!hasExactPIRB) {
      return true
    }
  }

  // 5. If this is the only BGP device in the network
  const bgpDevices = allDevices.filter((d) => d.is_bgp !== false)
  if (bgpDevices.length === 1 && bgpDevices[0].id === device.id) {
    return true
  }

  return false
}

/**
 * Returns the resolved Master BGP router from a list of devices.
 * Always resolves to the master router; falls back to the first BGP-enabled device.
 */
export function getBGPMasterDevice(devices: Device[]): Device | null {
  if (!devices || devices.length === 0) return null

  // 1. Check if any device matches master heuristics
  const master = devices.find((d) => isBGPMasterDevice(d, devices))
  if (master) return master

  // 2. Fallback to first BGP-enabled device
  const firstBGP = devices.find((d) => d.is_bgp !== false)
  if (firstBGP) return firstBGP

  return devices[0] || null
}

/**
 * Allows the operator to set or change the designated BGP Master device.
 */
export function setBGPMasterDeviceId(deviceId: string): void {
  try {
    localStorage.setItem(STORAGE_MASTER_KEY, deviceId)
    window.dispatchEvent(new CustomEvent('bgp_master_changed', { detail: { deviceId } }))
  } catch {
    // Ignore storage errors
  }
}

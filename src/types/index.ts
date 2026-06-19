// types/index.ts

// export type InstanceInfo = {
//   instanceId: string
//   privateIp: string
//   name: string
// }

// type HostMetrics = {
//   cpuUsedPercent?: number | null
//   memoryUsedPercent?: number | null
//   diskUsedPercent?: number | null
// }

// export type MetricsMap = {
//   [host: string]: HostMetrics
// }

// export type HostInstance = {
//   instanceId: string
//   privateIp: string
//   name: string
//   host: string
// }

/**
 * -----------------------
 * Types
 * -----------------------
 */

export type Instance = {
  instanceId: string
  privateIp: string
  name: string
}

export type HostInstance = Instance & {
  host: string
}

export type MetricIds = {
  host: string
  memId: string
  cpuId: string
  diskId: string
}

export type Metrics = {
  cpuUsedPercent?: number | null
  memoryUsedPercent?: number | null
  diskUsedPercent?: number | null
}

export type MetricsMap = Record<string, Metrics>
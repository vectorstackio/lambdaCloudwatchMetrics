// handler.ts

import { getRunningInstances, fetchMetrics } from './lib'
import type { HostInstance } from './types'

/**
 * -----------------------
 * Lambda handler
 * -----------------------
 */
export const handler = async () => {
  try {
    const instances = await getRunningInstances()

    const hosts: HostInstance[] = instances.map(i => ({
      ...i,
      host: `ip-${i.privateIp.replace(/\./g, '-')}`
    }))

    const metrics = await fetchMetrics(hosts)

    const response = hosts.map(h => {
      const m = metrics[h.host] ?? {}

      return {
        instanceId: h.instanceId,
        name: h.name,
        host: h.host,
        privateIp: h.privateIp,
        instanceType: h.instanceType,
        cpuUsedPercent: m.cpuUsedPercent ?? null,
        memoryUsedPercent: m.memoryUsedPercent ?? null,
        diskUsedPercent: m.diskUsedPercent ?? null
      }
    })

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        generatedAt: new Date().toISOString(),
        instances: response
      })
    }

  } catch (err: unknown) {
    console.error('Lambda error:', err)

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error in cloudwatchMetrics Lambda'
      })
    }
  }
}
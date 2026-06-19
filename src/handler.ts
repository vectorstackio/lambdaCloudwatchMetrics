// handler.ts

// import {
//   EC2Client,
//   DescribeInstancesCommand
// } from '@aws-sdk/client-ec2'

// import {
//   CloudWatchClient,
//   GetMetricDataCommand,
//   MetricDataQuery
//   //MetricDataResult
// } from '@aws-sdk/client-cloudwatch'

import {
  getRunningInstances,
  fetchMetrics
} from './lib'

import type {
  //Instance,
  HostInstance,
  //MetricIds,
  //Metrics,
  //MetricsMap
} from './types'

// /**
//  * -----------------------
//  * Types
//  * -----------------------
//  */

// type Instance = {
//   instanceId: string
//   privateIp: string
//   name: string
// }

// type HostInstance = Instance & {
//   host: string
// }

// type MetricIds = {
//   host: string
//   memId: string
//   cpuId: string
//   diskId: string
// }

// type Metrics = {
//   cpuUsedPercent?: number | null
//   memoryUsedPercent?: number | null
//   diskUsedPercent?: number | null
// }

// type MetricsMap = Record<string, Metrics>

/**
 * -----------------------
 * AWS Clients
 * -----------------------
 */

// const ec2 = new EC2Client({})
// const cloudwatch = new CloudWatchClient({})

// const NAMESPACE = 'FinOps/EC2'

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
        cpuUsedPercent: m.cpuUsedPercent ?? null,
        memoryUsedPercent: m.memoryUsedPercent ?? null,
        diskUsedPercent: m.diskUsedPercent ?? null
      }
    })

    console.log('Returning')

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
        error: 'Failed to fetch EC2 metrics'
      })
    }
  }
}

// /**
//  * -----------------------
//  * EC2: Get instances
//  * -----------------------
//  */

// async function getRunningInstances(): Promise<Instance[]> {
//   const res = await ec2.send(
//     new DescribeInstancesCommand({
//       Filters: [
//         {
//           Name: 'instance-state-name',
//           Values: ['running']
//         }
//       ]
//     })
//   )

//   const instances: Instance[] = []

//   for (const r of res.Reservations ?? []) {
//     for (const i of r.Instances ?? []) {
//       if (!i.InstanceId || !i.PrivateIpAddress) continue

//       instances.push({
//         instanceId: i.InstanceId,
//         privateIp: i.PrivateIpAddress,
//         name:
//           i.Tags?.find(t => t.Key === 'Name')?.Value ??
//           i.InstanceId
//       })
//     }
//   }

//   return instances
// }

// /**
//  * -----------------------
//  * CloudWatch metrics
//  * -----------------------
//  */

// async function fetchMetrics(hosts: HostInstance[]): Promise<MetricsMap> {
//   const queries: MetricDataQuery[] = []
//   // const queries: CloudWatchClient.Types.MetricDataQuery[] = []
//   const idMap: MetricIds[] = []

//   let i = 0

//   for (const h of hosts) {
//     const host = h.host

//     const memId = `m${i}`
//     const cpuId = `c${i}`
//     const diskId = `d${i}`

//     idMap.push({ host, memId, cpuId, diskId })

//     queries.push({
//       Id: memId,
//       MetricStat: {
//         Metric: {
//           Namespace: NAMESPACE,
//           MetricName: 'mem_used_percent',
//           Dimensions: [{ Name: 'host', Value: host }]
//         },
//         Period: 300,
//         Stat: 'Average'
//       }
//     })

//     queries.push({
//       Id: cpuId,
//       MetricStat: {
//         Metric: {
//           Namespace: NAMESPACE,
//           MetricName: 'cpu_usage_idle',
//           Dimensions: [
//             { Name: 'cpu', Value: 'cpu-total' },
//             { Name: 'host', Value: host }
//           ]
//         },
//         Period: 300,
//         Stat: 'Average'
//       }
//     })

//     queries.push({
//       Id: diskId,
//       MetricStat: {
//         Metric: {
//           Namespace: NAMESPACE,
//           MetricName: 'disk_used_percent',
//           Dimensions: [
//             { Name: 'device', Value: 'nvme0n1p1' },
//             { Name: 'fstype', Value: 'ext4' },
//             { Name: 'path', Value: '/' },
//             { Name: 'host', Value: host }
//           ]
//         },
//         Period: 300,
//         Stat: 'Average'
//       }
//     })

//     i++
//   }

//   const result = await cloudwatch.send(
//     new GetMetricDataCommand({
//       StartTime: new Date(Date.now() - 15 * 60 * 1000),
//       EndTime: new Date(),
//       MetricDataQueries: queries,
//       ScanBy: 'TimestampDescending'
//     })
//   )

//   const grouped: MetricsMap = {}

//   for (const r of result.MetricDataResults ?? []) {
//     if (!r.Id) continue

//     const map = idMap.find(
//       x => x.memId === r.Id ||
//         x.cpuId === r.Id ||
//         x.diskId === r.Id
//     )

//     if (!map) continue

//     const host = map.host
//     grouped[host] ??= {}

//     const value = r.Values?.[0] ?? null

//     if (r.Id === map.memId) {
//       grouped[host].memoryUsedPercent = value
//     }

//     if (r.Id === map.cpuId) {
//       grouped[host].cpuUsedPercent =
//         value !== null ? 100 - value : null
//     }

//     if (r.Id === map.diskId) {
//       grouped[host].diskUsedPercent = value
//     }
//   }

//   return grouped
// }

// import {
//   EC2Client,
//   DescribeInstancesCommand
// } from '@aws-sdk/client-ec2'

// import {
//   CloudWatchClient,
//   GetMetricDataCommand
// } from '@aws-sdk/client-cloudwatch'

// import type {
//   InstanceInfo,
//   MetricsMap,
//   HostInstance
// } from './types'

// const ec2 = new EC2Client({})
// const cloudwatch = new CloudWatchClient({})

// const NAMESPACE = 'FinOps/EC2'

// export const handler = async () => {
//   try {
//     const instances = await getRunningInstances()

//     const hosts = instances.map(i => ({
//       ...i,
//       host: `ip-${i.privateIp.replace(/\./g, '-')}`
//     }))

//     const metricResults = await fetchMetrics(hosts)

//     const merged = hosts.map(instance => {
//       const metrics = metricResults[instance.host] || {}

//       return {
//         instanceId: instance.instanceId,
//         name: instance.name,
//         host: instance.host,
//         privateIp: instance.privateIp,
//         cpuUsedPercent: metrics.cpuUsedPercent ?? null,
//         memoryUsedPercent: metrics.memoryUsedPercent ?? null,
//         diskUsedPercent: metrics.diskUsedPercent ?? null
//       }
//     })

//     return {
//       statusCode: 200,
//       headers: {
//         'Content-Type': 'application/json',
//         'Access-Control-Allow-Origin': '*'
//       },
//       body: JSON.stringify({
//         generatedAt: new Date().toISOString(),
//         instances: merged
//       })
//     }
//   } catch (err) {
//     console.error(err)

//     return {
//       statusCode: 500,
//       body: JSON.stringify({
//         error: 'Failed to fetch metrics'
//       })
//     }
//   }
// }

// /**
//  * 1. Get EC2 instances
//  */
// async function getRunningInstances(): Promise<InstanceInfo[]> {
//   const res = await ec2.send(
//     new DescribeInstancesCommand({
//       Filters: [
//         {
//           Name: 'instance-state-name',
//           Values: ['running']
//         }
//       ]
//     })
//   )

//   const instances: InstanceInfo[] = []

//   for (const r of res.Reservations ?? []) {
//     for (const i of r.Instances ?? []) {
//       if (!i.InstanceId || !i.PrivateIpAddress) continue

//       instances.push({
//         instanceId: i.InstanceId,
//         privateIp: i.PrivateIpAddress,
//         name:
//           i.Tags?.find(t => t.Key === 'Name')?.Value ??
//           i.InstanceId
//       })
//     }
//   }

//   return instances
// }
// // async function getRunningInstances() {
// //   const res = await ec2.send(
// //     new DescribeInstancesCommand({
// //       Filters: [
// //         {
// //           Name: 'instance-state-name',
// //           Values: ['running']
// //         }
// //       ]
// //     })
// //   )

// //   const instances = []

// //   for (const r of res.Reservations ?? []) {
// //     for (const i of r.Instances ?? []) {
// //       instances.push({
// //         instanceId: i.InstanceId,
// //         privateIp: i.PrivateIpAddress,
// //         name:
// //           i.Tags?.find(t => t.Key === 'Name')?.Value ??
// //           i.InstanceId
// //       })
// //     }
// //   }

// //   return instances.filter(i => i.privateIp)
// // }

// /**
//  * 2. Fetch all CloudWatch metrics in batch
//  */
// async function fetchMetrics(hosts: HostInstance[]) {
//   const queries = []
//   let id = 0

//   for (const h of hosts) {
//     const host = h.host

//     // MEMORY
//     queries.push({
//       //Id: `mem${id}`,
//       Id: `mem_${h.host}`,
//       MetricStat: {
//         Metric: {
//           Namespace: NAMESPACE,
//           MetricName: 'mem_used_percent',
//           Dimensions: [{ Name: 'host', Value: host }]
//         },
//         Period: 300,
//         Stat: 'Average'
//       }
//     })

//     // CPU idle → convert later
//     queries.push({
//       Id: `cpu${id}`,
//       MetricStat: {
//         Metric: {
//           Namespace: NAMESPACE,
//           MetricName: 'cpu_usage_idle',
//           Dimensions: [
//             { Name: 'cpu', Value: 'cpu-total' },
//             { Name: 'host', Value: host }
//           ]
//         },
//         Period: 300,
//         Stat: 'Average'
//       }
//     })

//     // DISK (root only)
//     queries.push({
//       Id: `disk${id}`,
//       MetricStat: {
//         Metric: {
//           Namespace: NAMESPACE,
//           MetricName: 'disk_used_percent',
//           Dimensions: [
//             { Name: 'device', Value: 'nvme0n1p1' },
//             { Name: 'fstype', Value: 'ext4' },
//             { Name: 'path', Value: '/' },
//             { Name: 'host', Value: host }
//           ]
//         },
//         Period: 300,
//         Stat: 'Average'
//       }
//     })

//     id++
//   }

//   const response = await cloudwatch.send(
//     new GetMetricDataCommand({
//       StartTime: new Date(Date.now() - 15 * 60 * 1000),
//       EndTime: new Date(),
//       MetricDataQueries: queries,
//       ScanBy: 'TimestampDescending'
//     })
//   )

//   // const grouped = {}
//   const grouped: MetricsMap = {}

//   for (const r of response.MetricDataResults ?? []) {
//     if (!r.Id) continue
//     //const index = r.Id.replace(/[a-z]+/, "") // extract numeric suffix
//     //const host = hosts[index]?.host
//     //const [type, host] = r.Id.split('_')
//     const [type, ...rest] = r.Id.split('_')
//     const host = rest.join('_')
//     if (!host) continue

//     grouped[host] = grouped[host] || {}

//     if (type === 'mem') {
//       grouped[host].memoryUsedPercent = r.Values?.[0] ?? null
//     }

//     if (type === 'cpu') {
//       const idle = r.Values?.[0]
//       grouped[host].cpuUsedPercent =
//         idle !== undefined ? 100 - idle : null
//     }

//     if (type === 'disk') {
//       grouped[host].diskUsedPercent = r.Values?.[0] ?? null
//     }

//     // if (type === 'mem') {
//     //   grouped[host].memoryUsedPercent = r.Values?.[0] ?? null
//     // }

//     // if (r.Id.startsWith('cpu')) {
//     //   const idle = r.Values?.[0]
//     //   grouped[host].cpuUsedPercent =
//     //     idle !== undefined ? 100 - idle : null
//     // }

//     // if (r.Id.startsWith('disk')) {
//     //   grouped[host].diskUsedPercent = r.Values?.[0] ?? null
//     // }
//   }

//   return grouped
// }
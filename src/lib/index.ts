// lib/index.ts

import {
  EC2Client,
  DescribeInstancesCommand
} from '@aws-sdk/client-ec2'

import {
  CloudWatchClient,
  GetMetricDataCommand,
  MetricDataQuery
  //MetricDataResult
} from '@aws-sdk/client-cloudwatch'

import type {
  Instance,
  HostInstance,
  MetricIds,
  //Metrics,
  MetricsMap
} from './../types'

const ec2 = new EC2Client({})
const cloudwatch = new CloudWatchClient({})

const NAMESPACE = 'FinOps/EC2'

/**
 * -----------------------
 * EC2: Get instances
 * -----------------------
 */

export async function getRunningInstances(): Promise<Instance[]> {
  const res = await ec2.send(
    new DescribeInstancesCommand({
      Filters: [
        {
          Name: 'instance-state-name',
          Values: ['running']
        }
      ]
    })
  )

  const instances: Instance[] = []

  for (const r of res.Reservations ?? []) {
    for (const i of r.Instances ?? []) {
      if (!i.InstanceId || !i.PrivateIpAddress) continue

      instances.push({
        instanceId: i.InstanceId,
        privateIp: i.PrivateIpAddress,
        name:
          i.Tags?.find(t => t.Key === 'Name')?.Value ??
          i.InstanceId
      })
    }
  }

  return instances
}

/**
 * -----------------------
 * CloudWatch metrics
 * -----------------------
 */

export async function fetchMetrics(hosts: HostInstance[]): Promise<MetricsMap> {
  const queries: MetricDataQuery[] = []
  // const queries: CloudWatchClient.Types.MetricDataQuery[] = []
  const idMap: MetricIds[] = []

  let i = 0

  for (const h of hosts) {
    const host = h.host

    const memId = `m${i}`
    const cpuId = `c${i}`
    const diskId = `d${i}`

    idMap.push({ host, memId, cpuId, diskId })

    queries.push({
      Id: memId,
      MetricStat: {
        Metric: {
          Namespace: NAMESPACE,
          MetricName: 'mem_used_percent',
          Dimensions: [{ Name: 'host', Value: host }]
        },
        Period: 300,
        Stat: 'Average'
      }
    })

    queries.push({
      Id: cpuId,
      MetricStat: {
        Metric: {
          Namespace: NAMESPACE,
          MetricName: 'cpu_usage_idle',
          Dimensions: [
            { Name: 'cpu', Value: 'cpu-total' },
            { Name: 'host', Value: host }
          ]
        },
        Period: 300,
        Stat: 'Average'
      }
    })

    queries.push({
      Id: diskId,
      MetricStat: {
        Metric: {
          Namespace: NAMESPACE,
          MetricName: 'disk_used_percent',
          Dimensions: [
            { Name: 'device', Value: 'nvme0n1p1' },
            { Name: 'fstype', Value: 'ext4' },
            { Name: 'path', Value: '/' },
            { Name: 'host', Value: host }
          ]
        },
        Period: 300,
        Stat: 'Average'
      }
    })

    i++
  }

  const result = await cloudwatch.send(
    new GetMetricDataCommand({
      StartTime: new Date(Date.now() - 15 * 60 * 1000),
      EndTime: new Date(),
      MetricDataQueries: queries,
      ScanBy: 'TimestampDescending'
    })
  )

  const grouped: MetricsMap = {}

  for (const r of result.MetricDataResults ?? []) {
    if (!r.Id) continue

    const map = idMap.find(
      x => x.memId === r.Id ||
        x.cpuId === r.Id ||
        x.diskId === r.Id
    )

    if (!map) continue

    const host = map.host
    grouped[host] ??= {}

    const value = r.Values?.[0] ?? null

    if (r.Id === map.memId) {
      grouped[host].memoryUsedPercent = value
    }

    if (r.Id === map.cpuId) {
      grouped[host].cpuUsedPercent =
        value !== null ? 100 - value : null
    }

    if (r.Id === map.diskId) {
      grouped[host].diskUsedPercent = value
    }
  }

  return grouped
}
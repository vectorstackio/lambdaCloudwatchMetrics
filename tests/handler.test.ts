import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const aws = vi.hoisted(() => ({ ec2Send: vi.fn(), cloudwatchSend: vi.fn() }))

vi.mock('@aws-sdk/client-ec2', () => ({
  EC2Client: class { send = aws.ec2Send },
  DescribeInstancesCommand: class { constructor(public input: unknown) {} }
}))
vi.mock('@aws-sdk/client-cloudwatch', () => ({
  CloudWatchClient: class { send = aws.cloudwatchSend },
  GetMetricDataCommand: class { constructor(public input: unknown) {} }
}))

import { handler } from '../src/handler'

const instance = (overrides = {}) => ({
  InstanceId: 'i-123', PrivateIpAddress: '10.0.1.2', InstanceType: 't3.small',
  Tags: [{ Key: 'Name', Value: 'web' }], ...overrides
})
const body = (response: Awaited<ReturnType<typeof handler>>) => JSON.parse(response.body)

describe('Lambda handler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-02T12:00:00Z'))
    aws.ec2Send.mockReset().mockResolvedValue({ Reservations: [{ Instances: [instance()] }] })
    aws.cloudwatchSend.mockReset().mockResolvedValue({ MetricDataResults: [] })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

  it('returns instances and their latest metrics with the expected AWS queries', async () => {
    aws.ec2Send.mockResolvedValue({ Reservations: [{ Instances: [instance(), instance({ InstanceId: 'i-456', PrivateIpAddress: '10.0.1.3', Tags: [] })] }] })
    aws.cloudwatchSend.mockResolvedValue({ MetricDataResults: [
      { Id: 'm0', Values: [45, 99] }, { Id: 'c0', Values: [70] }, { Id: 'd0', Values: [80] },
      { Id: 'm1', Values: [0] }, { Id: 'c1', Values: [100] }, { Id: 'd1', Values: [0] }
    ] })
    const response = await handler()
    expect(response.statusCode).toBe(200)
    expect(response.headers).toEqual({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
    expect(body(response)).toEqual({ generatedAt: '2026-01-02T12:00:00.000Z', instances: [
      { instanceId: 'i-123', name: 'web', host: 'ip-10-0-1-2', privateIp: '10.0.1.2', instanceType: 't3.small', cpuUsedPercent: 30, memoryUsedPercent: 45, diskUsedPercent: 80 },
      { instanceId: 'i-456', name: 'i-456', host: 'ip-10-0-1-3', privateIp: '10.0.1.3', instanceType: 't3.small', cpuUsedPercent: 0, memoryUsedPercent: 0, diskUsedPercent: 0 }
    ] })
    expect(aws.ec2Send.mock.calls[0][0].input).toEqual({ Filters: [{ Name: 'instance-state-name', Values: ['running'] }] })
    const query = aws.cloudwatchSend.mock.calls[0][0].input
    expect(query).toMatchObject({ StartTime: new Date('2026-01-02T11:45:00Z'), EndTime: new Date('2026-01-02T12:00:00Z'), ScanBy: 'TimestampDescending' })
    expect(query.MetricDataQueries).toHaveLength(6)
    expect(query.MetricDataQueries.slice(0, 3)).toEqual([
      { Id: 'm0', MetricStat: { Metric: { Namespace: 'FinOps/EC2', MetricName: 'mem_used_percent', Dimensions: [{ Name: 'host', Value: 'ip-10-0-1-2' }] }, Period: 300, Stat: 'Average' } },
      { Id: 'c0', MetricStat: { Metric: { Namespace: 'FinOps/EC2', MetricName: 'cpu_usage_idle', Dimensions: [{ Name: 'cpu', Value: 'cpu-total' }, { Name: 'host', Value: 'ip-10-0-1-2' }] }, Period: 300, Stat: 'Average' } },
      { Id: 'd0', MetricStat: { Metric: { Namespace: 'FinOps/EC2', MetricName: 'disk_used_percent', Dimensions: [{ Name: 'device', Value: 'nvme0n1p1' }, { Name: 'fstype', Value: 'ext4' }, { Name: 'path', Value: '/' }, { Name: 'host', Value: 'ip-10-0-1-2' }] }, Period: 300, Stat: 'Average' } }
    ])
    expect(query.MetricDataQueries.slice(3).map((q: { Id: string }) => q.Id)).toEqual(['m1', 'c1', 'd1'])
    expect(console.error).not.toHaveBeenCalled()
  })

  it.each([{}, { Reservations: [] }, { Reservations: [{}] }])('handles missing or empty reservations: %j', async ec2 => {
    aws.ec2Send.mockResolvedValue(ec2)
    expect(body(await handler()).instances).toEqual([])
    expect(aws.cloudwatchSend.mock.calls[0][0].input.MetricDataQueries).toEqual([])
  })

  it('skips instances missing required fields and falls back to the ID for missing names', async () => {
    aws.ec2Send.mockResolvedValue({ Reservations: [{ Instances: [
      instance({ InstanceId: undefined }), instance({ PrivateIpAddress: '' }), instance({ InstanceType: undefined }),
      instance({ Tags: [{ Key: 'Other', Value: 'x' }] }), instance({ InstanceId: 'i-no-tags', Tags: undefined })
    ] }] })
    const instances = body(await handler()).instances
    expect(instances.map((i: { name: string }) => i.name)).toEqual(['i-123', 'i-no-tags'])
  })

  it('returns null for absent, empty and unknown metric results', async () => {
    aws.cloudwatchSend.mockResolvedValue({ MetricDataResults: [
      {}, { Id: 'unknown', Values: [1] }, { Id: 'm0', Values: [] }, { Id: 'c0' }, { Id: 'd0', Values: [null] }
    ] })
    expect(body(await handler()).instances[0]).toMatchObject({ cpuUsedPercent: null, memoryUsedPercent: null, diskUsedPercent: null })
  })

  it('returns null when metric results are missing entirely', async () => {
    aws.cloudwatchSend.mockResolvedValue({})
    expect(body(await handler()).instances[0]).toMatchObject({ cpuUsedPercent: null, memoryUsedPercent: null, diskUsedPercent: null })
  })

  it.each(['EC2', 'CloudWatch'])('returns a generic 500 when %s fails', async service => {
    const error = new Error('service unavailable')
    if (service === 'EC2') aws.ec2Send.mockRejectedValue(error)
    else aws.cloudwatchSend.mockRejectedValue(error)
    const response = await handler()
    expect(response.statusCode).toBe(500)
    expect(body(response)).toEqual({ error: 'Internal server error in cloudwatchMetrics Lambda' })
    expect(response.body).not.toContain(error.message)
    if (service === 'EC2') expect(aws.cloudwatchSend).not.toHaveBeenCalled()
  })

  it('handles malformed upstream instance data as an error', async () => {
    aws.ec2Send.mockResolvedValue({ Reservations: [{ Instances: [instance({ PrivateIpAddress: 42 })] }] })
    expect((await handler()).statusCode).toBe(500)
    expect(aws.cloudwatchSend).not.toHaveBeenCalled()
  })

  it('does not log sensitive information in dependency errors', async () => {
    const secret = 'secret-token-example-123'
    aws.ec2Send.mockRejectedValue(new Error(`Authorization: ${secret}`))
    await handler()
    expect(console.error).toHaveBeenCalledWith('Lambda error')
    expect(vi.mocked(console.error).mock.calls).toEqual([['Lambda error']])
  })
})

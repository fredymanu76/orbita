export type WearableProvider = 'apple_health' | 'fitbit' | 'garmin' | 'whoop'

export type WearableMetricType =
  | 'heart_rate'
  | 'heart_rate_variability'
  | 'sleep_quality'
  | 'sleep_duration'
  | 'steps'
  | 'stress_score'
  | 'respiratory_rate'

export interface WearableConnection {
  id: string
  user_id: string
  provider: WearableProvider
  status: 'disconnected' | 'connected' | 'syncing' | 'error'
  last_sync_at: string | null
  created_at: string
  updated_at: string
}

export interface WearableDataPoint {
  id: string
  user_id: string
  connection_id: string
  metric_type: WearableMetricType
  value: number
  measured_at: string
  created_at: string
}

export interface WearableAdapter {
  provider: WearableProvider
  connect(userId: string): Promise<{ redirectUrl: string }>
  handleCallback(userId: string, code: string): Promise<void>
  sync(userId: string, connectionId: string): Promise<WearableDataPoint[]>
  disconnect(userId: string, connectionId: string): Promise<void>
}

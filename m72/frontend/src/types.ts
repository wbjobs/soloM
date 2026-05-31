export interface SensorData {
  device_id: string
  temperature: number
  vibration_freq: number
  timestamp: string
}

export interface VibrationAlert {
  device_id: string
  std_dev: number
  mean: number
  threshold: number
  sample_count: number
  timestamp: string
}

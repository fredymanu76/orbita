import type { WearableAdapter, WearableDataPoint } from './types'

/**
 * Apple Health adapter — placeholder for future HealthKit integration.
 * Will require native bridge (e.g. via Capacitor or React Native).
 */
export const appleHealthAdapter: WearableAdapter = {
  provider: 'apple_health',

  async connect() {
    throw new Error('Apple Health integration requires a native app bridge. Coming soon.')
  },

  async handleCallback() {
    throw new Error('Apple Health does not use OAuth callback flow')
  },

  async sync(): Promise<WearableDataPoint[]> {
    throw new Error('Apple Health sync not yet implemented')
  },

  async disconnect() {
    throw new Error('Apple Health disconnect not yet implemented')
  },
}

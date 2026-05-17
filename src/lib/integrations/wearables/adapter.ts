import type { WearableAdapter, WearableProvider } from './types'

/**
 * Base adapter factory. Returns the appropriate adapter for a provider.
 * Currently all providers return the stub adapter.
 */
export function getWearableAdapter(provider: WearableProvider): WearableAdapter {
  // All providers are stubs for now
  return createStubAdapter(provider)
}

function createStubAdapter(provider: WearableProvider): WearableAdapter {
  return {
    provider,
    async connect() {
      throw new Error(`${provider} integration coming soon`)
    },
    async handleCallback() {
      throw new Error(`${provider} integration coming soon`)
    },
    async sync() {
      throw new Error(`${provider} integration coming soon`)
    },
    async disconnect() {
      throw new Error(`${provider} integration coming soon`)
    },
  }
}

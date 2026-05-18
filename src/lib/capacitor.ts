/**
 * Capacitor platform detection utility.
 * Returns true when running inside the native Android shell.
 */
export function isNativeApp(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window as any).Capacitor?.isNativePlatform?.() === true
  )
}

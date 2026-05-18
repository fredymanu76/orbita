import { isNativeApp } from './capacitor'

export async function hapticLight() {
  if (!isNativeApp()) return
  const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
  await Haptics.impact({ style: ImpactStyle.Light })
}

export async function hapticMedium() {
  if (!isNativeApp()) return
  const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
  await Haptics.impact({ style: ImpactStyle.Medium })
}

export async function hapticSelection() {
  if (!isNativeApp()) return
  const { Haptics } = await import('@capacitor/haptics')
  await Haptics.selectionStart()
}

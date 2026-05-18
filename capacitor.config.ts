import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.orbita.app',
  appName: 'Orbita',
  webDir: 'out',
  server: {
    // Remote URL pattern — the WebView loads the deployed Vercel app.
    // Update this to your production Vercel URL or custom domain.
    url: 'https://continuum-app.vercel.app',
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      backgroundColor: '#FAF9F7',
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#FAF9F7',
    },
  },
}

export default config

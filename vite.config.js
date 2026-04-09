import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'pwa-512x512.svg'],
      manifest: {
        name: 'Finca Manager',
        short_name: 'FincaMgr',
        description: 'Gestión integral de fincas agrícolas: ganado, motores, herramientas y cafetal',
        theme_color: '#2e7d32',
        background_color: '#f5f5f5',
        display: 'standalone',
        start_url: '/',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,ico}']
      }
    })
  ]
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Esto permite probar la PWA mientras desarrollas (npm run dev)
      devOptions: {
        enabled: true 
      },
      manifest: {
        name: 'AI Fitness Coach Pro',
        short_name: 'FitnessPro',
        description: 'Tu entrenador personal inteligente',
        theme_color: '#a3e635', // El color verde lima para la barra del celular
        background_color: '#09090b', // El fondo oscuro
        display: 'standalone', // Esto oculta la barra del navegador de internet
        icons: [
          {
            src: '/logo.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
})
import { RealtimeClient } from '@supabase/realtime-js'
import { SUPABASE_URL, SUPABASE_KEY, getAccessToken } from './auth.js'
import { syncTable } from './sync.js'
import { checkPendingVaccines, checkPendingFumigaciones, checkAplicacionesDelMes } from './wa.js'

const REALTIME_URL = SUPABASE_URL.replace('https://', 'wss://') + '/realtime/v1'

const BUSINESS_TABLES = new Set([
  'motores', 'motor_sesiones', 'motor_mantenimientos',
  'potreros', 'ganado', 'herramientas', 'potrero_eventos',
  'animal_pesajes', 'animal_vacunas', 'animal_fumigaciones', 'animal_ventas',
  'herramienta_mantenimientos', 'lotes', 'lote_aplicaciones',
  'lote_personal', 'personal', 'personal_asistencia',
])

const WA_TRIGGER_TABLES = new Set(['animal_vacunas', 'animal_fumigaciones', 'lote_aplicaciones'])

let client = null
let channel = null
let waCheckTimeout = null

function scheduleWaCheck() {
  if (waCheckTimeout) return
  waCheckTimeout = setTimeout(async () => {
    waCheckTimeout = null
    try {
      await checkPendingVaccines()
    } catch (e) { /* silent */ }
    try {
      await checkPendingFumigaciones()
    } catch (e) { /* silent */ }
    try {
      await checkAplicacionesDelMes()
    } catch (e) { /* silent */ }
  }, 1000)
}

export function initRealtime() {
  if (client) return

  const token = getAccessToken()

  client = new RealtimeClient(REALTIME_URL, {
    params: { apikey: SUPABASE_KEY },
    accessToken: () => getAccessToken() || SUPABASE_KEY,
  })

  channel = client.channel('table-changes')

  channel.on('postgres_changes',
    { event: '*', schema: 'public', table: '*' },
    (payload) => {
      const table = payload.table
      if (!BUSINESS_TABLES.has(table)) return

      const record = payload.new || payload.old || {}
      if (record.empresa_id && record.empresa_id !== window._currentEmpresaId) return

      syncTable(table)

      if (WA_TRIGGER_TABLES.has(table)) {
        scheduleWaCheck()
      }
    }
  )

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log('[Realtime] Conectado')
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.warn('[Realtime] Error al conectar, reintentando...')
    }
  })
}

export function disconnectRealtime() {
  if (waCheckTimeout) {
    clearTimeout(waCheckTimeout)
    waCheckTimeout = null
  }
  if (channel) {
    channel.unsubscribe()
    channel = null
  }
  if (client) {
    client = null
  }
}

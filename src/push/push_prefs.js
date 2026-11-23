import { getUser, saveUserMetadata } from '../auth.js';

export const PUSH_MODULES_SCHEMA = [
  {
    key: 'cafetal',
    label: 'Cafetal',
    icon: 'park',
    desc: 'Actividades de manejo, cosecha semanal, balance y fotografías por lote',
    subs: [
      {
        key: 'calendario_manejo',
        label: 'Calendario de Actividades (Manejo)',
        desc: 'Actividades programadas para hoy y labores atrasadas en los lotes.',
      },
      {
        key: 'cosecha_latas',
        label: 'Cosecha (Control de Latas)',
        desc: 'Latas registradas en la semana pendientes de enviar o actualizar en Cuentas.',
      },
      {
        key: 'balance_lote',
        label: 'Balance del Lote',
        desc: 'Planillas o movimientos del lote pendientes [Por Aprobar].',
      },
      {
        key: 'linea_tiempo_fotos',
        label: 'Línea de Tiempo (Fotografías)',
        desc: 'Nuevas fotografías de evolución o actividad subidas en los lotes.',
      },
    ],
  },
  {
    key: 'cuentas',
    label: 'Cuentas',
    icon: 'payments',
    desc: 'Pendientes de envío, aprobaciones y nuevos movimientos financieros',
    subs: [
      {
        key: 'pendientes_enviar',
        label: 'Pendiente de enviar a Cuentas',
        desc: 'Cosechas semanales de lotes y jornales de Personal sin enviar o con diferencias.',
      },
      {
        key: 'por_aprobar',
        label: 'Movimientos por aprobar',
        desc: 'Planillas o gastos enviados marcados como [Por Aprobar].',
      },
      {
        key: 'nuevos_movimientos',
        label: 'Nuevos movimientos (Egresos / Ingresos)',
        desc: 'Registros nuevos de egresos (Chapias, Abonadas, Cosecha, Personal, etc.) o ingresos.',
      },
    ],
  },
  {
    key: 'ganado',
    label: 'Ganado',
    icon: 'pets',
    desc: 'Partos próximos, vacunas y fumigaciones del hato',
    subs: [
      {
        key: 'partos',
        label: 'Partos próximos y gestación',
        desc: 'Aviso de mes 9 (16–30 días) y recta final (<= 15 días o vencidos).',
      },
      {
        key: 'vacunas',
        label: 'Vacunas',
        desc: 'Vacunas programadas para hoy y vacunas vencidas.',
      },
      {
        key: 'fumigaciones',
        label: 'Fumigaciones / Baños',
        desc: 'Fumigaciones programadas para hoy o pendientes.',
      },
    ],
  },
  {
    key: 'motores',
    label: 'Motores',
    icon: 'precision_manufacturing',
    desc: 'Horas de servicio, cambio de aceite y mantenimientos',
    subs: [
      {
        key: 'cambio_aceite',
        label: 'Cambio de aceite requerido',
        desc: 'Alerta al llegar a 80 h (1er cambio) o al límite configurado cada 5 h.',
      },
      {
        key: 'mantenimientos',
        label: 'Cambio de aceite realizado',
        desc: 'Confirmación instantánea al registrar el cambio y reiniciar el contador a 0 h.',
      },
    ],
  },
  {
    key: 'potreros',
    label: 'Potreros',
    icon: 'fence',
    desc: 'Rotación del ganado y ciclos de recuperación',
    subs: [
      {
        key: 'rotacion',
        label: 'Rotación y descanso',
        desc: 'Potreros que completan su ciclo de recuperación o requieren cambio.',
      },
    ],
  },
  {
    key: 'personal',
    label: 'Personal',
    icon: 'group',
    desc: 'Asistencia semanal y jornales de trabajadores',
    subs: [
      {
        key: 'asistencia_jornales',
        label: 'Asistencia semanal y jornales',
        desc: 'Jornales acumulados de la semana pendientes de liquidar en Cuentas.',
      },
    ],
  },
  {
    key: 'herramientas',
    label: 'Herramientas',
    icon: 'handyman',
    desc: 'Estado y mantenimientos del inventario',
    subs: [
      {
        key: 'mantenimiento',
        label: 'Mantenimientos de herramientas',
        desc: 'Herramientas reportadas en reparación, mantenimiento o mal estado.',
      },
    ],
  },
  {
    key: 'cultivos',
    label: 'Cultivos',
    icon: 'eco',
    desc: 'Ciclos agrícolas y próximas cosechas',
    subs: [
      {
        key: 'labores_cosecha',
        label: 'Labores y cosechas de cultivos',
        desc: 'Cultivos con fecha de cosecha próxima o vencida.',
      },
    ],
  },
];

function getEmpresaScope(empresaId) {
  return empresaId || (typeof window !== 'undefined' && window._currentEmpresaId) || localStorage.getItem('current_empresa_id') || 'default';
}

function getStorageKey(empresaId) {
  return `push_alert_prefs_${getEmpresaScope(empresaId)}`;
}

export function buildDefaultPushPrefs() {
  const prefs = {};
  for (const mod of PUSH_MODULES_SCHEMA) {
    const subs = {};
    for (const s of mod.subs) subs[s.key] = true;
    prefs[mod.key] = { enabled: true, subs };
  }
  return prefs;
}

export function normalizePushPrefs(raw) {
  const base = buildDefaultPushPrefs();
  if (!raw || typeof raw !== 'object') return base;
  for (const mod of PUSH_MODULES_SCHEMA) {
    const src = raw[mod.key];
    if (!src || typeof src !== 'object') continue;
    if (typeof src.enabled === 'boolean') {
      base[mod.key].enabled = src.enabled;
    }
    if (src.subs && typeof src.subs === 'object') {
      for (const s of mod.subs) {
        if (typeof src.subs[s.key] === 'boolean') {
          base[mod.key].subs[s.key] = src.subs[s.key];
        }
      }
    }
    if (Object.values(base[mod.key].subs).every(v => !v)) {
      base[mod.key].enabled = false;
    }
  }
  return base;
}

export function getPushAlertPrefs(empresaId) {
  try {
    const raw = localStorage.getItem(getStorageKey(empresaId));
    if (!raw) return buildDefaultPushPrefs();
    return normalizePushPrefs(JSON.parse(raw));
  } catch {
    return buildDefaultPushPrefs();
  }
}

export function isAlertEnabled(moduleKey, subKey = null, empresaId = null) {
  const prefs = getPushAlertPrefs(empresaId);
  const mod = prefs[moduleKey];
  if (!mod || mod.enabled === false) return false;
  if (!subKey) return true;
  return mod.subs?.[subKey] !== false;
}

export async function loadPushAlertPrefsFromUser(empresaId) {
  const scope = getEmpresaScope(empresaId);
  try {
    const user = await getUser();
    const remoteAll = user?.user_metadata?.push_alert_prefs;
    const remote = remoteAll && typeof remoteAll === 'object' ? remoteAll[scope] : null;
    if (remote && typeof remote === 'object') {
      const normalized = normalizePushPrefs(remote);
      localStorage.setItem(getStorageKey(scope), JSON.stringify(normalized));
      return normalized;
    }
  } catch {}
  return getPushAlertPrefs(scope);
}

export async function savePushAlertPrefs(prefs, empresaId) {
  const scope = getEmpresaScope(empresaId);
  const normalized = normalizePushPrefs(prefs);
  localStorage.setItem(getStorageKey(scope), JSON.stringify(normalized));

  if (navigator.onLine) {
    try {
      const user = await getUser().catch(() => null);
      const prevAll = (user?.user_metadata?.push_alert_prefs && typeof user.user_metadata.push_alert_prefs === 'object')
        ? user.user_metadata.push_alert_prefs
        : {};
      await saveUserMetadata({
        push_alert_prefs: {
          ...prevAll,
          [scope]: normalized,
        },
      });
    } catch (e) {
      console.warn('No se pudo sincronizar push_alert_prefs en Supabase:', e?.message || e);
    }
  }
  return normalized;
}

export function getPushPrefsSummaryText(empresaId) {
  const prefs = getPushAlertPrefs(empresaId);
  let activeMods = 0;
  let totalSubs = 0;
  let activeSubs = 0;
  for (const mod of PUSH_MODULES_SCHEMA) {
    const m = prefs[mod.key];
    totalSubs += mod.subs.length;
    if (m?.enabled) {
      const modSubsOn = mod.subs.filter(s => m.subs?.[s.key] !== false).length;
      if (modSubsOn > 0) {
        activeMods += 1;
        activeSubs += modSubsOn;
      }
    }
  }
  if (activeMods === 0) return 'Todos los módulos silenciados · Toca para elegir alertas';
  if (activeSubs === totalSubs) return `${activeMods} módulos activos (todas las alertas) · Toca para personalizar`;
  return `${activeMods} de ${PUSH_MODULES_SCHEMA.length} módulos activos (${activeSubs} alertas) · Toca para personalizar`;
}

export const DEFAULT_FUEL_MAINTENANCES = [
  { key: 'limpieza', nombre: 'Limpieza', desc: 'Filtro de aire, bujía y rejilla', cada_litros: 10 },
  { key: 'engrase', nombre: 'Engrase', desc: 'Caja de engranes', cada_litros: 20 },
];

function slugifyKey(name, fallbackIdx = 0) {
  const s = String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return s || `mant_${fallbackIdx}`;
}

export function isLikelyFuelEquipment(icon, nombre) {
  return icon === '✂️' || icon === '🪚' || /motoguada|guadañ|desmalez|motosierra/i.test(String(nombre || ''));
}

export function formatCurrencyL(val) {
  const v = Number(val) || 0;
  return 'L ' + v.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function encodeFuelLoadTag(unitPrice) {
  const p = parseFloat(unitPrice);
  if (p > 0) return `GASOLINA|${Math.round(p * 100) / 100}`;
  return 'GASOLINA';
}

export function parseFuelLoadPrice(sesion, fallbackPrice = 0) {
  const raw = String(sesion?.hora_inicio || '');
  if (raw.startsWith('GASOLINA|')) {
    const p = parseFloat(raw.slice('GASOLINA|'.length));
    if (p > 0) return Math.round(p * 100) / 100;
  }
  const fb = parseFloat(fallbackPrice);
  return fb > 0 ? Math.round(fb * 100) / 100 : 0;
}

export function parseMotorConfig(motor) {
  const raw = String(motor?.notas || '');
  const match = raw.match(/\[MOTOR_CONFIG_JSON\]([\s\S]*?)\[\/MOTOR_CONFIG_JSON\]/);
  const cleanNotas = raw.replace(/\[MOTOR_CONFIG_JSON\][\s\S]*?\[\/MOTOR_CONFIG_JSON\]/g, '').trim();
  const autoFuel = isLikelyFuelEquipment(motor?.icon, motor?.nombre);

  let parsed = null;
  if (match && match[1]) {
    try {
      parsed = JSON.parse(match[1]);
    } catch {
      parsed = null;
    }
  }

  const modo = parsed?.modo === 'gasolina'
    ? 'gasolina'
    : (parsed?.modo === 'horas' ? 'horas' : (autoFuel ? 'gasolina' : 'horas'));

  const horasPorLitro = (parseFloat(parsed?.horasPorLitro) > 0) ? parseFloat(parsed.horasPorLitro) : 2;
  const rawPrecio = parseFloat(parsed?.precioPorLitro);
  const precioPorLitro = rawPrecio > 0 ? Math.round(rawPrecio * 100) / 100 : 0;

  let mantenimientos;
  if (Array.isArray(parsed?.mantenimientos) && parsed.mantenimientos.length > 0) {
    mantenimientos = parsed.mantenimientos.map((m, idx) => ({
      key: String(m?.key || slugifyKey(m?.nombre, idx)),
      nombre: String(m?.nombre || 'Mantenimiento').trim() || 'Mantenimiento',
      desc: String(m?.desc || '').trim(),
      cada_litros: (parseFloat(m?.cada_litros) > 0) ? parseFloat(m.cada_litros) : 10,
    }));
  } else {
    mantenimientos = DEFAULT_FUEL_MAINTENANCES.map(m => ({ ...m }));
  }

  return { modo, horasPorLitro, precioPorLitro, mantenimientos, cleanNotas };
}

export function serializeMotorNotas(cleanNotas, config = {}) {
  const base = String(cleanNotas || '')
    .replace(/\[MOTOR_CONFIG_JSON\][\s\S]*?\[\/MOTOR_CONFIG_JSON\]/g, '')
    .trim();

  const modo = config?.modo === 'gasolina' ? 'gasolina' : 'horas';
  const horasPorLitro = (parseFloat(config?.horasPorLitro) > 0) ? parseFloat(config.horasPorLitro) : 2;
  const rawPrecio = parseFloat(config?.precioPorLitro);
  const precioPorLitro = rawPrecio > 0 ? Math.round(rawPrecio * 100) / 100 : 0;
  const mantenimientos = Array.isArray(config?.mantenimientos) && config.mantenimientos.length > 0
    ? config.mantenimientos.map((m, idx) => ({
        key: String(m?.key || slugifyKey(m?.nombre, idx)),
        nombre: String(m?.nombre || 'Mantenimiento').trim() || 'Mantenimiento',
        desc: String(m?.desc || '').trim(),
        cada_litros: (parseFloat(m?.cada_litros) > 0) ? parseFloat(m.cada_litros) : 10,
      }))
    : DEFAULT_FUEL_MAINTENANCES.map(m => ({ ...m }));

  if (modo === 'gasolina' || config?.forceTag) {
    const payload = modo === 'gasolina'
      ? { modo, horasPorLitro, mantenimientos, ...(precioPorLitro > 0 ? { precioPorLitro } : {}) }
      : { modo: 'horas' };
    const tag = `[MOTOR_CONFIG_JSON]${JSON.stringify(payload)}[/MOTOR_CONFIG_JSON]`;
    return base ? `${base}\n${tag}` : tag;
  }

  return base || null;
}

export function isFuelMotor(motor) {
  return parseMotorConfig(motor).modo === 'gasolina';
}

export function saveSharedFuelPrice(empresaId, price) {
  const n = Math.round((parseFloat(price) || 0) * 100) / 100;
  if (!(n > 0)) return;
  const empId = String(
    empresaId ||
    (typeof window !== 'undefined' ? window._currentEmpresaId : '') ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('current_empresa_id') : '') ||
    ''
  ).trim();
  if (!empId || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`fuel_default_price_${empId}`, String(n));
  } catch {}
}

export function resolveSharedFuelPrice(motor, allFuelMotors = [], empresaId = null) {
  if (motor) {
    const own = parseMotorConfig(motor).precioPorLitro;
    if (own > 0) return own;
  }
  const empId = String(
    empresaId ||
    motor?.empresa_id ||
    (typeof window !== 'undefined' ? window._currentEmpresaId : '') ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('current_empresa_id') : '') ||
    ''
  ).trim();
  for (const m of (allFuelMotors || [])) {
    if (!m || !isFuelMotor(m)) continue;
    if (empId && m.empresa_id && String(m.empresa_id) !== empId) continue;
    const p = parseMotorConfig(m).precioPorLitro;
    if (p > 0) return p;
  }
  if (empId && typeof localStorage !== 'undefined') {
    try {
      const saved = parseFloat(localStorage.getItem(`fuel_default_price_${empId}`) || '0');
      if (saved > 0) return Math.round(saved * 100) / 100;
    } catch {}
  }
  return 0;
}

export function formatLiters(val) {
  const n = Math.round((parseFloat(val) || 0) * 10) / 10;
  if (Object.is(n, -0)) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
}

export function formatLitersLabel(val) {
  const txt = formatLiters(val);
  return `${txt} ${txt === '1' ? 'litro' : 'litros'}`;
}

export function computeFuelMotorStats(motor, sesiones = [], mants = [], fallbackPrice = 0) {
  const config = parseMotorConfig(motor);
  if (config.precioPorLitro <= 0 && fallbackPrice > 0) {
    config.precioPorLitro = Math.round((parseFloat(fallbackPrice) || 0) * 100) / 100;
  }

  const fuelLoads = [...(sesiones || [])]
    .filter(s => s && (String(s.hora_inicio || '').startsWith('GASOLINA') || (parseFloat(s.total_horas) || 0) > 0))
    .sort((a, b) => new Date(b.fecha || b.created_at || 0) - new Date(a.fecha || a.created_at || 0))
    .map((s) => {
      const liters = Math.max(0, parseFloat(s.total_horas) || 0);
      const unitPrice = parseFuelLoadPrice(s, config.precioPorLitro);
      const cost = Math.round(liters * unitPrice * 100) / 100;
      return {
        ...s,
        _liters: liters,
        _unitPrice: unitPrice,
        _cost: cost,
      };
    });

  const totalLiters = Math.round(
    fuelLoads.reduce((acc, s) => acc + s._liters, 0) * 10
  ) / 10;
  const totalCost = Math.round(
    fuelLoads.reduce((acc, s) => acc + s._cost, 0) * 100
  ) / 100;
  const totalHoursEst = Math.round(totalLiters * (config.horasPorLitro || 2) * 10) / 10;
  const lastLoad = fuelLoads[0] || null;

  const sortedMants = [...(mants || [])]
    .sort((a, b) => new Date(b.fecha || b.created_at || 0) - new Date(a.fecha || a.created_at || 0));

  const items = config.mantenimientos.map((item) => {
    const targetNameLower = item.nombre.toLowerCase();
    const lastMant = sortedMants.find((m) => {
      if (!m) return false;
      if (m.color === `gas_mant:${item.key}`) return true;
      let hist = m.historial_sesiones;
      if (typeof hist === 'string') {
        try { hist = JSON.parse(hist); } catch { hist = null; }
      }
      if (hist && typeof hist === 'object' && !Array.isArray(hist) && hist.mant_key === item.key) {
        return true;
      }
      return String(m.titulo || '').trim().toLowerCase() === targetNameLower;
    });

    const baseline = lastMant ? (parseFloat(lastMant.total_horas) || 0) : 0;
    const cada = parseFloat(item.cada_litros) || 10;
    const usedSince = Math.max(0, Math.round((totalLiters - baseline) * 10) / 10);
    const remaining = Math.max(0, Math.round((cada - usedSince) * 10) / 10);
    const pct = cada > 0 ? Math.min(100, Math.max(0, Math.round((usedSince / cada) * 100))) : 0;
    const isDue = remaining <= 0;
    const isNear = !isDue && (remaining <= Math.max(2, cada * 0.2) || pct >= 80);
    const needsAction = isDue || isNear;

    return {
      ...item,
      cada_litros: cada,
      baseline,
      usedSince,
      remaining,
      pct,
      isDue,
      isNear,
      needsAction,
      lastMant: lastMant || null,
    };
  });

  const mostUrgent = [...items].sort((a, b) => (b.pct - a.pct) || (a.remaining - b.remaining))[0] || null;
  const hasUrgent = items.some(i => i.isDue);

  return { config, fuelLoads, totalLiters, totalCost, totalHoursEst, lastLoad, items, mostUrgent, hasUrgent };
}

import { restFetch } from './auth.js';
import { supabase } from './supabase.js';

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function isTrabajo(e) {
  if (!e) return false;
  const s = String(e).toLowerCase().trim();
  return s === 'trabajo' || s === 'presente' || s === 'asistio' || s === 'asistió' || s === 'si' || s === 'sí' || s === 'p' || s === 't' || s === '1' || s === 'activo';
}

function getWeekStart(d) {
  const ws = new Date(d);
  ws.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1));
  ws.setHours(0, 0, 0, 0);
  return ws;
}

/**
 * Checks completed past weeks for all workers and automatically creates expenses
 * marked with "[Por Aprobar]" if the user forgot to send them.
 */
export async function autoCheckSemanasPasadasAGastos() {
  try {
    const eid = window._currentEmpresaId || localStorage.getItem('current_empresa_id') || '';
    if (!eid) return false;

    const [personalList, asisList, gastosRes, appsList] = await Promise.all([
      restFetch(`/rest/v1/personal?empresa_id=eq.${eid}&select=*`).catch(() => []),
      restFetch(`/rest/v1/personal_asistencia?empresa_id=eq.${eid}&select=*`).catch(() => []),
      supabase.from('gastos').select('*').eq('categoria', 'Personal').catch(() => ({ data: [] })),
      restFetch(`/rest/v1/lote_aplicaciones?empresa_id=eq.${eid}&select=id,fecha,personal_ids,operador`).catch(() => [])
    ]);

    const workers = Array.isArray(personalList) ? personalList : [];
    const asistencia = Array.isArray(asisList) ? asisList : [];
    const apps = Array.isArray(appsList) ? appsList : [];
    const gastos = gastosRes?.data || [];

    if (!workers.length) return false;

    const today = new Date();
    const currentWeekStart = getWeekStart(today);
    // Sábado en la noche (>= 20:00) o domingo ya cerró la jornada laboral del sábado
    const isSabadoNocheODomingo = (today.getDay() === 6 && today.getHours() >= 20) || (today.getDay() === 0);

    let insertedAny = false;

    for (const worker of workers) {
      const diario = Number(worker.pago_diario || 0);
      if (diario <= 0) continue;

      const normNombre = (worker.nombre || '').toLowerCase().trim();

      // Fechas trabajadas por asistencia manual
      const fechasTrabajadas = new Set(
        asistencia
          .filter(a => a.personal_id === worker.id && isTrabajo(a.estado))
          .map(a => (a.fecha || '').slice(0, 10))
          .filter(Boolean)
      );

      // Fechas trabajadas por labores en cafetal
      apps.forEach(a => {
        let pids = [];
        if (Array.isArray(a.personal_ids)) pids = a.personal_ids;
        else if (typeof a.personal_ids === 'string') {
          try { pids = JSON.parse(a.personal_ids); } catch(e) {}
        }
        const hasId = Array.isArray(pids) && pids.includes(worker.id);

        let hasNombre = false;
        if (normNombre && a.operador) {
          const ops = String(a.operador).split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
          hasNombre = ops.some(op => op === normNombre || normNombre.includes(op) || op.includes(normNombre));
        }

        if (hasId || hasNombre) {
          const f = (a.fecha || '').slice(0, 10);
          if (f) fechasTrabajadas.add(f);
        }
      });

      if (!fechasTrabajadas.size) continue;

      const weeksMap = new Map();
      for (const fechaStr of fechasTrabajadas) {
        const [y, m, d] = fechaStr.split('-').map(Number);
        if (!y || isNaN(y)) continue;
        const dateObj = new Date(y, m - 1, d);
        const wStart = getWeekStart(dateObj);

        // Se envía automáticamente si la semana ya concluyó:
        // semana anterior a la actual, o es la semana actual y ya es sábado en la noche / domingo
        const isPastWeek = (wStart.getTime() < currentWeekStart.getTime());
        const isCurrentWeek = (wStart.getTime() === currentWeekStart.getTime());

        if (!isPastWeek && !(isCurrentWeek && isSabadoNocheODomingo)) {
          continue;
        }

        const wKey = fmtDate(wStart);
        if (!weeksMap.has(wKey)) {
          weeksMap.set(wKey, { wStart, dates: new Set() });
        }
        weeksMap.get(wKey).dates.add(fechaStr);
      }

      for (const [wKey, { wStart, dates }] of weeksMap.entries()) {
        const daysWorked = dates.size;
        if (daysWorked <= 0) continue;

        const refTag = `[ref:${worker.id}_sem_${wKey}]`;
        const alreadyExists = gastos.some(g =>
          g.categoria === 'Personal' && g.descripcion && g.descripcion.includes(refTag)
        );
        if (alreadyExists) continue;

        const wEnd = new Date(wStart);
        wEnd.setDate(wStart.getDate() + 6);
        const startM = MONTHS[wStart.getMonth()];
        const endM = MONTHS[wEnd.getMonth()];
        const periodTitle = wStart.getMonth() === wEnd.getMonth()
          ? `Semana ${wStart.getDate()} - ${wEnd.getDate()} ${startM} ${wStart.getFullYear()}`
          : `Semana ${wStart.getDate()} ${startM} - ${wEnd.getDate()} ${endM} ${wStart.getFullYear()}`;

        const sabado = new Date(wStart);
        sabado.setDate(sabado.getDate() + 5);
        const fechaGasto = fmtDate(sabado);

        const totalMonto = daysWorked * diario;
        const desc = `[Por Aprobar] ${periodTitle}: ${worker.nombre} (${daysWorked} días a L${diario.toLocaleString('es-HN')}/día) ${refTag}`;

        const { error } = await supabase.from('gastos').insert([{
          fecha: fechaGasto,
          categoria: 'Personal',
          descripcion: desc,
          monto: totalMonto,
        }]);

        if (!error) {
          insertedAny = true;
          gastos.push({ categoria: 'Personal', descripcion: desc, monto: totalMonto });
        }
      }
    }

    if (insertedAny) {
      window.clearScreenCache?.('gastos');
    }

    return insertedAny;
  } catch (err) {
    console.warn('autoCheckSemanasPasadasAGastos error:', err);
    return false;
  }
}

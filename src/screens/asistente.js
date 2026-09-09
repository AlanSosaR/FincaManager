import { supabase } from '../supabase.js';
import { restFetch } from '../auth.js';

let conversationHistory = [];
let isProcessing = false;

function getEmpresaNombre() {
  const sidebarEmpresa = document.getElementById('sidebar-empresa-name');
  if (sidebarEmpresa && sidebarEmpresa.textContent.trim()) {
    return sidebarEmpresa.textContent.trim();
  }
  return 'Finca la Rosa';
}

export function renderAsistente() {
  return `
    <div class="asistente-screen-wrapper">
      <!-- Chat Messages Container -->
      <div id="asistente-chat-history" class="asistente-chat-history">
        <!-- Hero Header -->
        <div id="asistente-hero-header" class="asistente-hero">
          <div class="asistente-avatar-container">
            <img src="/pwa-512x512.svg" alt="Asistente Virtual" class="asistente-avatar-img">
            <span class="asistente-online-badge"></span>
          </div>
          <h1 class="asistente-hero-title">Asistente Virtual</h1>
          <p class="asistente-hero-subtitle">
            ¡Hola! Soy tu asistente virtual de <strong>${getEmpresaNombre()}</strong>.<br>
            ¿En qué te puedo ayudar hoy?
          </p>
          
          <div class="asistente-quick-chips" id="asistente-main-chips">
            <button class="asistente-chip" data-cmd="motores">⚙️ Motores y Maquinaria</button>
            <button class="asistente-chip" data-cmd="vacunas">💉 Vacunas del Ganado</button>
            <button class="asistente-chip" data-cmd="fumigacion">🛡️ Fumigaciones</button>
            <button class="asistente-chip" data-cmd="partos">🤰 Partos y Preñez</button>
            <button class="asistente-chip" data-cmd="pesajes">⚖️ Pesajes de Ganado</button>
            <button class="asistente-chip" data-cmd="lotes">🌱 Lotes de Café</button>
            <button class="asistente-chip" data-cmd="resumen">📊 Resumen General</button>
          </div>
        </div>

        <!-- Dynamic Message Bubbles will be injected here -->
        <div id="asistente-messages-list" class="asistente-messages-list"></div>
        <div id="asistente-bottom-anchor"></div>
      </div>

      <!-- Bottom Input Form -->
      <div class="asistente-input-bar">
        <div class="asistente-input-inner">
          <button type="button" id="btn-asistente-reset-menu" class="asistente-menu-shortcut-btn" title="Ver Menú Principal">
            <span class="material-icons">smart_toy</span>
            <span class="asistente-menu-shortcut-text">Menú</span>
          </button>
          <input 
            type="text" 
            id="asistente-user-input" 
            class="asistente-text-input" 
            placeholder="Pregunta algo (ej. motores, vacunas, resumen)..." 
            autocomplete="off"
          />
          <button type="button" id="btn-asistente-send" class="asistente-send-btn" aria-label="Enviar mensaje">
            <span class="material-icons">arrow_upward</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

export function initAsistente() {
  conversationHistory = [];
  isProcessing = false;

  const inputEl = document.getElementById('asistente-user-input');
  const sendBtn = document.getElementById('btn-asistente-send');
  const menuBtn = document.getElementById('btn-asistente-reset-menu');
  const chipsContainer = document.getElementById('asistente-main-chips');

  if (chipsContainer) {
    chipsContainer.addEventListener('click', (e) => {
      const chip = e.target.closest('.asistente-chip');
      if (!chip) return;
      const cmd = chip.dataset.cmd;
      if (cmd) executeQuery(cmd, chip.textContent.trim());
    });
  }

  if (sendBtn && inputEl) {
    sendBtn.addEventListener('click', () => {
      const text = inputEl.value.trim();
      if (text) {
        inputEl.value = '';
        executeQuery(text, text);
      }
    });

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const text = inputEl.value.trim();
        if (text) {
          inputEl.value = '';
          executeQuery(text, text);
        }
      }
    });
  }

  if (menuBtn) {
    menuBtn.addEventListener('click', () => {
      executeQuery('menu', 'Ver menú principal');
    });
  }
}

function scrollToBottom() {
  setTimeout(() => {
    const historyEl = document.getElementById('asistente-chat-history');
    if (historyEl) {
      historyEl.scrollTo({ top: historyEl.scrollHeight, behavior: 'smooth' });
    }
    const anchor = document.getElementById('asistente-bottom-anchor');
    if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, 80);
}

function appendUserBubble(text) {
  const list = document.getElementById('asistente-messages-list');
  if (!list) return;

  const bubble = document.createElement('div');
  bubble.className = 'asistente-msg-row user';
  bubble.innerHTML = `
    <div class="asistente-msg-bubble user">
      ${escapeHtml(text)}
    </div>
  `;
  list.appendChild(bubble);
  scrollToBottom();
}

function appendBotBubble(htmlContent, showActions = true) {
  const list = document.getElementById('asistente-messages-list');
  if (!list) return;

  const bubble = document.createElement('div');
  bubble.className = 'asistente-msg-row bot';
  
  let actionsHtml = '';
  if (showActions) {
    actionsHtml = `
      <div class="asistente-action-chips">
        <button class="asistente-action-btn primary" onclick="window.asistenteExecute('menu', '🔙 Salir / Menú Principal')">
          <span class="material-icons" style="font-size:16px;">arrow_back</span> Salir / Menú
        </button>
        <button class="asistente-action-btn" onclick="window.asistenteExecute('resumen', '📊 Resumen General')">
          📊 Resumen
        </button>
        <button class="asistente-action-btn" onclick="window.asistenteExecute('motores', '⚙️ Motores')">
          ⚙️ Motores
        </button>
      </div>
    `;
  }

  bubble.innerHTML = `
    <div class="asistente-bot-avatar">
      <img src="/pwa-512x512.svg" alt="Bot">
    </div>
    <div class="asistente-msg-bubble bot">
      <div class="asistente-content-body">${htmlContent}</div>
      ${actionsHtml}
    </div>
  `;
  list.appendChild(bubble);
  scrollToBottom();
}

function appendTypingIndicator() {
  const list = document.getElementById('asistente-messages-list');
  if (!list) return null;

  const indicator = document.createElement('div');
  indicator.id = 'asistente-typing-indicator';
  indicator.className = 'asistente-msg-row bot';
  indicator.innerHTML = `
    <div class="asistente-bot-avatar">
      <img src="/pwa-512x512.svg" alt="Bot">
    </div>
    <div class="asistente-msg-bubble bot typing">
      <span class="dot"></span>
      <span class="dot"></span>
      <span class="dot"></span>
    </div>
  `;
  list.appendChild(indicator);
  scrollToBottom();
  return indicator;
}

function removeTypingIndicator() {
  const ind = document.getElementById('asistente-typing-indicator');
  if (ind) ind.remove();
}

// Global hook for inline chip clicks
window.asistenteExecute = function(cmd, label) {
  executeQuery(cmd, label);
};

async function executeQuery(cmd, label) {
  if (isProcessing) return;
  isProcessing = true;

  appendUserBubble(label || cmd);
  const typing = appendTypingIndicator();

  try {
    const raw = (cmd || '').toLowerCase().trim();
    const clean = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/^[\/!#.\s]+/, "");

    // 0. SALIR / MENÚ
    if (
      clean === 'menu' || clean === 'salir' || clean === 'volver' || 
      clean === 'inicio' || clean === 'bot' || clean === 'boot' || 
      clean === 'ayuda' || clean === 'opciones'
    ) {
      await new Promise(r => setTimeout(r, 250));
      removeTypingIndicator();
      const menuHtml = `
        <div class="asistente-card-title">🌾 Menú de Consultas de ${getEmpresaNombre()}</div>
        <p style="margin: 6px 0 12px 0; font-size: 13.5px; color: #4a5548;">
          Selecciona cualquiera de las opciones para consultar la información en tiempo real:
        </p>
        <div class="asistente-inline-menu-grid">
          <button class="asistente-menu-card-btn" onclick="window.asistenteExecute('motores', '⚙️ Motores y Maquinaria')">
            <span class="menu-btn-icon">⚙️</span>
            <div class="menu-btn-text">
              <strong>Motores</strong>
              <small>Horas de uso y cambio de aceite</small>
            </div>
          </button>
          <button class="asistente-menu-card-btn" onclick="window.asistenteExecute('vacunas', '💉 Vacunas del Ganado')">
            <span class="menu-btn-icon">💉</span>
            <div class="menu-btn-text">
              <strong>Vacunas</strong>
              <small>Aplicadas y pendientes por animal</small>
            </div>
          </button>
          <button class="asistente-menu-card-btn" onclick="window.asistenteExecute('fumigacion', '🛡️ Fumigaciones')">
            <span class="menu-btn-icon">🛡️</span>
            <div class="menu-btn-text">
              <strong>Fumigaciones</strong>
              <small>Tratamientos y productos</small>
            </div>
          </button>
          <button class="asistente-menu-card-btn" onclick="window.asistenteExecute('partos', '🤰 Partos y Preñez')">
            <span class="menu-btn-icon">🤰</span>
            <div class="menu-btn-text">
              <strong>Partos</strong>
              <small>Gestaciones y partos próximos</small>
            </div>
          </button>
          <button class="asistente-menu-card-btn" onclick="window.asistenteExecute('pesajes', '⚖️ Pesajes de Ganado')">
            <span class="menu-btn-icon">⚖️</span>
            <div class="menu-btn-text">
              <strong>Pesajes</strong>
              <small>Padrón y pesos recientes</small>
            </div>
          </button>
          <button class="asistente-menu-card-btn" onclick="window.asistenteExecute('lotes', '🌱 Lotes de Café')">
            <span class="menu-btn-icon">🌱</span>
            <div class="menu-btn-text">
              <strong>Cafetal</strong>
              <small>Lotes, plantas y variedades</small>
            </div>
          </button>
          <button class="asistente-menu-card-btn highlight" onclick="window.asistenteExecute('resumen', '📊 Resumen General')">
            <span class="menu-btn-icon">📊</span>
            <div class="menu-btn-text">
              <strong>Resumen General</strong>
              <small>Panorama completo de la finca hoy</small>
            </div>
          </button>
        </div>
      `;
      appendBotBubble(menuHtml, false);
      return;
    }

    // 1. MOTORES
    if (clean.includes('motor') || clean.includes('maquinaria') || clean.includes('aceite')) {
      const { data: motores } = await supabase.from('motores').select('*').order('nombre', { ascending: true });
      removeTypingIndicator();

      if (!motores || motores.length === 0) {
        appendBotBubble(`
          <div class="asistente-card-title">⚙️ Motores y Maquinaria</div>
          <p>No hay motores o maquinaria registrados actualmente en la finca.</p>
        `);
        return;
      }

      let cardsHtml = motores.map(m => {
        const horas = parseFloat(m.horas || 0);
        const max = parseFloat(m.max_horas || 100);
        const restantes = max - horas;
        const pct = Math.min(100, Math.round((horas / max) * 100));

        let badgeClass = 'status-ok';
        let badgeText = 'Operativo';
        if (restantes <= 0) {
          badgeClass = 'status-danger';
          badgeText = '¡Mantenimiento Vencido!';
        } else if (restantes <= 15) {
          badgeClass = 'status-warn';
          badgeText = 'Próximo cambio';
        }

        return `
          <div class="asistente-data-card">
            <div class="asistente-data-card-header">
              <span class="asistente-item-title">🚜 ${escapeHtml(m.nombre)}</span>
              <span class="asistente-badge ${badgeClass}">${badgeText}</span>
            </div>
            <div class="asistente-progress-bar">
              <div class="asistente-progress-fill ${badgeClass}" style="width: ${pct}%;"></div>
            </div>
            <div class="asistente-metrics-grid">
              <div class="metric">
                <span class="lbl">Horas de uso:</span>
                <span class="val">${horas.toFixed(1)}h / ${max.toFixed(0)}h</span>
              </div>
              <div class="metric">
                <span class="lbl">Tiempo restante:</span>
                <span class="val">${restantes > 0 ? restantes.toFixed(1) + 'h restantes' : 'Vencido por ' + Math.abs(restantes).toFixed(1) + 'h'}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');

      appendBotBubble(`
        <div class="asistente-card-title">⚙️ Estado de Motores y Maquinaria</div>
        <p style="margin-bottom:12px; font-size:13px; color:#4a5548;">Aquí tienes el tiempo de operación y estado de cada equipo:</p>
        ${cardsHtml}
      `);
      return;
    }

    // 2. VACUNAS
    if (clean.includes('vacun')) {
      const { data: animales } = await supabase.from('ganado').select('id, nombre, numero_arete, estado').neq('estado', 'Vendido');
      const aMap = new Map((animales || []).map(a => [a.id, a]));
      const { data: vacs } = await supabase.from('animal_vacunas').select('*').order('fecha', { ascending: false });

      removeTypingIndicator();

      const vacsActivas = (vacs || []).filter(v => aMap.has(v.animal_id));
      const aplicadas = vacsActivas.filter(v => v.estado === 'Aplicada');
      const pendientes = vacsActivas.filter(v => v.estado === 'Programada');

      let listHtml = '';
      if (pendientes.length > 0) {
        listHtml += `<div style="font-weight:700; color:#c62828; margin:8px 0 4px 0; font-size:13px;">🕒 Próximas Vacunas Pendientes (${pendientes.length}):</div>`;
        listHtml += pendientes.slice(0, 5).map(v => {
          const a = aMap.get(v.animal_id);
          const nom = a && a.nombre ? a.nombre : 'Animal #' + (v.animal_id ? v.animal_id.substring(0, 5) : '?');
          const ar = a && a.numero_arete ? ' (Arete: #' + a.numero_arete + ')' : '';
          return `
            <div class="asistente-list-item">
              <div><strong>${escapeHtml(nom)}</strong>${escapeHtml(ar)}</div>
              <div style="font-size:12px; color:#666;">Vacuna: <strong>${escapeHtml(v.nombre || 'Vacuna')}</strong> | Fecha: ${v.fecha || 'Sin fecha'}</div>
            </div>
          `;
        }).join('');
      }

      appendBotBubble(`
        <div class="asistente-card-title">💉 Control de Vacunación</div>
        <div class="asistente-summary-strip">
          <span class="pill green">✅ ${aplicadas.length} Aplicadas</span>
          <span class="pill orange">⏳ ${pendientes.length} Programadas</span>
        </div>
        ${listHtml}
      `);
      return;
    }

    // 3. FUMIGACIONES
    if (clean.includes('fumig')) {
      const { data: fumigs } = await supabase.from('animal_fumigaciones').select('*').order('fecha', { ascending: false });
      removeTypingIndicator();

      const aplicadas = (fumigs || []).filter(f => f.estado === 'Aplicada');
      const pendientes = (fumigs || []).filter(f => f.estado === 'Programada');

      let itemsHtml = '';
      if (pendientes.length > 0) {
        itemsHtml += `<div style="font-weight:700; color:#d84315; margin:8px 0 4px 0; font-size:13px;">🕒 Fumigaciones Pendientes:</div>`;
        itemsHtml += pendientes.slice(0, 4).map(f => `
          <div class="asistente-list-item">
            <div>🛡️ <strong>${escapeHtml(f.producto || 'Fumigación')}</strong></div>
            <div style="font-size:12px; color:#666;">Programada para: ${f.fecha || 'Pendiente'}</div>
          </div>
        `).join('');
      }

      appendBotBubble(`
        <div class="asistente-card-title">🛡️ Control de Fumigaciones</div>
        <div class="asistente-summary-strip">
          <span class="pill green">✅ ${aplicadas.length} Aplicadas</span>
          <span class="pill orange">⏳ ${pendientes.length} Pendientes</span>
        </div>
        ${itemsHtml}
      `);
      return;
    }

    // 4. PARTOS Y PREÑEZ
    if (clean.includes('parto') || clean.includes('pren') || clean.includes('cria')) {
      let preneces = [];
      try {
        preneces = await restFetch('/rest/v1/animal_pre%C3%B1ez?estado=eq.Pre%C3%B1ada&select=*');
      } catch (e) {
        console.warn('Error fetching preñez:', e);
      }
      const { data: animales } = await supabase.from('ganado').select('id, nombre, numero_arete, estado').neq('estado', 'Vendido');
      const aMap = new Map((animales || []).map(a => [a.id, a]));

      removeTypingIndicator();

      const prenecesActivas = (preneces || []).filter(p => aMap.has(p.animal_id));

      if (!prenecesActivas || prenecesActivas.length === 0) {
        appendBotBubble(`
          <div class="asistente-card-title">🐄 Control de Reproducción</div>
          <p>No hay hembras activas registradas en estado de preñez en este momento.</p>
        `);
        return;
      }

      const hoy = new Date();
      hoy.setHours(12, 0, 0, 0);

      const items = prenecesActivas.map(p => {
        let dias = null;
        if (p.fecha_probable_parto) {
          const fp = new Date(p.fecha_probable_parto + 'T12:00:00');
          dias = Math.round((fp - hoy) / (1000 * 60 * 60 * 24));
        }
        return { p, dias };
      }).sort((a, b) => (a.dias ?? 999) - (b.dias ?? 999));

      const rows = items.map(item => {
        const a = aMap.get(item.p.animal_id);
        const nom = a && a.nombre ? a.nombre : 'Vaca #' + (item.p.animal_id ? item.p.animal_id.substring(0, 5) : '?');
        const ar = a && a.numero_arete ? ' (Arete: #' + a.numero_arete + ')' : '';
        let aviso = '';
        if (item.dias !== null) {
          if (item.dias < 0) aviso = `<span class="asistente-badge status-danger">¡Atrasado ${Math.abs(item.dias)} días!</span>`;
          else if (item.dias === 0) aviso = `<span class="asistente-badge status-danger">🚨 ¡HOY!</span>`;
          else if (item.dias === 1) aviso = `<span class="asistente-badge status-warn">⏳ Mañana</span>`;
          else aviso = `<span class="asistente-badge status-ok">En ${item.dias} días</span>`;
        }
        return `
          <div class="asistente-list-item">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <strong>${escapeHtml(nom)}${escapeHtml(ar)}</strong>
              ${aviso}
            </div>
            <div style="font-size:12px; color:#666;">Fecha probable: ${item.p.fecha_probable_parto || 'Sin fecha'}</div>
          </div>
        `;
      }).join('');

      appendBotBubble(`
        <div class="asistente-card-title">🤰 Control de Reproducción y Partos</div>
        <p style="font-size:13px; margin-bottom:8px;">Total de hembras gestando: <strong>${prenecesActivas.length}</strong></p>
        ${rows}
      `);
      return;
    }

    // 5. PESAJES
    if (clean.includes('pesaj') || clean.includes('peso')) {
      const { data: ganado } = await supabase.from('ganado').select('id, nombre, numero_arete, peso_actual, estado').neq('estado', 'Vendido');
      const aMap = new Map((ganado || []).map(a => [a.id, a]));
      const { data: pesajes } = await supabase.from('animal_pesajes').select('*').order('fecha', { ascending: false });
      const pesajesActivos = (pesajes || []).filter(p => aMap.has(p.animal_id));
      removeTypingIndicator();

      appendBotBubble(`
        <div class="asistente-card-title">⚖️ Control de Pesajes</div>
        <div class="asistente-summary-strip">
          <span class="pill green">🐄 ${(ganado || []).length} Animales en Padrón Activo</span>
          <span class="pill blue">📝 ${pesajesActivos.length} Registros de Animales Activos</span>
        </div>
        <p style="font-size:13px; color:#4a5548; margin-top:8px;">
          Puedes ver y registrar pesajes completos desde el módulo de <strong>Ganado</strong>.
        </p>
      `);
      return;
    }

    // 6. LOTES DE CAFÉ
    if (clean.includes('lote') || clean.includes('cafe') || clean.includes('cafetal')) {
      const { data: lotes } = await supabase.from('lotes').select('*').order('nombre', { ascending: true });
      removeTypingIndicator();

      if (!lotes || lotes.length === 0) {
        appendBotBubble(`
          <div class="asistente-card-title">🌱 Cafetal</div>
          <p>No hay lotes de café registrados en la finca actualmente.</p>
        `);
        return;
      }

      let totalPlantas = 0;
      const cards = lotes.map(l => {
        const p = l.num_plantas || 0;
        totalPlantas += p;
        return `
          <div class="asistente-list-item">
            <div style="display:flex; justify-content:space-between;">
              <strong>🌱 ${escapeHtml(l.nombre)}</strong>
              <span class="asistente-badge status-ok">${l.salud_porcentaje || 100}% Salud</span>
            </div>
            <div style="font-size:12px; color:#666; margin-top:2px;">
              ${p.toLocaleString()} plantas | Variedad: ${escapeHtml(l.variedad || 'N/A')}
            </div>
          </div>
        `;
      }).join('');

      appendBotBubble(`
        <div class="asistente-card-title">🌱 Resumen del Cafetal</div>
        <p style="font-size:13px; margin-bottom:8px;">
          Total lotes: <strong>${lotes.length}</strong> | Total plantas: <strong>${totalPlantas.toLocaleString()}</strong>
        </p>
        ${cards}
      `);
      return;
    }

    // 7. RESUMEN GENERAL
    if (clean.includes('resumen') || clean.includes('general') || clean.includes('finca') || clean.includes('hoy') || clean.includes('todo')) {
      const { data: ganado } = await supabase.from('ganado').select('id, sexo, estado').neq('estado', 'Vendido');
      const aMap = new Map((ganado || []).map(a => [a.id, a]));
      const { data: vacs } = await supabase.from('animal_vacunas').select('*');
      const { data: fumigs } = await supabase.from('animal_fumigaciones').select('*');
      const { data: motores } = await supabase.from('motores').select('*');
      let preneces = [];
      try {
        preneces = await restFetch('/rest/v1/animal_pre%C3%B1ez?estado=eq.Pre%C3%B1ada&select=id,animal_id');
      } catch (e) {}

      removeTypingIndicator();

      const totalGanado = (ganado || []).length;
      const hembras = (ganado || []).filter(a => (a.sexo || '').toLowerCase().startsWith('h')).length;
      const machos = (ganado || []).filter(a => (a.sexo || '').toLowerCase().startsWith('m')).length;

      const vacPendientes = (vacs || []).filter(v => v.estado === 'Programada' && aMap.has(v.animal_id)).length;
      const fumigPendientes = (fumigs || []).filter(f => f.estado === 'Programada').length;
      const gestandoActivas = (preneces || []).filter(p => aMap.has(p.animal_id)).length;

      let motorStatus = 'Sin motores';
      if (motores && motores.length > 0) {
        const m = motores[0];
        const rest = (parseFloat(m.max_horas || 100) - parseFloat(m.horas || 0)).toFixed(1);
        motorStatus = `${m.nombre} (${rest > 0 ? rest + 'h restantes' : '¡Vencido!'})`;
      }

      appendBotBubble(`
        <div class="asistente-card-title">📊 Panorama General de ${getEmpresaNombre()}</div>
        <div class="asistente-grid-summary">
          <div class="asistente-grid-stat">
            <span class="stat-icon">🐄</span>
            <div class="stat-info">
              <span class="stat-num">${totalGanado}</span>
              <span class="stat-label">Ganado (${hembras}H / ${machos}M)</span>
            </div>
          </div>
          <div class="asistente-grid-stat">
            <span class="stat-icon">🤰</span>
            <div class="stat-info">
              <span class="stat-num">${gestandoActivas}</span>
              <span class="stat-label">Vacas Preñadas</span>
            </div>
          </div>
          <div class="asistente-grid-stat">
            <span class="stat-icon">💉</span>
            <div class="stat-info">
              <span class="stat-num">${vacPendientes}</span>
              <span class="stat-label">Vacunas Pendientes</span>
            </div>
          </div>
          <div class="asistente-grid-stat">
            <span class="stat-icon">🛡️</span>
            <div class="stat-info">
              <span class="stat-num">${fumigPendientes}</span>
              <span class="stat-label">Fumigaciones Pend.</span>
            </div>
          </div>
          <div class="asistente-grid-stat full">
            <span class="stat-icon">⚙️</span>
            <div class="stat-info">
              <span class="stat-num" style="font-size:14px;">${motorStatus}</span>
              <span class="stat-label">Estado de Maquinaria</span>
            </div>
          </div>
        </div>
      `);
      return;
    }

    // Default Fallback
    removeTypingIndicator();
    appendBotBubble(`
      <p>No encontré una consulta específica para "<strong>${escapeHtml(cmd)}</strong>".</p>
      <p style="font-size:13px; color:#555; margin-top:6px;">
        Puedes presionar el botón <strong>Salir / Menú</strong> o consultar alguna de estas opciones:
      </p>
    `);
  } catch (err) {
    console.error('Error in executeQuery:', err);
    removeTypingIndicator();
    appendBotBubble(`
      <p style="color:#d32f2f;">⚠️ Ocurrió un error al procesar la consulta. Intenta de nuevo seleccionando una de las opciones del menú.</p>
    `);
  } finally {
    isProcessing = false;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

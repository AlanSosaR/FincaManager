import { supabase } from '../supabase.js';
import { getPaginationFooterHtml } from '../pagination.js';
import { loadPuntoReferencia } from '../auth.js';
import { renderM3SearchBar, initM3FullScreenSearch, escapeSearchHtml } from '../components/m3_search.js';
import { renderDetalleLote, initDetalleLote } from './detalle_lote.js';
import { createCosechaController } from './cosecha_lote.js';
import { showModal, closeModal } from '../modals.js';
import { mergeCategories, openNewCategoryBottomSheet } from '../utils/custom_categories.js';

let allLotes = [];
let currentLotesSearchQuery = '';
let refMarker = null;

function formatLoteNombre(name) {
  return String(name || '').replace(/\bcafe\b/gi, 'Café');
}

function parseCoordenadasJson(json) {
  try {
    if (!json) return { coordinates: [], color: '#2d3e2c' };
    let parsed = json;
    while (typeof parsed === 'string') {
      try {
        const next = JSON.parse(parsed);
        if (next == null) break;
        parsed = next;
      } catch {
        break;
      }
    }
    if (Array.isArray(parsed)) {
      return { coordinates: parsed, color: '#2d3e2c' };
    }
    if (parsed && typeof parsed === 'object') {
      const coords = Array.isArray(parsed.coordinates) ? parsed.coordinates : [];
      return { coordinates: coords, color: parsed.color || '#2d3e2c', ...parsed };
    }
    return { coordinates: [], color: '#2d3e2c' };
  } catch {
    return { coordinates: [], color: '#2d3e2c' };
  }
}

function formatFechaStr(fecha) {
  if (!fecha) return '';
  const d = new Date((fecha.length === 10 ? fecha + 'T12:00:00' : fecha));
  if (isNaN(d.getTime())) return fecha;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

export async function renderDashboard() {
  console.log('Rendering Dashboard...');
  try {
    const [
      { data: lotes, error: lotesErr },
      { data: aplicaciones, error: appErr }
    ] = await Promise.all([
      supabase.from('lotes').select('*').order('created_at', { ascending: false }),
      supabase.from('lote_aplicaciones').select('*').order('fecha', { ascending: false })
    ]);

    if (lotesErr) throw lotesErr;

    const appsByLote = {};
    (aplicaciones || []).forEach(a => {
      if (!appsByLote[a.lote_id]) appsByLote[a.lote_id] = [];
      appsByLote[a.lote_id].push(a);
    });

    allLotes = lotes || [];
    const totalPlantas = allLotes.reduce((sum, l) => sum + (l.num_plantas || 0), 0) || 0;
    const totalHa = allLotes.reduce((sum, l) => sum + (parseFloat(l.area_ha) || 0), 0) || 0;

    return `
      <style>
        .mapa-page {
          height: 100%;
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-height: 0;
          position: relative;
          padding-bottom: 0;
        }
        #mapa-container {
          width: 100%;
          height: 680px;
          min-height: 680px;
          border-radius: 18px;
          overflow: hidden;
          position: relative;
          background: #e8efe4;
          border: 1.5px solid #dce5da;
          box-shadow: 0 4px 20px rgba(0,0,0,0.06);
        }
        @media (max-width: 768px) {
          #mapa-container {
            height: 600px;
            min-height: 600px;
          }
        }
        .mapa-layers-btn {
          position: absolute;
          top: 12px;
          right: 12px;
          z-index: 1000;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 12px;
          border: 1px solid rgba(0,0,0,0.08);
          background: #ffffff;
          color: #2d3e2c;
          font-family: 'Work Sans', sans-serif;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        .mapa-reg-btn {
          position: absolute;
          bottom: 18px;
          right: 18px;
          z-index: 1000;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 12px 20px;
          border: none;
          border-radius: 999px;
          background: #2d3e2c;
          color: #fff;
          font-family: 'Work Sans', sans-serif;
          font-size: 13.5px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 4px 16px rgba(0,0,0,0.3);
          transition: transform 0.15s, background 0.15s;
        }
        .mapa-reg-btn:hover {
          background: #3d5240;
          transform: scale(1.03);
        }
        .lote-label {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          color: #ffffff;
          font-size: 11.5px;
          font-weight: 800;
          letter-spacing: 0.3px;
          padding: 5px 12px 5px 8px;
          border-radius: 999px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.35);
          white-space: nowrap;
          border: 2px solid #ffffff;
          pointer-events: auto !important;
          cursor: pointer !important;
          z-index: 500;
          font-family: 'Work Sans', sans-serif;
          display: flex;
          align-items: center;
          gap: 5px;
          text-shadow: 0 1px 2px rgba(0,0,0,0.4);
        }
        .lote-label-wrap {
          pointer-events: auto !important;
          cursor: pointer !important;
        }
        @media (max-width: 600px) {
          .lote-label {
            font-size: 10.5px;
            padding: 3px 8px 3px 6px;
            border-width: 1.5px;
            gap: 3px;
          }
        }
        #mapa-container path.leaflet-interactive {
          filter: drop-shadow(0 2px 6px rgba(0,0,0,0.55));
          transition: stroke-width 0.15s ease, fill-opacity 0.15s ease;
          cursor: pointer;
        }
        
        /* En PC: el popup nativo de Leaflet exactamente como estaba */
        .lote-custom-popup .leaflet-popup-content-wrapper {
          padding: 14px 16px;
          border-radius: 18px;
          box-shadow: 0 12px 36px rgba(0,0,0,0.32);
          border: 1.5px solid #dce5da;
          background: #ffffff;
        }
        .lote-custom-popup .leaflet-popup-content {
          margin: 0;
          line-height: normal;
        }
        .lote-custom-popup .leaflet-popup-tip {
          background: #ffffff;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }

        /* Bottom Sheet Material 3 Expressive para todos los tamaños */
        .lote-sheet-scrim {
          position: fixed !important;
          inset: 0 !important;
          background: rgba(0, 0, 0, 0.35) !important;
          backdrop-filter: blur(2px);
          z-index: 99998 !important;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.3s cubic-bezier(0.2, 0, 0, 1), background 0.3s cubic-bezier(0.2, 0, 0, 1) !important;
        }
        .lote-sheet-scrim.open {
          opacity: 1 !important;
          pointer-events: auto !important;
        }
        .lote-sheet-scrim.expanded {
          background: rgba(0, 0, 0, 0.6) !important;
        }

        .lote-m3-sheet {
          position: fixed !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          margin: 0 auto !important;
          width: 100% !important;
          max-width: 520px !important;
          z-index: 99999 !important;
          background: #ffffff !important;
          border-top-left-radius: 28px !important;
          border-top-right-radius: 28px !important;
          border-top: 1.5px solid rgba(45, 62, 44, 0.16) !important;
          box-shadow: 0 -12px 48px rgba(0, 0, 0, 0.28) !important;
          transform: translateY(105%) !important;
          transition: transform 0.45s cubic-bezier(0.16, 1, 0.3, 1), border-radius 0.35s ease !important;
          will-change: transform;
          padding: 8px 18px 28px !important;
          box-sizing: border-box !important;
          height: calc(100vh - 20px) !important;
          max-height: calc(100vh - 20px) !important;
          overflow: hidden !important;
          scrollbar-width: none !important;
          -webkit-overflow-scrolling: touch;
          font-family: 'Plus Jakarta Sans', 'Work Sans', sans-serif !important;
          color: #1e3e2b !important;
          overscroll-behavior: contain;
        }
        .lote-m3-sheet::-webkit-scrollbar {
          display: none !important;
        }
        /* Abrir a la mitad de la pantalla de forma suave */
        .lote-m3-sheet.open {
          transform: translateY(50%) !important;
        }
        /* Expandido a pantalla completa con header fijo y cuerpo con scroll independiente */
        .lote-m3-sheet.expanded {
          transform: translateY(0) !important;
          display: flex !important;
          flex-direction: column !important;
          overflow: hidden !important;
          height: 100dvh !important;
          max-height: 100dvh !important;
          border-top-left-radius: 0 !important;
          border-top-right-radius: 0 !important;
          padding-bottom: 0 !important;
        }
        .lote-m3-sheet.expanded #lote-sheet-full-detail {
          flex: 1 1 0% !important;
          min-height: 0 !important;
          overflow-y: auto !important;
          -webkit-overflow-scrolling: touch;
          padding-bottom: 96px !important;
          scrollbar-width: none !important;
        }
        .lote-m3-sheet.expanded #lote-sheet-full-detail::-webkit-scrollbar {
          display: none !important;
        }
        #dl-embedded-sheet-map-wrap {
          isolation: isolate;
          z-index: 1;
        }
        #lote-sheet-full-detail .dl-header-btn-wrap,
        #lote-sheet-full-detail .plan-btn-add-inline,
        #lote-sheet-full-detail .dl-evo-header-btns,
        #lote-sheet-full-detail #dl-foto-evo-empty-state button {
          display: none !important;
        }
        #lote-sheet-full-detail .dl-header-cafetal {
          margin-bottom: 6px !important;
          padding-bottom: 10px !important;
          flex-direction: row !important;
          align-items: center !important;
          justify-content: flex-start !important;
          text-align: left !important;
        }
        #lote-sheet-full-detail .dl-header-title-box {
          flex-direction: row !important;
          align-items: center !important;
          text-align: left !important;
          gap: 12px !important;
        }
        #lote-sheet-full-detail .da-calendar-card {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          border-radius: 0 !important;
          padding: 4px 0 8px !important;
          margin: 0 !important;
        }
        #lote-sheet-full-detail .da-calendar-layout {
          gap: 10px !important;
        }
        #lote-sheet-full-detail .da-cal-strip-day.today .da-cal-strip-num,
        #lote-sheet-full-detail .da-cal-day.da-cal-today span {
          color: #ff6b00 !important;
          font-weight: 800 !important;
        }
        #lote-sheet-full-detail #plan-day-details,
        #lote-sheet-full-detail .da-day-details,
        #lote-sheet-full-detail .cafetal-day-details-inner {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          border-radius: 0 !important;
          padding: 6px 0 0 !important;
          margin: 0 !important;
        }
        #lote-sheet-full-detail .plan-ev {
          background: transparent !important;
          border: none !important;
          border-bottom: 1px solid #eef2ee !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          padding: 12px 0 !important;
          margin-bottom: 8px !important;
        }
        #lote-sheet-full-detail .dl-evo-card {
          background: transparent !important;
          border: none !important;
          border-bottom: 1px solid #eef2ee !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          padding: 0 0 14px !important;
        }
        #lote-sheet-full-detail .dl-evo-card > div:first-child {
          border-radius: 16px !important;
          overflow: hidden !important;
        }
        #lote-sheet-full-detail .dl-evo-card > div:last-child {
          padding: 12px 2px 0 !important;
        }
        .lote-sheet-fixed-footer {
          position: fixed !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          margin: 0 auto !important;
          width: 100% !important;
          max-width: 520px !important;
          z-index: 100001 !important;
          background: rgba(255, 255, 255, 0.96) !important;
          backdrop-filter: blur(10px);
          border-top: 1px solid rgba(45, 62, 44, 0.12) !important;
          padding: 10px 14px calc(12px + env(safe-area-inset-bottom, 0px)) !important;
          display: flex !important;
          align-items: center !important;
          gap: 10px !important;
          box-sizing: border-box !important;
          box-shadow: 0 -6px 20px rgba(0, 0, 0, 0.08) !important;
          transform: translateY(110%) !important;
          transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1) !important;
        }
        .lote-sheet-fixed-footer.open {
          transform: translateY(0) !important;
        }

        .lote-sheet-handle-box {
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 4px 0 8px;
          cursor: pointer;
          touch-action: none;
          user-select: none;
        }
        .lote-sheet-handle {
          width: 48px;
          height: 5px;
          border-radius: 4px;
          background: rgba(30, 62, 43, 0.28);
          transition: background 0.2s, width 0.2s;
        }
        .lote-sheet-handle-box:hover .lote-sheet-handle {
          background: rgba(30, 62, 43, 0.5);
        }
        .lote-m3-sheet.expanded .lote-sheet-handle {
          background: rgba(30, 62, 43, 0.4);
          width: 54px;
        }
        .lote-sheet-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 6px;
        }
        .lote-sheet-title {
          margin: 0 0 6px 0;
          color: #1e3e2b;
          font-size: 20px;
          font-weight: 800;
          letter-spacing: -0.3px;
        }
        .lote-sheet-stats {
          display: flex;
          align-items: center;
          gap: 14px;
          font-size: 13px;
          color: #2d3e2c;
          margin-bottom: 10px;
          flex-wrap: wrap;
        }
        .lote-sheet-stats span {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .lote-sheet-stats img {
          width: 17px !important;
          height: 17px !important;
          object-fit: contain;
        }
        .lote-sheet-actions {
          display: flex;
          gap: 8px;
          margin-top: 10px;
        }
        .lote-sheet-btn-main {
          flex: 1;
          padding: 12px 18px;
          border-radius: 14px;
          background: #1e3e2b;
          color: #ffffff;
          font-weight: 800;
          font-size: 13.5px;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(30,62,43,0.25);
          transition: background 0.15s, transform 0.15s;
        }
        .lote-sheet-btn-main:active {
          transform: scale(0.97);
        }
        .lote-sheet-btn-expand {
          width: 44px;
          height: 44px;
          border-radius: 14px;
          background: rgba(30,62,43,0.08);
          border: 1px solid rgba(30,62,43,0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #1e3e2b;
          cursor: pointer;
          transition: background 0.15s;
        }
        .lote-sheet-btn-expand:hover {
          background: rgba(30,62,43,0.14);
        }
        .lote-sheet-expanded-sec {
          margin-top: 14px;
          padding-top: 14px;
          border-top: 1px solid rgba(30,62,43,0.12);
        }

        .lote-float-close {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: none;
          border: none;
          cursor: pointer;
          color: #777;
          padding: 4px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .lote-float-close:hover {
          background: #f2f4f0;
        }
        .mapa-pop-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 8px;
        }
        .mapa-pop-title {
          margin: 0;
          color: #2d3e2c;
          font-size: 16px;
          font-weight: 800;
        }
        .mapa-pop-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 10px;
          border-radius: 20px;
          background: #2d3e2c;
          color: #fff;
          font-size: 11px;
          font-weight: 700;
          white-space: nowrap;
        }
        .mapa-pop-stats {
          display: flex;
          gap: 12px;
          font-size: 12px;
          color: #555;
          margin-bottom: 10px;
          flex-wrap: wrap;
        }
        .mapa-pop-stats span {
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .mapa-pop-stats img {
          width: 16px !important;
          height: 16px !important;
          max-width: 16px !important;
          max-height: 16px !important;
          object-fit: contain !important;
          display: inline-block !important;
          flex-shrink: 0 !important;
        }
        .mapa-pop-sec {
          background: #f4f6f2;
          border-radius: 10px;
          padding: 8px 10px;
          margin-bottom: 10px;
        }
        .mapa-pop-sec-t {
          display: block;
          font-size: 11px;
          font-weight: 700;
          color: #5a7056;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          margin-bottom: 4px;
        }
        .mapa-pop-row {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 12px;
          color: #333;
          padding: 2px 0;
        }
        .mapa-pop-row b {
          font-weight: 700;
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .mapa-pop-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          width: 100%;
          margin-top: 4px;
          padding: 9px 12px;
          border: none;
          border-radius: 10px;
          background: #2d3e2c;
          color: #fff;
          font-weight: 700;
          font-size: 12.5px;
          cursor: pointer;
          font-family: 'Work Sans', sans-serif;
          transition: background 0.15s;
        }
        .mapa-pop-btn:hover {
          background: #3d5240;
        }
        .cafetal-hero .ganado-card-value {
          color: #ffffff !important;
          font-weight: 800 !important;
        }
        .cafetal-hero .ganado-tally-label {
          color: rgba(255,255,255,0.92) !important;
        }
        .mapa-pop-chips-carousel {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          padding: 2px 0 6px;
          margin: 6px 0 10px;
          scrollbar-width: thin;
          -webkit-overflow-scrolling: touch;
        }
        .mapa-pop-chips-carousel::-webkit-scrollbar {
          height: 4px;
        }
        .mapa-pop-chips-carousel::-webkit-scrollbar-track {
          background: rgba(0,0,0,0.03);
          border-radius: 4px;
        }
        .mapa-pop-chips-carousel::-webkit-scrollbar-thumb {
          background: #c8d8c6;
          border-radius: 4px;
        }
        .screen-cafetal .da-tabs-section {
          background: white;
          border-radius: 18px;
          padding: 20px 12px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.03);
          border: 1px solid rgba(0,0,0,0.02);
        }
        @media (max-width: 600px) {
          .screen-cafetal .da-tabs-section {
            padding: 0 !important;
          }
        }
        @media (max-width: 768px) {
          .preview-container:has(.screen-cafetal) {
            padding: 0 !important;
            overflow: hidden !important;
          }
          .screen-cafetal {
            padding: 0 !important;
            margin: 0 !important;
          }
          .screen-cafetal .ganado-top-actions-container,
          .screen-cafetal .ganado-page-title {
            display: none !important;
          }
          .screen-cafetal .da-tabs-section {
            margin-top: 0 !important;
            padding: 0 !important;
            border-radius: 0 !important;
            border: none !important;
            box-shadow: none !important;
            background: transparent !important;
          }
        }
      </style>

      <div class="screen-cafetal" style="padding-bottom: 80px;">
        <!-- Top Search Bar + Quick Add aligned exactly like Ganado -->
        <div class="ganado-top-actions-container" style="display: flex; justify-content: flex-end; gap: 10px; margin: 16px 0 8px;">
          ${renderM3SearchBar({
            wrapperId: 'lotes-search-wrapper',
            toggleId: 'lotes-search-toggle',
            inputId: 'lotes-search-input',
            clearId: 'lotes-search-clear',
            placeholder: 'Buscar lote...',
            value: currentLotesSearchQuery,
            extraHtml: `
              <button class="ganado-split-ctrl-reg m3-search-split-btn" onclick="window.navigateTo('nuevo_lote')" title="Nuevo Lote" aria-label="Nuevo Lote">
                <span class="material-icons">add</span>
              </button>
            `
          })}
        </div>

        <div class="ganado-page-title" style="margin-top: -10px; margin-bottom: 24px;">
          <h2>Gestión del Cafetal</h2>
        </div>

        <div class="da-tabs-section" style="margin-top: 10px;">
          ${(() => { window._cafetalTotalPlantas = totalPlantas; return ''; })()}
          <style>
            .cafetal-mobile-pills { display: none; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
            @media (max-width: 768px) {
              .cafetal-hero { display: none !important; }
              .cafetal-mobile-pills { display: flex !important; }
            }
          </style>
          <!-- Mobile Pills removed -->
          ${''}
          <!-- 1. Hero Summary Card (Dark Green Banner) -->
          ${allLotes.length > 0 ? `
          <div class="cafetal-hero" style="margin-bottom: 14px;">
            <div class="ganado-card ganado-card-primary ganado-tally" style="background: var(--m3-primary, #2d3e2c); border-radius: 20px; padding: 24px 22px 20px; box-shadow: 0 6px 24px rgba(45,62,44,0.22); width: 100%; box-sizing: border-box;">
              <div class="ganado-tally-top" style="margin-bottom: 16px;">
                <span class="ganado-tally-label" style="color: rgba(255,255,255,0.92); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; font-size: 13.5px;">Total Plantas de Café</span>
                <span class="ganado-tally-count">
                  <span class="ganado-card-value" style="color: #ffffff !important; font-size: 38px; font-weight: 800;">${totalPlantas.toLocaleString()}</span>
                </span>
              </div>
              <div class="ganado-tally-divider" style="border-top: 1px solid rgba(255,255,255,0.18); margin-bottom: 16px;"></div>
              <div class="ganado-tally-row" style="display: flex; gap: 10px; align-items: center;">
                <div class="ganado-tag-stat" style="background: rgba(255,255,255,0.95); border-radius: 12px; padding: 8px 12px; flex: 0 0 auto; box-shadow: 0 2px 8px rgba(0,0,0,0.06); display: flex; align-items: center; gap: 8px;">
                  <span class="ganado-tag-swatch" style="background: #2d3e2c; color: #ffffff; border-radius: 8px; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 900; flex-shrink: 0; box-shadow: 0 2px 5px rgba(45,62,44,0.22);">
                    ${allLotes.length}
                  </span>
                  <div style="display: flex; flex-direction: column; line-height: 1.15;">
                    <span style="font-size: 13px; font-weight: 800; color: #2d3e2c; white-space: nowrap;">Lotes</span>
                    <span style="font-size: 10.5px; font-weight: 700; color: #556b53; white-space: nowrap;">${totalHa.toFixed(2)} ha</span>
                  </div>
                </div>
                <a href="#" onclick="event.preventDefault(); window.navigateTo('plan_ifcafe')" class="ganado-tag-stat cafetal-hero-manejo-link" style="background: rgba(255,255,255,0.95); border-radius: 12px; padding: 10px 14px; flex: 1; min-width: 0; box-shadow: 0 2px 8px rgba(0,0,0,0.06); display: flex; align-items: center; justify-content: space-between; text-decoration: none; color: inherit; cursor: pointer; transition: transform 0.15s, box-shadow 0.15s;" title="Abrir Manejo y Calendario del Cafetal">
                  <div style="display: flex; align-items: center; gap: 10px; min-width: 0; overflow: hidden;">
                    <span class="ganado-tag-swatch" style="background: rgba(45,62,44,0.08); border-radius: 8px; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; font-size: 17px; flex-shrink: 0;">🌿</span>
                    <span class="ganado-tag-info" style="display: flex; flex-direction: column; min-width: 0;">
                      <span style="font-size: 14px; font-weight: 800; color: #2d3e2c; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Manejo Cafetal</span>
                      <span style="font-size: 10px; text-transform: uppercase; color: #666; font-weight: 700; letter-spacing: 0.2px; white-space: nowrap;">Registro / Plan</span>
                    </span>
                  </div>
                  <span class="material-icons" style="color: #2d3e2c; font-size: 19px; flex-shrink: 0; margin-left: 6px;">chevron_right</span>
                </a>
              </div>
            </div>
          </div>
          ` : ''}

          <!-- Material 3 Mobile Bottom Sheet for Lotes -->
        <div id="lote-sheet-scrim" class="lote-sheet-scrim"></div>
        <div id="lote-bottom-sheet" class="lote-m3-sheet"></div>
        <div id="lote-sheet-fixed-footer" class="lote-sheet-fixed-footer"></div>

        <!-- 2. Interactive ESRI Satellite Map of Lotes (Directly Below Banner) -->
          <div style="position: relative;">
            <div id="mapa-container">
              <div class="mapa-empty" id="mapa-loading">
                <div class="spinner"></div>
                <p>Cargando mapa del cafetal...</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Error in renderDashboard:', err);
    return `<div style="padding: 24px; color: red;">Error cargando cafetal: ${err.message}</div>`;
  }
}

export async function initDashboard() {
  const isMobile = window.innerWidth <= 768 || window.matchMedia?.('(pointer: coarse)')?.matches;
  if (isMobile && window._cafetalTotalPlantas != null) {
    const titleEl = document.querySelector('#current-screen-title .topbar-title-text');
    if (titleEl) {
      titleEl.textContent = `Total Plantas de Café · ${Number(window._cafetalTotalPlantas).toLocaleString()}`;
    }
  }
  // Split control (search + arrow) menu
  window.toggleLotesSplitMenu = (e) => {
    if (e) e.stopPropagation();
    const menu = document.getElementById('lotes-split-menu');
    if (menu) menu.classList.toggle('open');
  };

  document.addEventListener('click', (e) => {
    const menu = document.getElementById('lotes-split-menu');
    if (menu && !e.target.closest('.ganado-split-ctrl')) menu.classList.remove('open');
  });

  // Map Initialization
  document.getElementById('lote-sheet-scrim')?.addEventListener('click', () => {
    clearLoteSelection();
  });
  const container = document.getElementById('mapa-container');
  if (!container) return;

  let lotes = [];
  let aplicaciones = [];
  try {
    const [lotesRes, appsRes] = await Promise.all([
      supabase.from('lotes').select('*').order('nombre', { ascending: true }),
      supabase.from('lote_aplicaciones').select('*').order('fecha', { ascending: false })
    ]);
    if (lotesRes.error) throw lotesRes.error;
    if (appsRes.error) throw appsRes.error;
    lotes = lotesRes.data || [];
    aplicaciones = appsRes.data || [];
  } catch (e) {
    container.innerHTML = '<div class="mapa-empty"><span class="material-icons" style="font-size:40px;">cloud_off</span><p>Error cargando los lotes: ' + e.message + '</p></div>';
    return;
  }

  const appsByLote = {};
  (aplicaciones || []).forEach(a => {
    if (!appsByLote[a.lote_id]) appsByLote[a.lote_id] = [];
    appsByLote[a.lote_id].push(a);
  });

  const withCoords = lotes.filter(l => l.coordenadas_json || l.coordenadas);

  // En móvil: el mapa principal ocupa TODA la pantalla (pegado desde el header hasta abajo, de borde a borde)
  const fitMapToScreen = () => {
    const el = document.getElementById('mapa-container');
    if (!el || !el.isConnected) return;
    const props = ['height', 'min-height', 'width', 'margin-left', 'margin-top', 'border-radius', 'border', 'box-shadow'];
    props.forEach(p => el.style.removeProperty(p));
    if (window.innerWidth > 768) {
      window._dbMapInstance?.invalidateSize();
      return;
    }
    const topbar = document.querySelector('.top-bar');
    const topbarBottom = topbar ? Math.round(topbar.getBoundingClientRect().bottom) : 0;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return; // pantalla oculta
    const gapTop = Math.round(rect.top - topbarBottom);
    const set = (k, v) => el.style.setProperty(k, v, 'important');
    if (gapTop !== 0) {
      set('margin-top', (-gapTop) + 'px');
    }
    const leftAfter = Math.round(el.getBoundingClientRect().left);
    if (leftAfter !== 0) {
      set('margin-left', (-leftAfter) + 'px');
    }
    const mainContent = document.querySelector('.main-content');
    const mainBottom = mainContent ? Math.ceil(mainContent.getBoundingClientRect().bottom) : 0;
    const vh = Math.ceil(Math.max(
      window.innerHeight || 0,
      document.documentElement.clientHeight || 0,
      window.visualViewport?.height || 0,
      mainBottom
    ));
    const vw = Math.ceil(Math.max(
      window.innerWidth || 0,
      document.documentElement.clientWidth || 0,
      window.visualViewport?.width || 0
    ));
    const actualTop = Math.floor(el.getBoundingClientRect().top);
    const h = Math.max(320, vh - actualTop + 2);
    set('width', vw + 'px');
    set('height', h + 'px');
    set('min-height', h + 'px');
    set('border-radius', '0');
    set('border', 'none');
    set('box-shadow', 'none');
    window._dbMapInstance?.invalidateSize({ animate: false, pan: false });
  };
  fitMapToScreen();
  if (window._dbFitMapHandler) {
    window.removeEventListener('resize', window._dbFitMapHandler);
    window.visualViewport?.removeEventListener('resize', window._dbFitMapHandler);
  }
  window._dbFitMapHandler = fitMapToScreen;
  window.addEventListener('resize', fitMapToScreen);
  window.visualViewport?.addEventListener('resize', fitMapToScreen);

  container.innerHTML = `
    <div id="mapa-leaflet" style="width:100%;height:100%;"></div>
    <button class="mapa-layers-btn" id="mapa-layers-btn" title="Cambiar tipo de satélite">
      <span class="material-symbols-outlined" style="font-size:18px;">layers</span>
      <span id="mapa-layers-label">Google Earth</span>
    </button>
  `;

  // Leaflet map setup
  const map = L.map('mapa-leaflet', {
    zoomControl: false,
    attributionControl: false,
    maxZoom: 21,
    minZoom: 3,
    zoomSnap: 0.1
  }).setView([14.6349, -87.4526], 15);

  window._dbMapInstance = map;

  const esriSatLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 21,
    maxNativeZoom: 17
  });

  const googleSatLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    attribution: 'Imagery &copy; Google',
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    maxZoom: 21,
    maxNativeZoom: 20
  }).addTo(map);

  const googleHybridLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    attribution: 'Imagery &copy; Google',
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    maxZoom: 21,
    maxNativeZoom: 20
  });

  // Zoom control
  L.control.zoom({ position: 'topright' }).addTo(map);

  // Layer switcher
  let layerMode = 0;
  const btnLayers = document.getElementById('mapa-layers-btn');
  const layersLabel = document.getElementById('mapa-layers-label');
  if (btnLayers) {
    btnLayers.addEventListener('click', () => {
      layerMode = (layerMode + 1) % 3;
      map.removeLayer(esriSatLayer);
      map.removeLayer(googleSatLayer);
      map.removeLayer(googleHybridLayer);
      if (layerMode === 0) {
        map.addLayer(googleSatLayer);
        if (layersLabel) layersLabel.textContent = 'Google Earth';
        window.Snackbar?.show('Capa: Google Earth / Satélite', { duration: 1200 });
      } else if (layerMode === 1) {
        map.addLayer(googleHybridLayer);
        if (layersLabel) layersLabel.textContent = 'Google Híbrido';
        window.Snackbar?.show('Capa: Google Híbrido', { duration: 1200 });
      } else {
        map.addLayer(esriSatLayer);
        if (layersLabel) layersLabel.textContent = 'Esri Sat.';
        window.Snackbar?.show('Capa: Esri Satélite', { duration: 1200 });
      }
    });
  }

  // Load Punto de Referencia
  loadPuntoReferencia().then(pt => {
    if (!pt) return;
    if (refMarker) map.removeLayer(refMarker);
    const redPin = L.divIcon({
      className: 'ref-pin-icon',
      html: `<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;transform:translate(-50%,-100%);">
        <div style="width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#d93025;border:2.5px solid #ffffff;box-shadow:0 4px 10px rgba(0,0,0,0.38);display:flex;align-items:center;justify-content:center;">
          <span class="material-symbols-outlined" style="transform:rotate(45deg);color:#ffffff;font-size:17px;">home</span>
        </div>
        <div style="width:8px;height:4px;border-radius:50%;background:rgba(0,0,0,0.35);margin-top:2px;"></div>
        <span style="margin-top:3px;background:rgba(255,255,255,0.96);color:#1e3e2b;border:1.5px solid #2d3e2c;font-size:11px;font-weight:800;padding:2px 9px;border-radius:999px;white-space:nowrap;box-shadow:0 3px 8px rgba(0,0,0,0.28);letter-spacing:0.1px;">${escapeHtml(pt.nombre || 'Finca')}</span>
      </div>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0]
    });
    refMarker = L.marker([pt.lat, pt.lng], { icon: redPin, interactive: false }).addTo(map);
    if (!withCoords.length) {
      map.setView([pt.lat, pt.lng], 16);
    }
  });

  // Parcels and Selection Logic
  const allBounds = [];
  const polyByLote = {};
  let selectedLoteId = null;
  let activeLotePopup = null;

  function buildLoteBottomSheetHtml(lote, apps) {
    const dHoy = new Date();
    dHoy.setHours(0, 0, 0, 0);
    const hoyStr = dHoy.toISOString().slice(0, 10);

    const calcDias = (fStr) => {
      if (!fStr) return 0;
      const d = new Date(fStr.length === 10 ? fStr + 'T00:00:00' : fStr);
      return Math.floor((dHoy - d) / (1000 * 60 * 60 * 24));
    };

    let maderablesVariedades = lote.maderables_variedades || '';
    let musaceasTipo = lote.musaceas_tipo || '';

    if (lote.coordenadas_json) {
      try {
        const parsedCoords = JSON.parse(lote.coordenadas_json);
        if (parsedCoords && typeof parsedCoords === 'object' && !Array.isArray(parsedCoords)) {
          if (parsedCoords.maderables_variedades && !maderablesVariedades) {
            maderablesVariedades = parsedCoords.maderables_variedades;
          }
          if (parsedCoords.musaceas_tipo && !musaceasTipo) {
            musaceasTipo = parsedCoords.musaceas_tipo;
          }
        }
      } catch {}
    }

    const parseAgroItems = (str) => {
      if (!str) return [];
      return str.split(',').map(item => {
        const trimmed = item.trim();
        if (!trimmed) return null;
        const match = trimmed.match(/^(.+?)(?:\s*\((\d+)\))?$/);
        if (match) {
          return { name: match[1].trim(), qty: match[2] ? parseInt(match[2], 10) : null };
        }
        return { name: trimmed, qty: null };
      }).filter(Boolean);
    };

    const maderablesList = parseAgroItems(maderablesVariedades);
    const musaceasList = parseAgroItems(musaceasTipo);

    const formatEdadLabel = (edad) => {
      if (!edad) return '';
      if (edad === '1_anio') return '1 año · Café Tiernito';
      if (edad === '2_anios') return '2 años · Creciendo';
      if (edad === '3_mas') return '3+ años · En Producción';
      if (edad === 'carga_alta') return 'Carga Muy Alta';
      return edad;
    };

    const sortedApps = [...(apps || [])].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    const recentApps = sortedApps.slice(0, 3);
    const extraCount = Math.max(0, sortedApps.length - 3);

    const plantasCount = Number(lote.num_plantas || 0).toLocaleString();
    const haStr = lote.area_ha ? `${parseFloat(lote.area_ha).toFixed(2)} hectáreas` : '';

    return `
      <!-- Header fijo (no se mueve ni lo tapa el contenido al hacer scroll) -->
      <div style="flex-shrink:0; position:relative; z-index:1000; background:#ffffff; margin:-8px -18px 0; padding:8px 18px 0;">
        <!-- Fila superior: Drag Handle centrado + Botón X arriba a la derecha -->
        <div style="position:relative; display:flex; align-items:center; justify-content:center; padding: 8px 0 18px; min-height: 36px;">
          <div class="lote-sheet-handle-box" id="lote-sheet-handle-box" title="Desliza o toca para expandir" style="padding: 4px 24px; width: auto;">
            <div class="lote-sheet-handle"></div>
          </div>
          <button id="lote-sheet-close" title="Cerrar" aria-label="Cerrar" style="position:absolute; right:0; top:2px; width:34px; height:34px; border-radius:50%; background:#eff4ed; border:none; color:#1e3e2b; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0;">
            <span class="material-symbols-outlined" style="font-size:19px;">close</span>
          </button>
        </div>

        <!-- Header compacto: Nombre del lote + plantas y hectáreas debajo + 3 puntos (Bottom Sheet) -->
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding: 4px 0 14px; border-bottom: 1px solid rgba(45, 62, 44, 0.12);">
          <div style="display:flex; flex-direction:column; gap:3px; flex:1; min-width:0;">
            <h3 class="lote-sheet-title" style="margin:0; font-size:19px; font-weight:800; color:#1e3e2b; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(formatLoteNombre(lote.nombre))}</h3>
            <div style="display:inline-flex; align-items:center; gap:5px; color:#5a6b58; font-weight:600; font-size:12.5px; line-height:1.2;">
              <span>${plantasCount} plantas</span>${haStr ? `<span style="color:#8a4b19;">• ${haStr}</span>` : ''}
            </div>
          </div>
          <button type="button" id="lote-sheet-more-btn" style="width:36px; height:36px; border-radius:50%; background:transparent; border:none; color:#1e3e2b; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0;" title="Opciones del Lote" aria-label="Opciones del Lote">
            <span class="material-symbols-outlined" style="font-size:22px;">more_vert</span>
          </button>
        </div>
      </div>

      <!-- Detalle Completo del Lote en la misma vista -->
      <div class="lote-sheet-expanded-sec" id="lote-sheet-full-detail" style="margin-top: 10px; padding-top: 2px; border-top: none;">
        <div style="padding: 20px; text-align: center; color: #556b53; font-size: 13px; font-weight: 600;">
          Cargando detalles del lote...
        </div>
      </div>
    `;
  }

  function buildPopupCardHtml(lote, apps) {
    const dHoy = new Date();
    dHoy.setHours(0, 0, 0, 0);
    const hoyStr = dHoy.toISOString().slice(0, 10);

    const calcDias = (fStr) => {
      if (!fStr) return 0;
      const d = new Date(fStr.length === 10 ? fStr + 'T00:00:00' : fStr);
      return Math.floor((dHoy - d) / (1000 * 60 * 60 * 24));
    };

    let maderablesVariedades = lote.maderables_variedades || '';
    let musaceasTipo = lote.musaceas_tipo || '';

    if (lote.coordenadas_json) {
      try {
        const parsedCoords = JSON.parse(lote.coordenadas_json);
        if (parsedCoords && typeof parsedCoords === 'object' && !Array.isArray(parsedCoords)) {
          if (parsedCoords.maderables_variedades && !maderablesVariedades) {
            maderablesVariedades = parsedCoords.maderables_variedades;
          }
          if (parsedCoords.musaceas_tipo && !musaceasTipo) {
            musaceasTipo = parsedCoords.musaceas_tipo;
          }
        }
      } catch {}
    }

    const parseAgroItems = (str) => {
      if (!str) return [];
      return str.split(',').map(item => {
        const trimmed = item.trim();
        if (!trimmed) return null;
        const match = trimmed.match(/^(.+?)(?:\s*\((\d+)\))?$/);
        if (match) {
          return { name: match[1].trim(), qty: match[2] ? parseInt(match[2], 10) : null };
        }
        return { name: trimmed, qty: null };
      }).filter(Boolean);
    };

    const maderablesList = parseAgroItems(maderablesVariedades);
    const musaceasList = parseAgroItems(musaceasTipo);

    const formatEdadLabel = (edad) => {
      if (!edad) return '';
      if (edad === '1_anio') return '1 año · Café Tiernito';
      if (edad === '2_anios') return '2 años · Creciendo';
      if (edad === '3_mas') return '3+ años · En Producción';
      if (edad === 'carga_alta') return 'Carga Muy Alta';
      return edad;
    };

    const sortedApps = [...(apps || [])].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    const recentApps = sortedApps.slice(0, 3);
    const extraCount = Math.max(0, sortedApps.length - 3);

    return `
      <div class="mapa-pop-head">
        <span class="mapa-pop-badge" style="display:inline-flex; align-items:center; gap:6px; background:#eef7ee; color:#1b5e20; border:1px solid #c8e6c9; font-weight:800; font-size:11.5px; padding:4px 10px; border-radius:12px;">
          ${escapeHtml(lote.variedad || 'Café')}${lote.edad_categoria ? ` · 🌱 ${escapeHtml(formatEdadLabel(lote.edad_categoria))}` : ''}
        </span>
        <button class="lote-float-close" id="lote-float-close" title="Cerrar">
          <span class="material-symbols-outlined" style="font-size:18px;">close</span>
        </button>
      </div>

      <h3 class="mapa-pop-title">${escapeHtml(formatLoteNombre(lote.nombre))}</h3>

      <div class="mapa-pop-stats" style="margin-top:6px; flex-wrap:wrap; gap:8px;">
        <span><img src="sprouts.png" alt="" style="width:16px;height:16px;object-fit:contain;"> <b>${(lote.num_plantas || 0).toLocaleString()}</b> plantas de café</span>
        <span><img src="area.png" alt="" style="width:16px;height:16px;object-fit:contain;"> <b>${lote.area_ha ? parseFloat(lote.area_ha).toFixed(2) : '0.00'}</b> ha</span>
      </div>

      ${maderablesList.length > 0 || musaceasList.length > 0 ? `
        <div class="mapa-pop-chips-carousel">
          ${maderablesList.map(m => `
            <span style="display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:700; color:#1b5e20; background:#eef7ee; border:1px solid #c8e6c9; border-radius:8px; padding:3px 8px; flex-shrink:0; white-space:nowrap;">
              <span>🌲</span>
              <span>${m.qty !== null ? `<b>${m.qty.toLocaleString()}</b> ${escapeHtml(m.name)}` : escapeHtml(m.name)}</span>
            </span>
          `).join('')}
          ${musaceasList.map(m => `
            <span style="display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:700; color:#7a6000; background:#fff8e1; border:1px solid #ffe082; border-radius:8px; padding:3px 8px; flex-shrink:0; white-space:nowrap;">
              <span>🍌</span>
              <span>${m.qty !== null ? `<b>${m.qty.toLocaleString()}</b> ${escapeHtml(m.name)}` : escapeHtml(m.name)}</span>
            </span>
          `).join('')}
        </div>
      ` : ''}

      <div class="mapa-pop-sec" style="padding: 12px 14px; border-radius: 12px; margin-bottom: 10px; background: #fbfdfa; border: 1px solid #e2ebe0;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <span class="mapa-pop-sec-t" style="margin:0; font-size:11px; font-weight:800; text-transform:uppercase; color:#4a5d48; letter-spacing:0.3px;">Actividades Recientes</span>
          <span style="font-size:11px; font-weight:700; color:#555;">${sortedApps.length} en total</span>
        </div>

        ${recentApps.length > 0 ? recentApps.map(a => {
          const isAplicada = a.estado === 'Aplicada' || a.estado === 'Realizada';
          const isHoy = a.fecha === hoyStr;
          const isAtrasada = !isAplicada && a.fecha < hoyStr;
          const isParaHoy = !isAplicada && isHoy;
          const dias = calcDias(a.fecha);

          if (isAplicada && isHoy) {
            return `
              <div style="background:#eef7ee; border-left:4px solid #2e7d32; border-radius:8px; padding:9px 12px; margin-bottom:8px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
                  <span style="display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:800; color:#1b5e20;">
                    <span class="material-symbols-outlined" style="font-size:17px; color:#2e7d32;">check_circle</span>
                    ${escapeHtml(a.producto || a.tipo)}
                  </span>
                  <span style="font-size:10.5px; font-weight:800; color:#1b5e20; background:rgba(46,125,50,0.15); padding:2px 7px; border-radius:6px; white-space:nowrap;">
                    🟢 Aplicada hoy
                  </span>
                </div>
              </div>
            `;
          } else if (isAplicada) {
            return `
              <div style="background:#f4f6f2; border-left:4px solid #2d3e2c; border-radius:8px; padding:9px 12px; margin-bottom:8px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
                  <span style="display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:700; color:#2d3e2c;">
                    <span class="material-symbols-outlined" style="font-size:17px; color:#2d3e2c;">eco</span>
                    ${escapeHtml(a.producto || a.tipo)}
                  </span>
                  <span style="font-size:11px; color:#555; white-space:nowrap; font-weight:600;">
                    ${formatFechaStr(a.fecha)}
                  </span>
                </div>
                <div style="font-size:11px; color:#666; margin-top:3px; padding-left:23px;">
                  Aplicada ${dias === 1 ? 'ayer' : `hace ${dias} días`}
                </div>
              </div>
            `;
          } else if (isParaHoy) {
            return `
              <div style="background:#fffbe6; border-left:4px solid #f57f17; border-radius:8px; padding:9px 12px; margin-bottom:8px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
                  <span style="display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:800; color:#e65100;">
                    <span class="material-symbols-outlined" style="font-size:17px; color:#f57f17;">today</span>
                    ${escapeHtml(a.producto || a.tipo)}
                  </span>
                  <span style="font-size:10.5px; font-weight:800; color:#e65100; background:rgba(245,127,23,0.15); padding:2px 7px; border-radius:6px; white-space:nowrap;">
                    📅 Para hoy
                  </span>
                </div>
              </div>
            `;
          } else if (isAtrasada) {
            return `
              <div style="background:#fff2f0; border-left:4px solid #d32f2f; border-radius:8px; padding:9px 12px; margin-bottom:8px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
                  <span style="display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:800; color:#c62828;">
                    <span class="material-symbols-outlined" style="font-size:17px; color:#d32f2f;">warning</span>
                    ${escapeHtml(a.producto || a.tipo)}
                  </span>
                  <span style="font-size:10.5px; font-weight:800; color:#d32f2f; background:rgba(211,47,47,0.12); padding:2px 7px; border-radius:6px; white-space:nowrap;">
                    Atrasada
                  </span>
                </div>
              </div>
            `;
          } else {
            return `
              <div style="background:#f0f7ff; border-left:4px solid #1976d2; border-radius:8px; padding:9px 12px; margin-bottom:8px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
                  <span style="display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:700; color:#0d47a1;">
                    <span class="material-symbols-outlined" style="font-size:17px; color:#1976d2;">event</span>
                    ${escapeHtml(a.producto || a.tipo)}
                  </span>
                  <span style="font-size:11px; font-weight:700; color:#1976d2; white-space:nowrap;">
                    ${formatFechaStr(a.fecha)}
                  </span>
                </div>
              </div>
            `;
          }
        }).join('') : `
          <div style="font-size:11.5px; color:#777; font-style:italic; padding:6px 0; text-align:center;">
            Sin labores registradas en este lote
          </div>
        `}

        ${extraCount > 0 ? `
          <div style="font-size:11px; color:#4a5d48; text-align:center; font-weight:700; padding:6px 0 2px;">
            +${extraCount} labores anteriores registradas
          </div>
        ` : ''}
      </div>

      <div style="margin-top:10px;">
        <button class="mapa-pop-btn" onclick="window.navigateTo('detalle_lote', '${lote.id}')">
          <span class="material-symbols-outlined" style="font-size:18px;">visibility</span>
          <span>Ver Detalle del Lote</span>
        </button>
      </div>
    `;
  }

  function showLotePopup(lote, apps, center) {
    if (activeLotePopup) {
      map.closePopup(activeLotePopup);
    }
    const html = `
      <div class="lote-leaflet-popup-content" style="min-width:280px; max-width:320px; font-family:'Work Sans', sans-serif;">
        ${buildPopupCardHtml(lote, apps)}
      </div>
    `;
    activeLotePopup = L.popup({
      closeButton: false,
      autoPan: true,
      autoPanPaddingTopLeft: [25, 30],
      autoPanPaddingBottomRight: [25, 30],
      offset: [0, -8],
      className: 'lote-custom-popup'
    })
    .setLatLng(center)
    .setContent(html)
    .openOn(map);

    setTimeout(() => {
      document.getElementById('lote-float-close')?.addEventListener('click', clearLoteSelection);
    }, 50);
  }

  function showLoteBottomSheet(lote, apps, initialTab = null) {
    const sheet = document.getElementById('lote-bottom-sheet');
    const scrim = document.getElementById('lote-sheet-scrim');
    if (!sheet) return;

    sheet.scrollTop = 0;
    sheet.innerHTML = buildLoteBottomSheetHtml(lote, apps);
    sheet.classList.add('open', 'expanded');
    if (scrim) scrim.classList.add('open', 'expanded');

    // Attach close button
    document.getElementById('lote-sheet-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      clearLoteSelection();
    });

    // Botón 3 puntos -> abre Bottom Sheet de acciones del lote (Editar / Eliminar)
    document.getElementById('lote-sheet-more-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('lote-actions-sheet-overlay')?.remove();
      const actOverlay = document.createElement('div');
      actOverlay.id = 'lote-actions-sheet-overlay';
      actOverlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.48); backdrop-filter:blur(2px); z-index:100025; display:flex; align-items:flex-end; justify-content:center;';
      actOverlay.innerHTML = `
        <div style="width:100%; max-width:520px; background:#ffffff; border-radius:26px 26px 0 0; padding:12px 8px calc(18px + env(safe-area-inset-bottom, 0px)); box-shadow:0 -10px 34px rgba(0,0,0,0.26); animation:slideUp 0.2s ease-out;">
          <div style="width:38px; height:4px; border-radius:999px; background:#d0dad0; margin:0 auto 10px;"></div>
          <div id="lote-action-edit" style="padding:14px 20px; display:flex; align-items:center; gap:16px; cursor:pointer; border-radius:14px; font-size:15px; font-weight:700; color:#1e3e2b;">
            <span class="material-symbols-outlined" style="font-size:22px; color:#2d3e2c;">edit</span>
            <span>Editar Lote</span>
          </div>
          <div id="lote-action-delete" style="padding:14px 20px; display:flex; align-items:center; gap:16px; cursor:pointer; border-radius:14px; font-size:15px; font-weight:700; color:#ba1a1a;">
            <span class="material-symbols-outlined" style="font-size:22px; color:#ba1a1a;">delete</span>
            <span>Eliminar Lote</span>
          </div>
        </div>
      `;
      document.body.appendChild(actOverlay);
      const closeActions = () => actOverlay.remove();
      actOverlay.addEventListener('click', (ev) => {
        if (ev.target === actOverlay) closeActions();
      });
      document.getElementById('lote-action-edit')?.addEventListener('click', () => {
        closeActions();
        window.navigateTo('nuevo_lote', lote.id);
      });
      document.getElementById('lote-action-delete')?.addEventListener('click', () => {
        closeActions();
        window.confirmDeleteLoteFromDetalle?.(lote.id, lote.nombre);
      });
    });

    // Function to expand/collapse
    const setSheetExpanded = (expand) => {
      if (expand) {
        sheet.classList.add('expanded');
        if (scrim) scrim.classList.add('expanded');
      } else {
        sheet.classList.remove('expanded');
        if (scrim) scrim.classList.remove('expanded');
      }
      const icon = document.getElementById('lote-sheet-expand-icon');
      if (icon) icon.textContent = expand ? 'keyboard_arrow_down' : 'keyboard_arrow_up';
      const cue = document.getElementById('lote-sheet-drag-cue');
      if (cue) {
        cue.innerHTML = expand 
          ? `<span>Desliza hacia abajo para contraer</span><span class="material-symbols-outlined" style="font-size:14px;">expand_more</span>`
          : `<span>Desliza hacia arriba para pantalla completa</span><span class="material-symbols-outlined" style="font-size:14px;">expand_less</span>`;
      }
    };

    const toggleExpand = (e) => {
      e?.stopPropagation();
      setSheetExpanded(!sheet.classList.contains('expanded'));
    };

    document.getElementById('lote-sheet-handle-box')?.addEventListener('click', toggleExpand);
    document.getElementById('lote-sheet-expand-btn')?.addEventListener('click', toggleExpand);

    // Poblar footer fijo del bottom sheet con la acción principal según la pestaña activa
    const fixedFooter = document.getElementById('lote-sheet-fixed-footer');
    if (fixedFooter) {
      let activeSheetTab = 'manejo';
      const getTodayLocalStr = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      };
      const formatShortL = (n) => `L ${Math.round(Number(n) || 0).toLocaleString('es-HN')}`;
      const formatDecL = (n) => `L ${(Number(n) || 0).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const formatShortDate = (fStr) => {
        if (!fStr) return '';
        const d = new Date(String(fStr).slice(0, 10) + 'T12:00:00');
        if (isNaN(d)) return fStr;
        return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');
      };

      const loadLoteBalance = async () => {
        const balWrap = document.getElementById('dl-balance-wrap');
        if (!balWrap) return;
        balWrap.innerHTML = `<div style="padding:24px; text-align:center; color:#556b53; font-size:13px; font-weight:600;">Cargando balance de cuentas...</div>`;
        try {
          const { data: allGastos = [] } = await supabase.from('gastos').select('*');
          const loteMovs = (allGastos || [])
            .filter(g => g.lote_id === lote.id)
            .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));

          const isIngresoMov = (m) => {
            const cat = String(m.categoria || '').toLowerCase();
            const tipo = String(m.tipo || '').toLowerCase();
            return tipo === 'ingreso' || cat.includes('ingreso') || cat.includes('venta');
          };

          const gastosList = loteMovs.filter(m => !isIngresoMov(m));
          const ingresosList = loteMovs.filter(m => isIngresoMov(m));
          const totalInvertido = gastosList.reduce((s, g) => s + (Number(g.monto) || 0), 0);
          const totalIngresos = ingresosList.reduce((s, g) => s + (Number(g.monto) || 0), 0);
          const balance = totalIngresos - totalInvertido;
          const numPlantas = Number(lote.num_plantas) || 0;
          const costoPorPlanta = numPlantas > 0 ? totalInvertido / numPlantas : 0;

          // Agrupar gastos por categoría (con sus movimientos dentro)
          const catMap = {};
          gastosList.forEach(g => {
            const catName = (g.categoria || 'Otros').trim() || 'Otros';
            if (!catMap[catName]) catMap[catName] = { total: 0, items: [] };
            catMap[catName].total += (Number(g.monto) || 0);
            catMap[catName].items.push(g);
          });
          const catEntries = Object.entries(catMap).sort((a, b) => b[1].total - a[1].total);
          const maxCatVal = catEntries.length > 0 ? Math.max(...catEntries.map(([, v]) => v.total), 1) : 1;

          // Agrupar ingresos por producto/categoría
          const ingMap = {};
          ingresosList.forEach(g => {
            const catName = String(g.categoria || 'Otros').replace(/^Ingreso · /i, '').trim() || 'Otros';
            if (!ingMap[catName]) ingMap[catName] = { total: 0, items: [] };
            ingMap[catName].total += (Number(g.monto) || 0);
            ingMap[catName].items.push(g);
          });
          const ingEntries = Object.entries(ingMap).sort((a, b) => b[1].total - a[1].total);
          const maxIngVal = ingEntries.length > 0 ? Math.max(...ingEntries.map(([, v]) => v.total), 1) : 1;

          const balanceStr = balance < 0 ? `–${formatShortL(Math.abs(balance))}` : formatShortL(balance);
          const balanceColor = balance > 0 ? '#1b6e1b' : '#111827';

          const renderCatAccordion = (entries, maxVal, isIngSection = false) => entries.map(([cat, info], idx) => {
            const pct = Math.max(4, Math.round((info.total / maxVal) * 100));
            const count = info.items.length;
            const countLabel = `${count} ${count === 1 ? 'movimiento' : 'movimientos'}`;
            const cardId = `bal-cat-${isIngSection ? 'ing' : 'egr'}-${idx}`;
            const accentColor = isIngSection ? '#1b6e1b' : '#b34200';
            return `
              <div class="bal-cat-card" data-target="${cardId}" style="background:#ffffff; border:1px solid #e6ece4; border-radius:16px; padding:12px 14px; margin-bottom:10px; cursor:pointer;">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:8px;">
                  <div>
                    <div style="font-size:14px; font-weight:700; color:#111827; line-height:1.2;">${escapeHtml(cat)}</div>
                    <div style="font-size:11.5px; color:#5a6b58; margin-top:2px;">${countLabel}</div>
                  </div>
                  <div style="display:flex; align-items:center; gap:6px;">
                    <span style="font-size:14.5px; font-weight:800; color:${accentColor}; white-space:nowrap;">${formatShortL(info.total)}</span>
                    <span class="material-symbols-outlined bal-cat-chev" style="font-size:19px; color:#5a6b58; transition:transform .2s;">keyboard_arrow_down</span>
                  </div>
                </div>
                <div style="width:100%; height:6px; background:${isIngSection ? '#e7eee6' : '#f1ebe7'}; border-radius:999px; overflow:hidden;">
                  <div style="width:${pct}%; height:100%; background:${accentColor}; border-radius:999px;"></div>
                </div>
                <div id="${cardId}" class="bal-cat-body" style="display:none; margin-top:12px; padding-left:12px; border-left:2px solid #d5e2d2;">
                  ${info.items.map((g, itemIdx) => `
                    <div class="bal-mov-swipe-wrap" data-mov-id="${escapeHtml(g.id)}" style="position:relative; overflow:hidden; border-radius:10px; ${itemIdx < info.items.length - 1 ? 'border-bottom:1px solid #f0f4ef;' : ''}">
                      <div class="bal-swipe-bg" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:space-between; pointer-events:none; background:transparent;">
                        <div class="bal-swipe-del-bg" style="color:#ffffff; display:flex; align-items:center; gap:6px; padding:0 16px; font-size:12.5px; font-weight:700; opacity:0;">
                          <span class="material-symbols-outlined" style="font-size:18px;">delete</span>
                          <span>Eliminar</span>
                        </div>
                        <div class="bal-swipe-edit-bg" style="color:#ffffff; display:flex; align-items:center; gap:6px; padding:0 16px; font-size:12.5px; font-weight:700; opacity:0;">
                          <span>Editar</span>
                          <span class="material-symbols-outlined" style="font-size:18px;">edit</span>
                        </div>
                      </div>
                      <div class="bal-mov-row" style="position:relative; z-index:2; background:#ffffff; display:flex; align-items:flex-start; gap:14px; padding:9px 4px; touch-action:pan-y; user-select:none; -webkit-user-select:none; transition:transform .18s ease;">
                        <div style="font-size:13.5px; font-weight:800; color:${accentColor}; min-width:82px; white-space:nowrap;">${isIngSection ? '+' : '–'} ${formatShortL(g.monto)}</div>
                        <div style="min-width:0; flex:1;">
                          <div style="font-size:13.5px; font-weight:600; color:#111827; line-height:1.25;">${escapeHtml(g.descripcion || 'Sin descripción')}</div>
                          <div style="font-size:11.5px; color:#5a6b58; margin-top:2px;">${escapeHtml(formatShortDate(g.fecha))}</div>
                        </div>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            `;
          }).join('');

          balWrap.innerHTML = `
            <!-- 3 Tarjetas de Resumen: Invertido | Ingresos | Balance -->
            <div style="display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:8px; margin-bottom:10px;">
              <div style="background:#ffffff; border:1px solid #e6ece4; border-radius:14px; padding:10px 12px;">
                <div style="font-size:11.5px; color:#5a6b58; font-weight:600;">Invertido</div>
                <div style="font-size:16.5px; font-weight:800; color:#b34200; margin-top:2px; white-space:nowrap;">${formatShortL(totalInvertido)}</div>
              </div>
              <div style="background:#ffffff; border:1px solid #e6ece4; border-radius:14px; padding:10px 12px;">
                <div style="font-size:11.5px; color:#5a6b58; font-weight:600;">Ingresos</div>
                <div style="font-size:16.5px; font-weight:800; color:#1b6e1b; margin-top:2px; white-space:nowrap;">${formatShortL(totalIngresos)}</div>
              </div>
              <div style="background:#ffffff; border:1px solid #e6ece4; border-radius:14px; padding:10px 12px;">
                <div style="font-size:11.5px; color:#5a6b58; font-weight:600;">Balance</div>
                <div style="font-size:16.5px; font-weight:800; color:${balanceColor}; margin-top:2px; white-space:nowrap;">${balanceStr}</div>
              </div>
            </div>

            <!-- Barra Costo por Planta -->
            <div style="background:#eff4ed; border-radius:14px; padding:11px 14px; display:flex; align-items:center; justify-content:space-between; margin-bottom:18px;">
              <span style="font-size:13.5px; font-weight:600; color:#1e3e2b;">Costo por planta</span>
              <span style="font-size:14.5px; font-weight:800; color:#111827;">${numPlantas > 0 ? formatDecL(costoPorPlanta) : '—'}</span>
            </div>

            <!-- Gastos por Categoría (Unificado con movimientos desplegables) -->
            ${catEntries.length > 0 ? `
              <div style="margin-bottom:14px;">
                <div style="font-size:11.5px; font-weight:800; text-transform:uppercase; letter-spacing:0.6px; color:#4a5d48; margin-bottom:10px;">Gastos por categoría · Toca para ver</div>
                ${renderCatAccordion(catEntries, maxCatVal, false)}
              </div>
            ` : ''}

            <!-- Ingresos por Producto (si hay ingresos) -->
            ${ingEntries.length > 0 ? `
              <div style="margin-bottom:14px;">
                <div style="font-size:11.5px; font-weight:800; text-transform:uppercase; letter-spacing:0.6px; color:#1b6e1b; margin-bottom:10px;">Ingresos por producto · Toca para ver</div>
                ${renderCatAccordion(ingEntries, maxIngVal, true)}
              </div>
            ` : ''}

            ${loteMovs.length === 0 ? `
              <div style="padding:24px 12px; text-align:center; color:#777; font-size:13px;">
                Sin movimientos registrados en este lote todavía.
              </div>
            ` : ''}
          `;

          balWrap.querySelectorAll('.bal-cat-card').forEach(card => {
            card.addEventListener('click', (e) => {
              if (e.target.closest('.bal-mov-swipe-wrap')) return;
              const targetId = card.dataset.target;
              const body = targetId ? document.getElementById(targetId) : null;
              const chev = card.querySelector('.bal-cat-chev');
              if (!body) return;
              const isOpen = body.style.display === 'block';
              body.style.display = isOpen ? 'none' : 'block';
              if (chev) chev.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
            });
          });

          const movById = new Map(loteMovs.map(m => [String(m.id), m]));
          balWrap.querySelectorAll('.bal-mov-swipe-wrap').forEach(wrap => {
            const row = wrap.querySelector('.bal-mov-row');
            const swipeBg = wrap.querySelector('.bal-swipe-bg');
            const delBg = wrap.querySelector('.bal-swipe-del-bg');
            const editBg = wrap.querySelector('.bal-swipe-edit-bg');
            const movObj = movById.get(String(wrap.dataset.movId || ''));
            if (!row || !movObj) return;

            let startX = 0;
            let startY = 0;
            let dx = 0;
            let dragging = false;
            let lockedAxis = null;

            const onStart = (x, y) => {
              startX = x;
              startY = y;
              dx = 0;
              dragging = true;
              lockedAxis = null;
              row.style.transition = 'none';
            };
            const onMove = (x, y, ev) => {
              if (!dragging) return;
              const mx = x - startX;
              const my = y - startY;
              if (!lockedAxis) {
                if (Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my)) lockedAxis = 'x';
                else if (Math.abs(my) > 8) { lockedAxis = 'y'; dragging = false; return; }
                else return;
              }
              if (ev && ev.cancelable) ev.preventDefault();
              if (ev) ev.stopPropagation();
              const maxW = wrap.offsetWidth || 320;
              dx = Math.max(-maxW, Math.min(maxW, mx));
              row.style.transform = `translateX(${dx}px)`;
              if (swipeBg) swipeBg.style.background = dx > 4 ? '#ba1a1a' : (dx < -4 ? '#2d3e2c' : 'transparent');
              if (delBg) delBg.style.opacity = dx > 10 ? '1' : '0';
              if (editBg) editBg.style.opacity = dx < -10 ? '1' : '0';
            };
            const onEnd = () => {
              if (!dragging) return;
              dragging = false;
              row.style.transition = 'transform .2s ease';
              row.style.transform = 'translateX(0)';
              if (swipeBg) swipeBg.style.background = 'transparent';
              if (delBg) delBg.style.opacity = '0';
              if (editBg) editBg.style.opacity = '0';

              if (dx >= 55) {
                // Deslizó a la derecha -> Eliminar
                if (typeof window.Snackbar?.confirm === 'function') {
                  window.Snackbar.confirm(
                    `¿Eliminar "${movObj.descripcion || 'este movimiento'}"?`,
                    async () => {
                      const { error } = await supabase.from('gastos').delete().eq('id', movObj.id);
                      if (error) {
                        window.Snackbar?.show('Error eliminando: ' + error.message, { type: 'error' });
                        return;
                      }
                      window.Snackbar?.show('Movimiento eliminado');
                      loadLoteBalance();
                    }
                  );
                }
              } else if (dx <= -55) {
                // Deslizó a la izquierda -> Editar
                openNewGastoForLoteModal(movObj);
              }
              dx = 0;
            };

            wrap.addEventListener('touchstart', (e) => {
              e.stopPropagation();
              const t = e.touches[0];
              if (t) onStart(t.clientX, t.clientY);
            }, { passive: true });
            wrap.addEventListener('touchmove', (e) => {
              const t = e.touches[0];
              if (t) onMove(t.clientX, t.clientY, e);
            }, { passive: false });
            wrap.addEventListener('touchend', onEnd, { passive: true });
            wrap.addEventListener('touchcancel', onEnd, { passive: true });

            wrap.addEventListener('mousedown', (e) => {
              if (e.button !== 0) return;
              onStart(e.clientX, e.clientY);
              const moveH = (me) => onMove(me.clientX, me.clientY, me);
              const upH = () => {
                window.removeEventListener('mousemove', moveH);
                window.removeEventListener('mouseup', upH);
                onEnd();
              };
              window.addEventListener('mousemove', moveH);
              window.addEventListener('mouseup', upH);
            });
          });
        } catch (err) {
          balWrap.innerHTML = `<div style="padding:20px; text-align:center; color:#ba1a1a; font-size:13px;">Error cargando balance: ${escapeHtml(err.message)}</div>`;
        }
      };

      const openNewGastoForLoteModal = (editMov = null) => {
        const isEdit = Boolean(editMov && editMov.id);
        const todayStr = getTodayLocalStr();
        const initialFecha = (editMov?.fecha && /^\d{4}-\d{2}-\d{2}/.test(String(editMov.fecha)))
          ? String(editMov.fecha).slice(0, 10)
          : todayStr;
        const egresoCats = ['Chapias', 'Abonadas', 'Foliares', 'Insumos', 'Terreno y plantado', 'Vivero', 'Cosecha', 'Mano de obra', 'Otros'];
        const ingresoCats = ['Ingreso · Café', 'Ingreso · Plátano', 'Ingreso · Otro cultivo', 'Ingreso · Subsidio', 'Ingreso · Otros'];
        const etapas = ['Vivero', 'Mantenimiento', 'Cosecha'];

        const editCatLower = String(editMov?.categoria || '').toLowerCase();
        const editIsIngreso = isEdit && (
          String(editMov?.tipo || '').toLowerCase() === 'ingreso' ||
          editCatLower.includes('ingreso') ||
          editCatLower.includes('venta')
        );
        let movTipo = editIsIngreso ? 'ingreso' : 'egreso';
        let selectedCat = isEdit && editMov?.categoria
          ? (editIsIngreso && !String(editMov.categoria).startsWith('Ingreso · ') ? `Ingreso · ${editMov.categoria}` : editMov.categoria)
          : egresoCats[0];
        let selectedEtapa = 'Mantenimiento';

        const formatMovDateLabel = (isoStr) => {
          if (!isoStr) return 'Seleccionar';
          const mNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
          const p = String(isoStr).split('-');
          if (p.length !== 3) return isoStr;
          const d = parseInt(p[2], 10);
          const m = mNames[parseInt(p[1], 10) - 1] || p[1];
          return isoStr === todayStr ? `Hoy, ${d} ${m}` : `${d} ${m} ${p[0]}`;
        };

        const rawEditDescLote = isEdit ? String(editMov.descripcion || '') : '';
        const preservedTagsLote = (rawEditDescLote.match(/\[(?:ref:[^\]]+|Por Aprobar)\]/g) || []).join(' ');
        const visibleEditDescLote = rawEditDescLote
          .replace(/\[ref:[^\]]+\]/g, '')
          .replace(/\[Por Aprobar\]/g, '')
          .replace(/\s{2,}/g, ' ')
          .trim();

        showModal(isEdit ? 'Editar movimiento' : 'Nuevo movimiento', `
          <form id="form-lote-gasto-sheet" novalidate style="display:flex; flex-direction:column; gap:13px;">
            <!-- Toggle Egreso / Ingreso -->
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
              <button type="button" id="mov-btn-egreso" style="height:40px; border-radius:12px; border:1px solid #b34200; background:#b34200; color:#ffffff; font-size:13px; font-weight:700; cursor:pointer; transition:all .15s;">Egreso</button>
              <button type="button" id="mov-btn-ingreso" style="height:40px; border-radius:12px; border:1px solid #d5e2d2; background:#ffffff; color:#1f2937; font-size:13px; font-weight:700; cursor:pointer; transition:all .15s;">Ingreso</button>
            </div>

            <!-- Monto -->
            <div style="padding:2px 2px 4px;">
              <div style="font-size:12px; font-weight:600; color:#5a6b58; margin-bottom:2px;">Monto</div>
              <div id="mov-monto-line" style="display:flex; align-items:baseline; gap:6px; border-bottom:1.5px solid #e5ece4; padding-bottom:6px;">
                <span id="mov-monto-prefix" style="font-size:28px; font-weight:800; color:#b34200; line-height:1;">L</span>
                <input type="number" id="mov-monto-input" name="monto" step="0.01" min="0.01" inputmode="decimal" placeholder="0" value="${isEdit ? escapeHtml(String(editMov.monto || '')) : ''}" style="border:none; outline:none; background:transparent; font-size:30px; font-weight:800; color:#b34200; width:100%; line-height:1.1; padding:0;">
              </div>
              <div id="mov-monto-err" style="display:none; font-size:11.5px; font-weight:600; color:#ba1a1a; margin-top:4px;"></div>
            </div>

            <!-- Nombre del movimiento (Material 3 Outlined Text Field) -->
            <div>
              <div id="mov-nombre-field" class="m3-field" style="margin-bottom:0;">
                <input type="text" id="mov-nombre-input" name="nombre_movimiento" placeholder=" " value="${isEdit ? escapeHtml(visibleEditDescLote) : ''}" style="font-size:14px; font-weight:600; background:#ffffff;">
                <label for="mov-nombre-input" style="background:#ffffff;">Nombre del movimiento</label>
              </div>
              <div id="mov-nombre-err" style="display:none; font-size:11.5px; font-weight:600; color:#ba1a1a; margin-top:4px; padding-left:14px;"></div>
            </div>

            <!-- Categoría Carrusel / Producto de Ingreso -->
            <div>
              <div id="mov-cat-label" style="font-size:12px; font-weight:600; color:#5a6b58; margin-bottom:8px;">Categoría</div>
              <div id="mov-cat-pills" style="display:flex; gap:8px; overflow-x:auto; padding-bottom:6px; scrollbar-width:thin;"></div>
            </div>

            <!-- Etapa (solo para Egreso) -->
            <div id="mov-etapa-sec">
              <div style="font-size:12px; font-weight:600; color:#5a6b58; margin-bottom:8px;">Etapa</div>
              <div id="mov-etapa-pills" style="display:flex; gap:8px; flex-wrap:wrap;"></div>
            </div>

            <!-- Fecha (Material 3 Docked Date Picker) y Concepto -->
            <div>
              <div class="m3-field" style="margin-bottom:4px; position:relative;">
                <input type="text" id="mov-fecha-text" value="${(() => { const p = initialFecha.split('-'); return `${p[2]}/${p[1]}/${p[0]}`; })()}" placeholder=" " maxlength="10" inputmode="numeric" style="font-size:14px; font-weight:600; background:#ffffff; padding-right:48px;">
                <label for="mov-fecha-text" style="background:#ffffff;">Fecha</label>
                <button type="button" id="mov-fecha-toggle" aria-label="Abrir calendario" style="position:absolute; right:8px; top:50%; transform:translateY(-50%); width:36px; height:36px; border-radius:50%; border:none; background:#eef2ee; color:#2d3e2c; display:flex; align-items:center; justify-content:center; cursor:pointer;">
                  <span class="material-symbols-outlined" style="font-size:19px;">calendar_today</span>
                </button>
                <input type="hidden" id="mov-fecha-input" name="fecha" value="${initialFecha}">
              </div>
              <div style="font-size:11px; color:#5a6b58; padding-left:14px;">DD/MM/AAAA</div>
              <div id="mov-m3-datepicker" style="display:none; margin-top:8px; background:#f4f7f3; border-radius:20px; padding:14px; border:1px solid #e0e8df; box-shadow:0 6px 18px rgba(0,0,0,0.08);"></div>
            </div>
          </form>
        `);
        const modalBodyEl = document.getElementById('modal-body');
        if (modalBodyEl) {
          const footerDiv = document.createElement('div');
          footerDiv.id = 'mov-fixed-footer';
          footerDiv.style.cssText = 'flex-shrink:0; background:#ffffff; padding:12px 0 4px; border-top:1px solid #eef2ee; display:grid; grid-template-columns:1fr 1.6fr; gap:10px;';
          footerDiv.innerHTML = `
            <button type="button" id="mov-cancel-btn" style="height:44px; border-radius:999px; border:1px solid #d5e2d2; background:#ffffff; color:#2d3e2c; font-size:14px; font-weight:700; cursor:pointer;">
              Cancelar
            </button>
            <button type="button" id="mov-submit-btn" style="height:44px; border-radius:999px; border:none; background:#2d3e2c; color:#ffffff; font-size:14px; font-weight:700; cursor:pointer;">
              Guardar movimiento
            </button>
          `;
          modalBodyEl.appendChild(footerDiv);
        }
        document.getElementById('modal-container')?.classList.add('modal-sheet-expanded');

        const renderCatPills = () => {
          const wrap = document.getElementById('mov-cat-pills');
          const lbl = document.getElementById('mov-cat-label');
          if (!wrap) return;
          const accent = movTipo === 'ingreso' ? '#1b6e1b' : '#b34200';
          if (lbl) lbl.textContent = movTipo === 'ingreso' ? '¿De qué producto viene?' : 'Categoría';
          wrap.style.flexWrap = 'nowrap';
          wrap.style.overflowX = 'auto';
          const baseList = movTipo === 'egreso' ? egresoCats : ingresoCats;
          const list = mergeCategories(baseList, movTipo);
          if (!list.includes(selectedCat)) selectedCat = list[0];
          const prevCatScroll = wrap.scrollLeft;
          wrap.innerHTML = list.map(cat => {
            const active = cat === selectedCat;
            const displayLabel = cat.replace(/^Ingreso · /i, '');
            return `<button type="button" data-cat="${escapeHtml(cat)}" class="${active ? 'is-active-cat' : ''}" style="flex:0 0 auto; height:34px; padding:0 14px; border-radius:999px; border:1px solid ${active ? accent : '#d5e2d2'}; background:${active ? accent : '#ffffff'}; color:${active ? '#ffffff' : '#1f2937'}; font-size:12.5px; font-weight:${active ? '700' : '600'}; cursor:pointer; white-space:nowrap;">${escapeHtml(displayLabel)}</button>`;
          }).join('');
          wrap.scrollLeft = prevCatScroll;
          wrap.querySelectorAll('button[data-cat]').forEach(btn => {
            btn.addEventListener('click', () => {
              const clicked = btn.dataset.cat;
              const isOtros = clicked === 'Otros' || clicked === 'Ingreso · Otros';
              if (isOtros) {
                openNewCategoryBottomSheet({
                  tipo: movTipo,
                  onCreated: (newCat) => {
                    selectedCat = newCat;
                    renderCatPills();
                    requestAnimationFrame(() => {
                      document.querySelector('#mov-cat-pills button.is-active-cat')?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                    });
                  },
                  onUseOtros: () => {
                    selectedCat = clicked;
                    renderCatPills();
                    requestAnimationFrame(() => {
                      document.querySelector('#mov-cat-pills button.is-active-cat')?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                    });
                  }
                });
                return;
              }
              selectedCat = clicked;
              renderCatPills();
              requestAnimationFrame(() => {
                document.querySelector('#mov-cat-pills button.is-active-cat')?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
              });
            });
          });
        };

        const renderEtapaPills = () => {
          const wrap = document.getElementById('mov-etapa-pills');
          if (!wrap) return;
          const accent = movTipo === 'ingreso' ? '#1b6e1b' : '#b34200';
          wrap.innerHTML = etapas.map(et => {
            const active = et === selectedEtapa;
            return `<button type="button" data-etapa="${escapeHtml(et)}" style="height:34px; padding:0 16px; border-radius:999px; border:1px solid ${active ? accent : '#d5e2d2'}; background:${active ? accent : '#ffffff'}; color:${active ? '#ffffff' : '#1f2937'}; font-size:12.5px; font-weight:${active ? '700' : '600'}; cursor:pointer;">${escapeHtml(et)}</button>`;
          }).join('');
          wrap.querySelectorAll('button[data-etapa]').forEach(btn => {
            btn.addEventListener('click', () => {
              selectedEtapa = btn.dataset.etapa;
              renderEtapaPills();
            });
          });
        };

        const syncTipoButtons = () => {
          const bE = document.getElementById('mov-btn-egreso');
          const bI = document.getElementById('mov-btn-ingreso');
          const accent = movTipo === 'ingreso' ? '#1b6e1b' : '#b34200';
          const mPref = document.getElementById('mov-monto-prefix');
          const mInp = document.getElementById('mov-monto-input');
          const subBtn = document.getElementById('mov-submit-btn');
          if (mPref) mPref.style.color = accent;
          if (mInp) mInp.style.color = accent;
          if (subBtn) subBtn.textContent = movTipo === 'ingreso' ? 'Guardar ingreso' : 'Guardar egreso';
          if (bE) {
            const act = movTipo === 'egreso';
            bE.style.background = act ? '#b34200' : '#ffffff';
            bE.style.borderColor = act ? '#b34200' : '#d5e2d2';
            bE.style.color = act ? '#ffffff' : '#1f2937';
          }
          if (bI) {
            const act = movTipo === 'ingreso';
            bI.style.background = act ? '#1b6e1b' : '#ffffff';
            bI.style.borderColor = act ? '#1b6e1b' : '#d5e2d2';
            bI.style.color = act ? '#ffffff' : '#1f2937';
          }
          const etapaSec = document.getElementById('mov-etapa-sec');
          if (etapaSec) etapaSec.style.display = movTipo === 'egreso' ? 'block' : 'none';
          renderCatPills();
          renderEtapaPills();
          requestAnimationFrame(() => {
            document.querySelector('#mov-cat-pills button.is-active-cat')?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
          });
        };

        document.getElementById('mov-btn-egreso')?.addEventListener('click', () => {
          movTipo = 'egreso';
          syncTipoButtons();
        });
        document.getElementById('mov-btn-ingreso')?.addEventListener('click', () => {
          movTipo = 'ingreso';
          syncTipoButtons();
        });

        // Material 3 Docked Date Picker
        (() => {
          const dpWrap = document.getElementById('mov-m3-datepicker');
          const toggleBtn = document.getElementById('mov-fecha-toggle');
          const textInp = document.getElementById('mov-fecha-text');
          const hiddenInp = document.getElementById('mov-fecha-input');
          if (!dpWrap || !toggleBtn || !textInp || !hiddenInp) return;

          const monthShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
          const initParts = todayStr.split('-');
          let viewYear = parseInt(initParts[0], 10);
          let viewMonth = parseInt(initParts[1], 10) - 1;
          let selectedIso = todayStr;

          const pad2 = (n) => String(n).padStart(2, '0');
          const toIso = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;

          const renderCalendar = () => {
            const firstDow = new Date(viewYear, viewMonth, 1).getDay();
            const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
            const prevDays = new Date(viewYear, viewMonth, 0).getDate();

            const cells = [];
            for (let i = firstDow - 1; i >= 0; i--) {
              cells.push({ day: prevDays - i, muted: true, iso: null });
            }
            for (let d = 1; d <= daysInMonth; d++) {
              cells.push({ day: d, muted: false, iso: toIso(viewYear, viewMonth, d) });
            }
            while (cells.length % 7 !== 0) {
              cells.push({ day: cells.length - (firstDow + daysInMonth) + 1, muted: true, iso: null });
            }

            dpWrap.innerHTML = `
              <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; padding:0 2px;">
                <div style="display:flex; align-items:center; gap:4px;">
                  <button type="button" data-dp-nav="prev-m" style="width:30px; height:30px; border-radius:50%; border:none; background:transparent; color:#2d3e2c; cursor:pointer; display:flex; align-items:center; justify-content:center;">
                    <span class="material-symbols-outlined" style="font-size:18px;">chevron_left</span>
                  </button>
                  <span style="font-size:13.5px; font-weight:700; color:#1f2937; min-width:34px; text-align:center;">${monthShort[viewMonth]}</span>
                  <button type="button" data-dp-nav="next-m" style="width:30px; height:30px; border-radius:50%; border:none; background:transparent; color:#2d3e2c; cursor:pointer; display:flex; align-items:center; justify-content:center;">
                    <span class="material-symbols-outlined" style="font-size:18px;">chevron_right</span>
                  </button>
                </div>
                <div style="display:flex; align-items:center; gap:4px;">
                  <button type="button" data-dp-nav="prev-y" style="width:30px; height:30px; border-radius:50%; border:none; background:transparent; color:#2d3e2c; cursor:pointer; display:flex; align-items:center; justify-content:center;">
                    <span class="material-symbols-outlined" style="font-size:18px;">chevron_left</span>
                  </button>
                  <span style="font-size:13.5px; font-weight:700; color:#1f2937; min-width:40px; text-align:center;">${viewYear}</span>
                  <button type="button" data-dp-nav="next-y" style="width:30px; height:30px; border-radius:50%; border:none; background:transparent; color:#2d3e2c; cursor:pointer; display:flex; align-items:center; justify-content:center;">
                    <span class="material-symbols-outlined" style="font-size:18px;">chevron_right</span>
                  </button>
                </div>
              </div>
              <div style="display:grid; grid-template-columns:repeat(7,1fr); text-align:center; margin-bottom:6px;">
                ${['D', 'L', 'M', 'X', 'J', 'V', 'S'].map(w => `<span style="font-size:12px; font-weight:700; color:#4b5563; padding:4px 0;">${w}</span>`).join('')}
              </div>
              <div style="display:grid; grid-template-columns:repeat(7,1fr); gap:2px; text-align:center;">
                ${cells.map(c => {
                  if (c.muted) {
                    return `<span style="height:36px; display:flex; align-items:center; justify-content:center; font-size:13px; color:#9ca3af;">${c.day}</span>`;
                  }
                  const isSel = c.iso === selectedIso;
                  const isToday = c.iso === todayStr;
                  return `<button type="button" data-dp-iso="${c.iso}" style="height:36px; width:36px; margin:0 auto; border-radius:50%; border:${isToday && !isSel ? '1px solid #2d3e2c' : 'none'}; background:${isSel ? '#2d3e2c' : 'transparent'}; color:${isSel ? '#ffffff' : '#111827'}; font-size:13px; font-weight:${isSel || isToday ? '700' : '500'}; cursor:pointer; display:flex; align-items:center; justify-content:center;">${c.day}</button>`;
                }).join('')}
              </div>
            `;

            dpWrap.querySelectorAll('button[data-dp-nav]').forEach(btn => {
              btn.addEventListener('click', () => {
                const act = btn.dataset.dpNav;
                if (act === 'prev-m') {
                  viewMonth--;
                  if (viewMonth < 0) { viewMonth = 11; viewYear--; }
                } else if (act === 'next-m') {
                  viewMonth++;
                  if (viewMonth > 11) { viewMonth = 0; viewYear++; }
                } else if (act === 'prev-y') {
                  viewYear--;
                } else if (act === 'next-y') {
                  viewYear++;
                }
                renderCalendar();
              });
            });

            dpWrap.querySelectorAll('button[data-dp-iso]').forEach(btn => {
              btn.addEventListener('click', () => {
                selectedIso = btn.dataset.dpIso;
                hiddenInp.value = selectedIso;
                const p = selectedIso.split('-');
                textInp.value = `${p[2]}/${p[1]}/${p[0]}`;
                dpWrap.style.display = 'none';
              });
            });
          };

          toggleBtn.addEventListener('click', () => {
            const isOpen = dpWrap.style.display === 'block';
            if (isOpen) {
              dpWrap.style.display = 'none';
            } else {
              renderCalendar();
              dpWrap.style.display = 'block';
              dpWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          });

          textInp.addEventListener('change', () => {
            const m = textInp.value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (m) {
              const d = parseInt(m[1], 10);
              const mo = parseInt(m[2], 10) - 1;
              const y = parseInt(m[3], 10);
              if (mo >= 0 && mo <= 11 && d >= 1 && d <= 31) {
                selectedIso = toIso(y, mo, d);
                hiddenInp.value = selectedIso;
                viewYear = y;
                viewMonth = mo;
                if (dpWrap.style.display === 'block') renderCalendar();
              }
            }
          });
        })();

        syncTipoButtons();
        renderEtapaPills();
        setTimeout(() => document.getElementById('mov-monto-input')?.focus({ preventScroll: true }), 80);

        const setFieldError = (errId, msg, fieldEl, lineEl) => {
          const errEl = document.getElementById(errId);
          if (errEl) {
            errEl.textContent = msg || '';
            errEl.style.display = msg ? 'block' : 'none';
          }
          if (fieldEl) fieldEl.classList.toggle('is-error', Boolean(msg));
          if (lineEl) lineEl.style.borderBottomColor = msg ? '#ba1a1a' : '#e5ece4';
        };

        document.getElementById('mov-monto-input')?.addEventListener('input', () => {
          setFieldError('mov-monto-err', '', null, document.getElementById('mov-monto-line'));
        });
        document.getElementById('mov-nombre-input')?.addEventListener('input', () => {
          setFieldError('mov-nombre-err', '', document.getElementById('mov-nombre-field'), null);
        });

        const handleSaveMov = async () => {
          const submitBtn = document.getElementById('mov-submit-btn');
          const montoRaw = document.getElementById('mov-monto-input')?.value || '';
          const monto = parseFloat(String(montoRaw).replace(/,/g, '')) || 0;
          const desc = String(document.getElementById('mov-nombre-input')?.value || '').trim();
          const fecha = document.getElementById('mov-fecha-input')?.value || todayStr;

          setFieldError('mov-monto-err', '', null, document.getElementById('mov-monto-line'));
          setFieldError('mov-nombre-err', '', document.getElementById('mov-nombre-field'), null);

          if (monto <= 0) {
            setFieldError('mov-monto-err', 'Ingresa un monto mayor a 0', null, document.getElementById('mov-monto-line'));
            document.getElementById('mov-monto-input')?.focus();
            return;
          }
          if (!desc) {
            setFieldError('mov-nombre-err', 'Ingresa el nombre del movimiento', document.getElementById('mov-nombre-field'), null);
            document.getElementById('mov-nombre-input')?.focus();
            return;
          }
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Guardando...';
          }
          try {
            const empresaId = window._currentEmpresaId || localStorage.getItem('current_empresa_id') || lote.empresa_id;
            const finalDescLote = (isEdit && preservedTagsLote) ? `${desc} ${preservedTagsLote}`.trim() : desc;
            const payload = {
              lote_id: lote.id,
              ...(empresaId ? { empresa_id: empresaId } : {}),
              fecha,
              categoria: selectedCat,
              descripcion: finalDescLote,
              monto
            };
            const { error } = isEdit
              ? await supabase.from('gastos').update(payload).eq('id', editMov.id)
              : await supabase.from('gastos').insert([payload]);
            if (error) {
              window.Snackbar?.show('Error guardando movimiento: ' + error.message, { type: 'error' });
              if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = movTipo === 'ingreso' ? 'Guardar ingreso' : 'Guardar egreso';
              }
              return;
            }
            closeModal();
            window.Snackbar?.show(
              isEdit
                ? '✅ Movimiento actualizado'
                : (movTipo === 'ingreso' ? '✅ Ingreso registrado en el lote' : '✅ Egreso registrado en el lote')
            );
            loadLoteBalance();
          } catch (err) {
            window.Snackbar?.show('Error guardando movimiento: ' + err.message, { type: 'error' });
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = 'Guardar movimiento';
            }
          }
        };

        document.getElementById('mov-cancel-btn')?.addEventListener('click', () => closeModal());
        document.getElementById('mov-submit-btn')?.addEventListener('click', handleSaveMov);
        document.getElementById('form-lote-gasto-sheet')?.addEventListener('submit', (ev) => {
          ev.preventDefault();
          handleSaveMov();
        });
      };

      const cosechaCtrl = createCosechaController(lote, 'dl-cosecha-wrap');

      const syncFooterButtons = () => {
        const singleBtn = document.getElementById('lote-footer-register-btn');
        const cosechaRow = document.getElementById('lote-footer-cosecha-row');
        const rIcon = document.getElementById('lote-footer-register-icon');
        const rLbl = document.getElementById('lote-footer-register-label');
        const selDate = window._planSelectedDateStr || getTodayLocalStr();
        const isFutureDate = selDate > getTodayLocalStr();

        if (activeSheetTab === 'cosecha') {
          if (singleBtn) singleBtn.style.display = 'none';
          if (cosechaRow) cosechaRow.style.display = 'grid';
        } else {
          if (cosechaRow) cosechaRow.style.display = 'none';
          if (singleBtn) singleBtn.style.display = 'flex';
          if (activeSheetTab === 'timeline') {
            if (rIcon) rIcon.textContent = 'add_a_photo';
            if (rLbl) rLbl.textContent = 'Subir Fotografía';
          } else if (activeSheetTab === 'balance') {
            if (rIcon) rIcon.textContent = 'receipt_long';
            if (rLbl) rLbl.textContent = 'Registrar Movimiento';
          } else {
            if (rIcon) rIcon.textContent = isFutureDate ? 'calendar_add_on' : 'add_circle';
            if (rLbl) rLbl.textContent = isFutureDate ? 'Programar Actividad' : 'Registrar Actividad';
          }
        }
        const mapWrap = document.getElementById('dl-embedded-sheet-map-wrap');
        if (mapWrap) mapWrap.style.display = activeSheetTab === 'manejo' ? 'block' : 'none';
      };
      window._onPlanDateChangeForFooter = () => syncFooterButtons();
      window._switchSheetTab = (tab) => {
        activeSheetTab = tab;
        document.querySelectorAll('#dl-sheet-pills-carousel .dl-sheet-pill').forEach(pill => {
          const active = pill.dataset.tab === tab;
          pill.style.background = active ? '#2d3e2c' : '#ffffff';
          pill.style.borderColor = active ? '#2d3e2c' : '#d5e2d2';
          pill.style.color = active ? '#ffffff' : '#1e3e2b';
          if (active) {
            try { pill.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); } catch (_) {}
          }
        });
        const calWrap = document.getElementById('dl-calendar-wrap');
        const evoWrap = document.getElementById('dl-evolucion-wrap');
        const cosWrap = document.getElementById('dl-cosecha-wrap');
        const balWrap = document.getElementById('dl-balance-wrap');
        if (tab === 'timeline') {
          if (cosWrap) cosWrap.style.display = 'none';
          if (balWrap) balWrap.style.display = 'none';
          window.onSelectActividadEvolucion?.('gallery:all');
        } else if (tab === 'cosecha') {
          if (calWrap) calWrap.style.display = 'none';
          if (evoWrap) evoWrap.style.display = 'none';
          if (balWrap) balWrap.style.display = 'none';
          if (cosWrap) cosWrap.style.display = 'block';
          cosechaCtrl.loadAndRender();
        } else if (tab === 'balance') {
          if (calWrap) calWrap.style.display = 'none';
          if (evoWrap) evoWrap.style.display = 'none';
          if (cosWrap) cosWrap.style.display = 'none';
          if (balWrap) balWrap.style.display = 'block';
          loadLoteBalance();
        } else {
          if (cosWrap) cosWrap.style.display = 'none';
          if (balWrap) balWrap.style.display = 'none';
          window.onSelectActividadEvolucion?.('cal');
        }
        syncFooterButtons();
      };

      fixedFooter.innerHTML = `
        <button type="button" id="lote-footer-register-btn" style="width:100%; height:44px; border-radius:999px; border:none; background:#2d3e2c; color:#ffffff; font-family:'Work Sans',sans-serif; font-size:13.5px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:7px; cursor:pointer; padding:0 16px; white-space:nowrap; box-shadow:0 3px 10px rgba(45,62,44,0.22);">
          <span class="material-symbols-outlined" id="lote-footer-register-icon" style="font-size:19px;">add_circle</span>
          <span id="lote-footer-register-label">Registrar Actividad</span>
        </button>
        <div id="lote-footer-cosecha-row" style="display:none; width:100%; grid-template-columns:1fr 1.25fr; gap:10px;">
          <button type="button" id="lote-footer-cos-gastos" style="height:44px; border-radius:999px; border:1.5px solid #2d3e2c; background:#ffffff; color:#2d3e2c; font-family:'Work Sans',sans-serif; font-size:13.5px; font-weight:700; cursor:pointer; white-space:nowrap;">
            Enviar a Cuentas
          </button>
          <button type="button" id="lote-footer-cos-register" style="height:44px; border-radius:999px; border:none; background:#2d3e2c; color:#ffffff; font-family:'Work Sans',sans-serif; font-size:13.5px; font-weight:700; cursor:pointer; white-space:nowrap; box-shadow:0 3px 10px rgba(45,62,44,0.22);">
            + Registrar hoy
          </button>
        </div>
      `;
      fixedFooter.classList.add('open');

      document.getElementById('lote-footer-cos-gastos')?.addEventListener('click', (e) => {
        e.stopPropagation();
        cosechaCtrl.sendWeekToGastos();
      });
      document.getElementById('lote-footer-cos-register')?.addEventListener('click', (e) => {
        e.stopPropagation();
        setSheetExpanded(true);
        cosechaCtrl.openRegisterToday();
      });

      document.getElementById('lote-footer-register-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        setSheetExpanded(true);
        if (activeSheetTab === 'timeline') {
          window.abrirModalSubirFotoEvolucion?.('');
          setTimeout(() => {
            document.getElementById('dl-foto-evo-inline-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 120);
          return;
        }
        if (activeSheetTab === 'balance') {
          openNewGastoForLoteModal();
          return;
        }
        const d = new Date();
        const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        window.showInlineActividadForm?.(window._planSelectedDateStr || todayStr);
      });
    }

    // Cargar el detalle completo del lote dentro del mismo bottom sheet (una sola vista en móvil)
    sheet.dataset.activeLoteId = String(lote.id);
    const loadSheetDetail = async (targetLoteId = lote.id) => {
      try {
        const detailHtml = await renderDetalleLote(targetLoteId, { embeddedInSheet: true });
        if (sheet.dataset.activeLoteId !== String(targetLoteId)) return;
        const host = document.getElementById('lote-sheet-full-detail');
        if (host) {
          host.innerHTML = detailHtml;
          await initDetalleLote(targetLoteId);
          if (initialTab && typeof window._switchSheetTab === 'function') {
            window._switchSheetTab(initialTab);
          }
        }
      } catch (err) {
        console.warn('[dashboard] Error cargando detalle embebido en sheet:', err);
      }
    };
    window._reloadLoteSheetDetail = (lid) => loadSheetDetail(lid || lote.id);
    loadSheetDetail(lote.id);

    // Gestos táctiles nativos para deslizar arriba (pantalla completa) o abajo (contraer / cerrar)
    let touchStartY = 0;
    let touchStartX = 0;
    let touchCurrentY = 0;
    let isTrackingTouch = false;

    sheet.ontouchstart = (e) => {
      if (e.touches.length !== 1) return;
      const target = e.target;
      if (target.closest('button') || target.closest('a') || target.closest('input')) {
        isTrackingTouch = false;
        return;
      }
      touchStartY = e.touches[0].clientY;
      touchStartX = e.touches[0].clientX;
      touchCurrentY = touchStartY;
      isTrackingTouch = true;
    };

    sheet.ontouchmove = (e) => {
      if (!isTrackingTouch || e.touches.length !== 1) return;
      touchCurrentY = e.touches[0].clientY;
    };

    sheet.ontouchend = (e) => {
      if (!isTrackingTouch) return;
      isTrackingTouch = false;

      const deltaY = touchCurrentY - touchStartY;
      const deltaX = Math.abs((e.changedTouches[0]?.clientX || touchStartX) - touchStartX);

      // Solo procesar si el movimiento es vertical predominante
      if (Math.abs(deltaY) < 30 || Math.abs(deltaY) < deltaX * 1.2) {
        return;
      }

      // Swipe hacia ARRIBA (deltaY negativo) -> Abrir pantalla completa
      if (deltaY < -35) {
        setSheetExpanded(true);
      }
      // Swipe hacia ABAJO (deltaY positivo)
      else if (deltaY > 40) {
        if (sheet.classList.contains('expanded')) {
          // Si está scrolleado hacia abajo dentro del contenido, permitir scroll interno
          if (sheet.scrollTop > 15) return;
          setSheetExpanded(false);
        } else {
          // En modo peek, swipe down cierra el bottom sheet
          clearLoteSelection();
        }
      }
    };
  }

  let lastLoteSelectTime = 0;

  function selectLote(id, initialTab = null) {
    lastLoteSelectTime = Date.now();
    selectedLoteId = id;
    
    // Resaltar el lote seleccionado y mantener todos los demás visibles y clickeables
    Object.values(polyByLote).forEach(({ poly, labelMarker, lote }) => {
      const { color } = parseCoordenadasJson(lote.coordenadas_json || lote.coordenadas);
      const loteColor = color || '#2d3e2c';
      const selected = String(lote.id) === String(id);
      if (selected) {
        poly.setStyle({ fillOpacity: 0.65, weight: 4.5, color: '#ffffff', fillColor: loteColor });
        poly.bringToFront();
        if (labelMarker) labelMarker.setZIndexOffset(1000);
      } else {
        poly.setStyle({ fillOpacity: 0.35, weight: 2.5, color: '#ffffff', fillColor: loteColor });
        if (labelMarker) labelMarker.setZIndexOffset(100);
      }
    });

    const sel = polyByLote[id];
    if (sel) {
      map.flyToBounds(sel.poly.getBounds(), {
        paddingBottomRight: [0, 260],
        maxZoom: 18,
        animate: true,
        duration: 0.6
      });
      showLoteBottomSheet(sel.lote, appsByLote[id] || [], initialTab);
      return;
    }

    const fallbackLote = (lotes || []).find(l => String(l.id) === String(id));
    if (fallbackLote) {
      showLoteBottomSheet(fallbackLote, appsByLote[fallbackLote.id] || [], initialTab);
    }
  }

  function clearLoteSelection() {
    selectedLoteId = null;
    const sheet = document.getElementById('lote-bottom-sheet');
    const scrim = document.getElementById('lote-sheet-scrim');
    const fixedFooter = document.getElementById('lote-sheet-fixed-footer');
    if (sheet) sheet.classList.remove('open', 'expanded');
    if (scrim) scrim.classList.remove('open', 'expanded');
    if (fixedFooter) fixedFooter.classList.remove('open');
    if (activeLotePopup) {
      map.closePopup(activeLotePopup);
      activeLotePopup = null;
    }
    Object.values(polyByLote).forEach(({ poly, labelMarker, lote }) => {
      const { color } = parseCoordenadasJson(lote.coordenadas_json || lote.coordenadas);
      const loteColor = color || '#2d3e2c';
      poly.setStyle({ fillOpacity: 0.35, weight: 3, opacity: 1, color: '#ffffff', fillColor: loteColor });
    });
  }

  map.on('popupclose', () => {
    // Solo en escritorio cerramos al cerrar el popup nativo de Leaflet
    if (window.innerWidth > 768 && selectedLoteId) {
      clearLoteSelection();
    }
  });

  // Draw Lot Polygons
  withCoords.forEach(lote => {
    const { coordinates, color } = parseCoordenadasJson(lote.coordenadas_json || lote.coordenadas);
    if (!coordinates || coordinates.length < 3) return;
    const latlngs = coordinates.map(c => [c.lat, c.lng]);
    const loteColor = color || '#2d3e2c';

    const poly = L.polygon(latlngs, {
      color: '#ffffff',
      fillColor: loteColor,
      fillOpacity: 0.35,
      weight: 3,
      opacity: 1,
      lineJoin: 'round',
      lineCap: 'round',
      bubblingMouseEvents: false
    }).addTo(map);

    allBounds.push(poly.getBounds());

    const c = poly.getBounds().getCenter();
    const labelMarker = L.marker([c.lat, c.lng], {
      icon: L.divIcon({
        className: 'lote-label-wrap',
        html: `<div class="lote-label" style="background:${escapeHtml(loteColor)};">
          <span>${escapeHtml(formatLoteNombre(lote.nombre || 'Lote'))}</span>
        </div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0]
      }),
      interactive: true,
      bubblingMouseEvents: false
    }).addTo(map);

    polyByLote[lote.id] = { poly, labelMarker, lote };

    poly.on('mouseover', () => {
      if (selectedLoteId !== lote.id) {
        poly.setStyle({ weight: 4.5, fillOpacity: 0.48 });
      }
    });

    poly.on('mouseout', () => {
      if (selectedLoteId !== lote.id) {
        poly.setStyle({ weight: 3, fillOpacity: 0.35 });
      }
    });

    const onLoteClick = (e) => {
      if (e && e.originalEvent) {
        L.DomEvent.stopPropagation(e.originalEvent);
      }
      if (e) L.DomEvent.stopPropagation(e);
      selectLote(lote.id);
    };

    poly.on('click', onLoteClick);
    labelMarker.on('click', onLoteClick);
  });

  map.on('click', () => {
    // Evitar que el clic táctil en móvil cierre la selección inmediatamente
    if (Date.now() - lastLoteSelectTime < 450) return;
    clearLoteSelection();
  });

  const adjustMapView = () => {
    if (allBounds.length > 0) {
      const group = L.featureGroup(allBounds.map(b => L.rectangle(b)));
      const isMobile = window.innerWidth <= 768;
      if (isMobile) {
        // En móvil ajuste más holgado
        map.fitBounds(group.getBounds(), { padding: [30, 30], animate: false });
        const currentZoom = map.getZoom();
        map.setView(group.getBounds().getCenter(), Math.min(currentZoom + 0.15, 19), { animate: false });
      } else {
        map.fitBounds(group.getBounds().pad(0.12), { animate: false });
      }
    }
  };

  fitMapToScreen();
  map.invalidateSize({ animate: false, pan: false });
  adjustMapView();
  setTimeout(() => {
    fitMapToScreen();
    map.invalidateSize({ animate: false, pan: false });
    adjustMapView();
  }, 120);
  window.__openLoteInDashboard = (loteId, tab = null) => {
    if (!document.getElementById('lote-bottom-sheet')?.isConnected) return false;
    selectLote(loteId, tab);
    return true;
  };

  setTimeout(() => {
    fitMapToScreen();
    map.invalidateSize({ animate: false, pan: false });
    if (window._pendingOpenLote?.loteId) {
      const target = window._pendingOpenLote;
      window._pendingOpenLote = null;
      selectLote(target.loteId, target.tab || null);
    }
  }, 450);

  // Material 3 Full-Screen Search on Cafetal / Lotes
  initM3FullScreenSearch({
    moduleKey: 'lotes',
    toggleId: 'lotes-search-toggle',
    inputId: 'lotes-search-input',
    clearId: 'lotes-search-clear',
    placeholder: 'Buscar lote...',
    ariaLabel: 'Búsqueda de lotes de cafetal',
    suggestedTitle: 'Lotes sugeridos',
    emptyLabel: 'lotes',
    getQuery: () => currentLotesSearchQuery,
    setQuery: (v) => { currentLotesSearchQuery = (v || '').trim(); },
    onApplySearch: (v) => {
      const q = (v || '').trim().toLowerCase();
      if (!q) {
        clearLoteSelection();
        return;
      }
      const match = lotes.find(l => (l.nombre || '').toLowerCase().includes(q) || (l.variedad || '').toLowerCase().includes(q));
      if (match && polyByLote[match.id]) {
        selectLote(match.id);
      }
    },
    loadItems: async () => lotes || [],
    getQuickChips: (items) => {
      const variedades = Array.from(new Set(items.map(l => (l.variedad || '').trim()).filter(Boolean))).slice(0, 5);
      return variedades.map(v => ({ label: v, type: 'query', value: v, icon: 'eco' }));
    },
    filterItems: (items, qLower) => items.filter(l =>
      (l.nombre || '').toLowerCase().includes(qLower) ||
      (l.variedad || '').toLowerCase().includes(qLower) ||
      (l.estado || '').toLowerCase().includes(qLower)
    ),
    renderItem: (l) => `
      <div class="ganado-row" data-lote-id="${l.id}" onclick="window.navigateTo('detalle_lote', '${l.id}')">
        <div class="ganado-row-img-container" style="background: var(--surface-container-high); display: flex; align-items: center; justify-content: center;">
          <span class="material-icons" style="font-size:26px;color:#2d3e2c;">eco</span>
        </div>
        <div class="ganado-row-content">
          <div class="ganado-col-group" style="flex:1;min-width:0;">
            <p class="ganado-col-label">${escapeSearchHtml((l.variedad || 'CAFÉ').toUpperCase())}</p>
            <p class="ganado-col-value">${escapeSearchHtml(formatLoteNombre(l.nombre || 'Sin nombre'))}</p>
            <p class="ganado-col-label" style="margin-top:4px;">${Number(l.numero_plantas || 0).toLocaleString('es-HN')} plantas</p>
          </div>
          <div class="ganado-col-group" style="text-align:right;margin-left:auto;align-items:flex-end;">
            <p class="ganado-col-value" style="font-weight:800;color:#2d3e2c;">${(parseFloat(l.area_ha) || 0).toFixed(2)} ha</p>
          </div>
        </div>
      </div>
    `,
    itemSelector: '.ganado-row[data-lote-id]',
    getItemTitle: (el) => el.querySelector('.ganado-col-value')?.textContent?.trim() || ''
  });

  setTimeout(() => map.invalidateSize(), 300);
}

window.toggleActionMenu = (btn) => {
  const menu = btn.nextElementSibling;
  if (!menu) return;
  const isActive = menu.classList.contains('active');
  const isMobile = window.innerWidth <= 1024 || window.matchMedia?.('(pointer: coarse)')?.matches;
  document.querySelectorAll('.action-menu.active').forEach(m => m.classList.remove('active'));
  if (isMobile && window.openMobileMenuBottomSheet) {
    window.openMobileMenuBottomSheet(menu);
    return;
  }
  if (!isActive) menu.classList.add('active');
};

window.confirmDeleteLote = (id, name) => {
  window.Snackbar.confirm(`¿Eliminar el lote "${name}"?`, async () => {
    const { error } = await supabase.from('lotes').delete().eq('id', id);
    if (error) window.Snackbar.show('Error: ' + error.message, { type: 'error' });
    else { window.Snackbar.show('Lote eliminado'); window.clearScreenCache?.('dashboard'); window.navigateTo('dashboard'); }
  });
};

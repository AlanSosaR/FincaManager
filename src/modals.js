import { supabase } from './supabase.js';

export function closeModal() {
  const mc = document.getElementById('modal-container');
  if (mc) mc.classList.remove('active');
}

export function showNamePrompt(title, defaultValue, onSave) {
  showModal(title, `
    <input type="text" id="name-prompt-input" value="${(defaultValue || '').replace(/"/g, '&quot;')}" placeholder="Nombre del marcador" style="width:100%;padding:12px 14px;border-radius:10px;border:1px solid var(--m3-outline-variant);background:var(--m3-surface-container-low);font-family:'Work Sans',sans-serif;font-size:14px;color:var(--m3-on-surface);margin-bottom:16px;box-sizing:border-box;" autofocus>
    <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;">
      <button type="button" class="btn-outline" id="cancel-modal">Cancelar</button>
      <button type="button" class="btn-primary" id="confirm-name-prompt">Guardar</button>
    </div>
  `);
  const input = document.getElementById('name-prompt-input');
  if (input) {
    input.focus();
    input.select();
    const confirmBtn = document.getElementById('confirm-name-prompt');
    if (confirmBtn) confirmBtn.addEventListener('click', () => {
      const val = (input.value || '').trim();
      if (!val) { input.focus(); return; }
      closeModal();
      if (onSave) onSave(val);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirmBtn && confirmBtn.click();
    });
  }
}

export function showModal(titleOrType, contentHTMLOrOnSave) {
  const modalContainer = document.getElementById('modal-container');
  const modalBody = document.getElementById('modal-body');
  if (!modalContainer || !modalBody) return;
  let content = '';
  
  // Backwards compatibility for the old 'type' usage
  if (titleOrType === 'motor' || titleOrType === 'ganado') {
    const type = titleOrType;
    const onSave = contentHTMLOrOnSave;
    content = `
      <div class="modal-header">
        <h3>Añadir Nuevo ${type === 'motor' ? 'Motor' : 'Animal'}</h3>
        <button class="btn-close" id="close-modal"><span class="material-icons">close</span></button>
      </div>
      <form id="form-add-${type}">
        <div class="form-group">
          <label>Nombre</label>
          <input type="text" name="nombre" required>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-outline" id="cancel-modal">Cancelar</button>
          <button type="submit" class="btn-primary">Guardar</button>
        </div>
      </form>
    `;
    
    modalBody.innerHTML = content;
    const form = modalBody.querySelector('form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());
      const { error } = await supabase.from(type === 'motor' ? 'motores' : 'ganado').insert([data]);
      if (error) {
        window.Snackbar.show('Error al guardar: ' + error.message, { type: 'error' });
      } else {
        closeModal();
        if (onSave) onSave();
      }
    });
  } else {
    // New usage: showModal(title, html)
    const title = titleOrType;
    const html = contentHTMLOrOnSave;
    content = `
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="btn-close" id="close-modal"><span class="material-icons">close</span></button>
      </div>
      <div class="modal-content-body">
        ${html}
      </div>
    `;
    modalBody.innerHTML = content;
  }

  modalContainer.classList.add('active');

  // Close logic
  const closeBtn = document.getElementById('close-modal');
  const cancelBtn = document.getElementById('cancel-modal');
  
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  
  modalContainer.onclick = (e) => {
    if (e.target === modalContainer) closeModal();
  };
}

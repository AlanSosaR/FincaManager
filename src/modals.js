import { supabase } from './supabase.js';

const modalContainer = document.getElementById('modal-container');
const modalBody = document.getElementById('modal-body');

export function showModal(type, onSave) {
  let content = '';
  
  if (type === 'motor') {
    content = `
      <div class="modal-header">
        <h3>Añadir Nuevo Motor</h3>
        <button class="btn-close" id="close-modal"><span class="material-icons">close</span></button>
      </div>
      <form id="form-add-motor">
        <div class="form-group">
          <label>Nombre del Equipo</label>
          <input type="text" name="nombre" placeholder="Ej: Tractor John Deere" required>
        </div>
        <div class="form-group">
          <label>Número de Serie (SN)</label>
          <input type="text" name="sn" placeholder="Ej: 123-ABC">
        </div>
        <div class="form-group">
          <label>Horas Iniciales</label>
          <input type="number" name="horas" value="0">
        </div>
        <div class="form-group">
          <label>Límite para Mantenimiento (Horas)</label>
          <input type="number" name="max_horas" value="100">
        </div>
        <div class="form-group">
          <label>Icono (Emoji)</label>
          <input type="text" name="icon" value="🚜">
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-outline" id="cancel-modal">Cancelar</button>
          <button type="submit" class="btn-primary">Guardar Motor</button>
        </div>
      </form>
    `;
  }

  modalBody.innerHTML = content;
  modalContainer.classList.add('active');

  // Close logic
  const closeBtn = document.getElementById('close-modal');
  const cancelBtn = document.getElementById('cancel-modal');
  const closeModal = () => modalContainer.classList.remove('active');

  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  modalContainer.addEventListener('click', (e) => {
    if (e.target === modalContainer) closeModal();
  });

  // Form handle
  const form = modalBody.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    // Convert numbers
    if (data.horas) data.horas = parseInt(data.horas);
    if (data.max_horas) data.max_horas = parseInt(data.max_horas);
    if (data.peso_actual) data.peso_actual = parseFloat(data.peso_actual);

    const table = type === 'motor' ? 'motores' : 'ganado';
    
    const { error } = await supabase.from(table).insert([data]);
    
    if (error) {
      window.Snackbar.show('Error al guardar: ' + error.message, { type: 'error' });
    } else {
      closeModal();
      if (onSave) onSave();
    }
  });
}

/* Material 3 Custom Pickers Logic */

export const m3Pickers = {
  /**
   * Show a custom M3 Date Picker
   * @param {string} initialValue - Date in YYYY-MM-DD format
   * @param {function} onSelect - Callback with (dateString)
   */
  showDatePicker(initialValue, onSelect) {
    const today = new Date();
    let selectedDate = initialValue ? new Date(initialValue + 'T12:00:00') : today;
    let viewingDate = new Date(selectedDate);
    
    const overlay = document.createElement('div');
    overlay.className = 'm3-picker-overlay';
    
    const render = () => {
      const year = viewingDate.getFullYear();
      const month = viewingDate.getMonth();
      const monthName = new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(viewingDate);
      
      const firstDay = new Date(year, month, 1).getDay(); // 0 (Sun) to 6 (Sat)
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const daysInPrevMonth = new Date(year, month, 0).getDate();
      
      overlay.innerHTML = `
        <div class="m3-picker-card">
          <div class="m3-calendar-header">
            <div class="m3-calendar-month-year">${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${year}</div>
            <div class="m3-calendar-nav">
              <button id="m3-prev-month"><span class="material-icons">chevron_left</span></button>
              <button id="m3-next-month"><span class="material-icons">chevron_right</span></button>
            </div>
          </div>
          <div class="m3-calendar-grid">
            <div class="m3-day-label">D</div>
            <div class="m3-day-label">L</div>
            <div class="m3-day-label">M</div>
            <div class="m3-day-label">X</div>
            <div class="m3-day-label">J</div>
            <div class="m3-day-label">V</div>
            <div class="m3-day-label">S</div>
            ${generateDays(year, month, firstDay, daysInMonth, daysInPrevMonth)}
          </div>
          <div class="m3-picker-footer">
            <button id="m3-date-cancel">CANCELAR</button>
            <button id="m3-date-ok">OK</button>
          </div>
        </div>
      `;
      
      // Event Listeners
      overlay.querySelector('#m3-prev-month').onclick = () => {
        viewingDate.setMonth(viewingDate.getMonth() - 1);
        render();
      };
      overlay.querySelector('#m3-next-month').onclick = () => {
        viewingDate.setMonth(viewingDate.getMonth() + 1);
        render();
      };
      overlay.querySelectorAll('.m3-day-cell').forEach(cell => {
        cell.onclick = () => {
          if (cell.dataset.date) {
            selectedDate = new Date(cell.dataset.date + 'T12:00:00');
            render();
          }
        };
      });
      overlay.querySelector('#m3-date-cancel').onclick = () => overlay.remove();
      overlay.querySelector('#m3-date-ok').onclick = () => {
        const y = selectedDate.getFullYear();
        const m = (selectedDate.getMonth() + 1).toString().padStart(2, '0');
        const d = selectedDate.getDate().toString().padStart(2, '0');
        onSelect(`${y}-${m}-${d}`);
        overlay.remove();
      };
    };

    function generateDays(y, m, firstDay, daysInMonth, daysInPrevMonth) {
      let html = '';
      // Prev month tail
      for (let i = firstDay - 1; i >= 0; i--) {
        html += `<div class="m3-day-cell other-month">${daysInPrevMonth - i}</div>`;
      }
      // Current month
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${y}-${(m+1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
        const isSelected = selectedDate.toDateString() === new Date(dateStr + 'T12:00:00').toDateString();
        const isToday = today.toDateString() === new Date(dateStr + 'T12:00:00').toDateString();
        html += `
          <div class="m3-day-cell ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}" data-date="${dateStr}">
            ${d}
          </div>
        `;
      }
      return html;
    }

    render();
    document.body.appendChild(overlay);
  },

  /**
   * Show a custom M3 Time Picker
   * @param {string} initialValue - Time in HH:MM (24h) format
   * @param {function} onSelect - Callback with (timeString)
   */
  showTimePicker(initialValue, onSelect) {
    let h12, m, isPM;
    if (initialValue && initialValue.includes(' ')) {
      const [timePart, suffix] = initialValue.split(' ');
      const [parsedH, parsedM] = timePart.split(':').map(Number);
      h12 = parsedH;
      m = parsedM;
      isPM = suffix.toUpperCase() === 'PM';
    } else {
      let [h, parsedM] = initialValue ? initialValue.split(':').map(Number) : [12, 0];
      h12 = h % 12 || 12;
      m = parsedM;
      isPM = h >= 12;
    }
    
    const overlay = document.createElement('div');
    overlay.className = 'm3-picker-overlay';
    
    const render = () => {
      overlay.innerHTML = `
        <div class="m3-picker-card" style="padding: 24px;">
          <div class="m3-time-picker-body" style="padding: 0;">
            <span class="m3-time-picker-title">SELECCIONAR HORA</span>
            <div class="m3-time-display">
              <div class="m3-time-col">
                <button class="m3-arrow-btn" id="m3-h-up"><span class="material-icons">arrow_drop_up</span></button>
                <div class="m3-time-box active" id="m3-hour-box">${h12.toString().padStart(2, '0')}</div>
                <button class="m3-arrow-btn" id="m3-h-down"><span class="material-icons">arrow_drop_down</span></button>
              </div>
              
              <span class="m3-time-separator">:</span>
              
              <div class="m3-time-col">
                <button class="m3-arrow-btn" id="m3-m-up"><span class="material-icons">arrow_drop_up</span></button>
                <div class="m3-time-box" id="m3-min-box">${m.toString().padStart(2, '0')}</div>
                <button class="m3-arrow-btn" id="m3-m-down"><span class="material-icons">arrow_drop_down</span></button>
              </div>
            </div>
            
            <div class="m3-ampm-row">
              <button class="m3-ampm-btn ${!isPM ? 'active' : ''}" id="m3-set-am">AM</button>
              <button class="m3-ampm-btn ${isPM ? 'active' : ''}" id="m3-set-pm">PM</button>
            </div>
          </div>
          <div class="m3-picker-footer" style="padding: 16px 0 0 0;">
            <button id="m3-time-cancel">Cancelar</button>
            <button id="m3-time-ok">OK</button>
          </div>
        </div>
      `;
      
      const hrBox = overlay.querySelector('#m3-hour-box');
      const minBox = overlay.querySelector('#m3-min-box');
      const amBtn = overlay.querySelector('#m3-set-am');
      const pmBtn = overlay.querySelector('#m3-set-pm');

      const updateUI = () => {
        hrBox.textContent = h12.toString().padStart(2, '0');
        minBox.textContent = m.toString().padStart(2, '0');
        amBtn.className = `m3-ampm-btn ${!isPM ? 'active' : ''}`;
        pmBtn.className = `m3-ampm-btn ${isPM ? 'active' : ''}`;
      };
      
      // Arrow logic
      overlay.querySelector('#m3-h-up').onclick = () => { h12 = (h12 % 12) + 1; updateUI(); };
      overlay.querySelector('#m3-h-down').onclick = () => { h12 = h12 - 1 || 12; updateUI(); };
      overlay.querySelector('#m3-m-up').onclick = () => { m = (m + 1) % 60; updateUI(); };
      overlay.querySelector('#m3-m-down').onclick = () => { m = m - 1 < 0 ? 59 : m - 1; updateUI(); };

      overlay.querySelector('#m3-set-am').onclick = () => { isPM = false; updateUI(); };
      overlay.querySelector('#m3-set-pm').onclick = () => { isPM = true; updateUI(); };
      
      overlay.querySelector('#m3-time-cancel').onclick = () => overlay.remove();
      overlay.querySelector('#m3-time-ok').onclick = () => {
        let displayH = h12.toString().padStart(2, '0');
        let displayM = m.toString().padStart(2, '0');
        let suffix = isPM ? 'PM' : 'AM';
        onSelect(`${displayH}:${displayM} ${suffix}`);
        overlay.remove();
      };
    };

    render();
    document.body.appendChild(overlay);
  }
};

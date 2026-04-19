/* ================================================================
   PLATAFORMA AGENDA — calendar.js v3.1 (fix recursión)
   
   Calendario visual + grid de slots.
   Se integra con API.getDisponibilidad() y dispara eventos.
   ================================================================ */

// ════════════════════════════════════════════════════════════════
// ESTADO GLOBAL DEL CALENDARIO
// ════════════════════════════════════════════════════════════════

const CalendarState = {
  fechaSeleccionada: null,
  mesActual: new Date(),
  servicioSeleccionado: null,
  disponibilidad: {},
  empleadoSeleccionado: null,
  slotSeleccionado: null
};

// ════════════════════════════════════════════════════════════════
// INYECTAR ESTILOS
// ════════════════════════════════════════════════════════════════

(function inyectarCalendarStyles() {
  const css = `
    .cal-wrap {
      font-family: inherit;
      user-select: none;
      background: var(--card, #131829);
      border-radius: var(--r-lg, 12px);
      padding: 16px;
    }
    .cal-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .cal-title {
      font-size: 16px;
      font-weight: 700;
      color: var(--text, #F1F5F9);
      text-transform: capitalize;
    }
    .cal-btn {
      background: var(--bg-input, #0F1424);
      border: 1px solid var(--border, #1E293B);
      width: 36px;
      height: 36px;
      border-radius: 10px;
      cursor: pointer;
      color: var(--text, #fff);
      font-size: 18px;
      font-weight: 700;
      transition: all 0.2s;
    }
    .cal-btn:hover {
      background: var(--gold, #C9A84C);
      color: #000;
      border-color: var(--gold, #C9A84C);
    }
    .cal-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 6px;
    }
    .cal-day-name {
      text-align: center;
      font-size: 11px;
      font-weight: 600;
      color: var(--muted, #94A3B8);
      padding: 8px 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .cal-day {
      aspect-ratio: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      color: var(--text, #fff);
      background: var(--bg-input, #0F1424);
      border: 1px solid var(--border, #1E293B);
    }
    .cal-day:hover:not(.cal-day--disabled):not(.cal-day--empty) {
      background: rgba(201, 168, 76, 0.2);
      border-color: var(--gold, #C9A84C);
      transform: scale(1.02);
    }
    .cal-day--today {
      background: rgba(201, 168, 76, 0.15);
      border-color: var(--gold, #C9A84C);
      color: var(--gold, #C9A84C);
      font-weight: 700;
    }
    .cal-day--selected {
      background: var(--gold, #C9A84C);
      color: #000;
      font-weight: 700;
      border-color: var(--gold, #C9A84C);
      transform: scale(0.98);
    }
    .cal-day--disabled {
      opacity: 0.3;
      cursor: not-allowed;
      text-decoration: line-through;
      background: var(--border, #1E293B);
    }
    .cal-day--empty {
      cursor: default;
      background: transparent;
      border-color: transparent;
    }
    
    .slots-wrapper {
      display: flex;
      flex-direction: column;
      gap: 20px;
      max-height: 500px;
      overflow-y: auto;
      padding: 4px;
    }
    .slots-barbero {
      background: var(--card, #131829);
      border: 1px solid var(--border, #1E293B);
      border-radius: 14px;
      overflow: hidden;
      transition: all 0.2s;
    }
    .slots-barbero:hover {
      border-color: var(--gold, #C9A84C);
    }
    .slots-barbero-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      background: var(--bg-input, #0F1424);
      border-bottom: 2px solid;
      cursor: pointer;
    }
    .slots-barbero-avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      font-weight: 700;
      color: #fff;
    }
    .slots-barbero-nombre {
      font-weight: 700;
      font-size: 16px;
      color: var(--text, #fff);
    }
    .slots-barbero-skills {
      font-size: 11px;
      color: var(--muted, #94A3B8);
      margin-top: 2px;
    }
    .slots-horas {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 16px;
    }
    .slot-btn {
      background: var(--bg-input, #0F1424);
      border: 1px solid var(--border, #1E293B);
      border-radius: 10px;
      padding: 8px 14px;
      font-size: 13px;
      font-weight: 600;
      color: var(--text, #fff);
      cursor: pointer;
      transition: all 0.2s;
      font-family: monospace;
    }
    .slot-btn:hover {
      background: var(--gold, #C9A84C);
      color: #000;
      border-color: var(--gold, #C9A84C);
      transform: translateY(-2px);
    }
    .slot-btn--selected {
      background: var(--gold, #C9A84C);
      color: #000;
      border-color: var(--gold, #C9A84C);
      box-shadow: 0 0 0 2px rgba(201, 168, 76, 0.3);
    }
    .slots-sin-horas {
      padding: 16px;
      text-align: center;
      color: var(--muted, #94A3B8);
      font-size: 13px;
    }
    .slots-vacio {
      text-align: center;
      padding: 40px;
      color: var(--muted, #94A3B8);
      background: var(--card, #131829);
      border-radius: 14px;
      border: 1px solid var(--border, #1E293B);
    }
    
    .slots-wrapper::-webkit-scrollbar {
      width: 6px;
    }
    .slots-wrapper::-webkit-scrollbar-track {
      background: var(--bg-input, #0F1424);
      border-radius: 10px;
    }
    .slots-wrapper::-webkit-scrollbar-thumb {
      background: var(--gold, #C9A84C);
      border-radius: 10px;
    }
  `;
  
  if (!document.querySelector('#calendar-styles')) {
    const style = document.createElement('style');
    style.id = 'calendar-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }
})();

// ════════════════════════════════════════════════════════════════
// CALENDARIO PRINCIPAL
// ════════════════════════════════════════════════════════════════

const Calendar = {
  containerId: null,
  onDateSelect: null,
  
  init(containerId, onDateSelect) {
    this.containerId = containerId;
    this.onDateSelect = onDateSelect;
    CalendarState.mesActual = new Date();
    CalendarState.mesActual.setDate(1);
    this.render();
  },
  
  reset() {
    CalendarState.fechaSeleccionada = null;
    this.render();
  },
  
  setFecha(fechaStr) {
    CalendarState.fechaSeleccionada = fechaStr;
    this.render();
  },
  
  render() {
    const cont = document.getElementById(this.containerId);
    if (!cont) return;
    
    const year = CalendarState.mesActual.getFullYear();
    const month = CalendarState.mesActual.getMonth();
    const monthName = CalendarState.mesActual.toLocaleDateString('es-CL', { 
      month: 'long', 
      year: 'numeric' 
    });
    
    const primerDia = new Date(year, month, 1).getDay();
    const ultimoDia = new Date(year, month + 1, 0).getDate();
    
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    const diasOp = (window.TENANT && window.TENANT.diasOperacion) || [1, 2, 3, 4, 5, 6];
    
    let html = '<div class="cal-wrap">';
    html += '<div class="cal-head">';
    html += '<button class="cal-btn" data-action="prev">‹</button>';
    html += `<div class="cal-title">${monthName}</div>`;
    html += '<button class="cal-btn" data-action="next">›</button>';
    html += '</div><div class="cal-grid">';
    
    const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    diasSemana.forEach(d => {
      html += `<div class="cal-day-name">${d}</div>`;
    });
    
    for (let i = 0; i < primerDia; i++) {
      html += '<div class="cal-day cal-day--empty"></div>';
    }
    
    for (let d = 1; d <= ultimoDia; d++) {
      const fecha = new Date(year, month, d);
      const fechaStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const diaSemana = fecha.getDay();
      
      const esPasado = fecha < hoy;
      const noOpera = !diasOp.includes(diaSemana);
      const disabled = esPasado || noOpera;
      const esHoy = fecha.getTime() === hoy.getTime();
      const esSelected = CalendarState.fechaSeleccionada === fechaStr;
      
      let cls = 'cal-day';
      if (disabled) cls += ' cal-day--disabled';
      if (esHoy) cls += ' cal-day--today';
      if (esSelected) cls += ' cal-day--selected';
      
      html += `<div class="${cls}" data-fecha="${fechaStr}">${d}</div>`;
    }
    
    html += '</div></div>';
    cont.innerHTML = html;
    
    // Event handlers
    cont.querySelectorAll('[data-action="prev"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        CalendarState.mesActual.setMonth(CalendarState.mesActual.getMonth() - 1);
        this.render();
      });
    });
    cont.querySelectorAll('[data-action="next"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        CalendarState.mesActual.setMonth(CalendarState.mesActual.getMonth() + 1);
        this.render();
      });
    });
    
    cont.querySelectorAll('.cal-day:not(.cal-day--disabled):not(.cal-day--empty)').forEach(day => {
      day.addEventListener('click', () => {
        const fecha = day.dataset.fecha;
        CalendarState.fechaSeleccionada = fecha;
        this.render();
        if (this.onDateSelect) this.onDateSelect(fecha);
        document.dispatchEvent(new CustomEvent('fechaSeleccionada', { 
          detail: { fecha } 
        }));
      });
    });
  }
};

// ════════════════════════════════════════════════════════════════
// RENDER DE SLOTS (CORREGIDO - SIN RECURSIÓN)
// ════════════════════════════════════════════════════════════════

function renderSlotsView(containerId, disponibilidad, onSlotSelect) {
  const cont = document.getElementById(containerId);
  if (!cont) return;
  
  if (!disponibilidad || !disponibilidad.empleados || Object.keys(disponibilidad.empleados).length === 0) {
    cont.innerHTML = '<p class="slots-vacio">Selecciona un servicio y fecha para ver disponibilidad.</p>';
    return;
  }
  
  const profesionales = Object.values(disponibilidad.empleados).filter(emp => emp.hayDisponibilidad);
  
  if (profesionales.length === 0) {
    cont.innerHTML = '<p class="slots-vacio">No hay disponibilidad para esta fecha. Prueba con otro día.</p>';
    return;
  }
  
  const profLabel = (window.TENANT && window.TENANT.profesionalLabel) || 'profesional';
  const profLabelCap = profLabel.charAt(0).toUpperCase() + profLabel.slice(1);
  
  let html = '<div class="slots-wrapper">';
  
  profesionales.forEach(emp => {
    const libres = emp.slots.filter(s => s.disponible);
    const color = emp.empleado.color || '#C9A84C';
    
    html += `
      <div class="slots-barbero" data-empleado-id="${emp.empleado.id}">
        <div class="slots-barbero-header" style="border-bottom-color: ${color}">
          <div class="slots-barbero-avatar" style="background: ${color}">
            ${emp.empleado.nombre.charAt(0).toUpperCase()}
          </div>
          <div>
            <div class="slots-barbero-nombre">${escapeHtml(emp.empleado.nombre)}</div>
            <div class="slots-barbero-skills">${emp.empleado.skills ? emp.empleado.skills.join(', ') : profLabelCap}</div>
          </div>
        </div>
        <div class="slots-horas">
    `;
    
    if (libres.length === 0) {
      html += '<p class="slots-sin-horas">Sin horarios disponibles este día</p>';
    } else {
      libres.forEach(slot => {
        const isSelected = CalendarState.empleadoSeleccionado === emp.empleado.id && 
                          CalendarState.slotSeleccionado === slot.horaInicio;
        const selectedClass = isSelected ? 'slot-btn--selected' : '';
        
        html += `
          <button class="slot-btn ${selectedClass}" 
                  data-empleado-id="${emp.empleado.id}"
                  data-empleado-nombre="${escapeHtml(emp.empleado.nombre)}"
                  data-hora-inicio="${slot.horaInicio}"
                  data-hora-fin="${slot.horaFin}">
            ${slot.horaInicio}
          </button>
        `;
      });
    }
    
    html += '</div></div>';
  });
  
  html += '</div>';
  cont.innerHTML = html;
  
  // Bind de eventos a los botones de slot
  cont.querySelectorAll('.slot-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      
      const empleadoID = btn.dataset.empleadoId;
      const empleadoNombre = btn.dataset.empleadoNombre;
      const horaInicio = btn.dataset.horaInicio;
      const horaFin = btn.dataset.horaFin;
      
      document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('slot-btn--selected'));
      btn.classList.add('slot-btn--selected');
      
      CalendarState.empleadoSeleccionado = empleadoID;
      CalendarState.slotSeleccionado = horaInicio;
      
      document.dispatchEvent(new CustomEvent('slotSeleccionado', {
        detail: { empleadoID, empleadoNombre, horaInicio, horaFin }
      }));
      
      if (onSlotSelect) {
        onSlotSelect({ empleadoID, empleadoNombre, horaInicio, horaFin });
      }
    });
  });
}

// ════════════════════════════════════════════════════════════════
// CARGA DE DISPONIBILIDAD DESDE SUPABASE
// ════════════════════════════════════════════════════════════════

async function cargarDisponibilidad(fecha, servicioID) {
  if (!fecha || !servicioID) return null;
  
  const slotsContainer = document.getElementById('slots-container');
  if (slotsContainer) {
    slotsContainer.innerHTML = '<div class="slots-vacio">⏳ Cargando disponibilidad...</div>';
  }
  
  try {
    const result = await API.getDisponibilidad(fecha, servicioID);
    
    if (result.ok) {
      CalendarState.disponibilidad = result;
      CalendarState.servicioSeleccionado = servicioID;
      
      // Usar la función correcta (sin recursión)
      renderSlotsView('slots-container', result, (slot) => {
        if (typeof actualizarResumenSeleccion !== 'undefined') {
          actualizarResumenSeleccion();
        }
      });
      
      return result;
    } else {
      console.error('Error al cargar disponibilidad:', result.error);
      if (slotsContainer) {
        slotsContainer.innerHTML = `<p class="slots-vacio">❌ ${result.error || 'Error al cargar disponibilidad'}</p>`;
      }
      return null;
    }
  } catch (error) {
    console.error('Error en cargarDisponibilidad:', error);
    if (slotsContainer) {
      slotsContainer.innerHTML = '<p class="slots-vacio">❌ Error de conexión. Intenta nuevamente.</p>';
    }
    return null;
  }
}

// ════════════════════════════════════════════════════════════════
// ACTUALIZAR RESUMEN EN SIDEBAR
// ════════════════════════════════════════════════════════════════

function actualizarResumenSeleccion() {
  const resumenDiv = document.getElementById('resumen-seleccion');
  if (!resumenDiv) return;
  
  const servicio = CalendarState.disponibilidad?.servicio;
  const fecha = CalendarState.fechaSeleccionada;
  const empleadoNombre = CalendarState.empleadoSeleccionado ? 
    document.querySelector(`.slot-btn--selected`)?.dataset.empleadoNombre : null;
  const hora = CalendarState.slotSeleccionado;
  
  if (!servicio && !fecha && !empleadoNombre) {
    resumenDiv.innerHTML = '<p class="resumen-placeholder">Selecciona un servicio y fecha para continuar.</p>';
    return;
  }
  
  let html = '<div style="display:flex;flex-direction:column;gap:12px">';
  
  if (servicio) {
    html += `
      <div style="display:flex;justify-content:space-between">
        <span style="color:var(--muted)">Servicio:</span>
        <strong>${escapeHtml(servicio.nombre)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span style="color:var(--muted)">Precio:</span>
        <strong style="color:var(--gold)">$${servicio.precio.toLocaleString('es-CL')}</strong>
      </div>
    `;
  }
  
  if (fecha) {
    const fechaObj = new Date(fecha + 'T12:00:00');
    const fechaFormateada = fechaObj.toLocaleDateString('es-CL', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long' 
    });
    html += `
      <div style="display:flex;justify-content:space-between">
        <span style="color:var(--muted)">Fecha:</span>
        <strong>${fechaFormateada}</strong>
      </div>
    `;
  }
  
  if (empleadoNombre && hora) {
    const profLabel = (window.TENANT && window.TENANT.profesionalLabelCap) || 'Profesional';
    html += `
      <div style="display:flex;justify-content:space-between">
        <span style="color:var(--muted)">${profLabel}:</span>
        <strong>${escapeHtml(empleadoNombre)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span style="color:var(--muted)">Hora:</span>
        <strong>${hora}</strong>
      </div>
    `;
  }
  
  html += '</div>';
  resumenDiv.innerHTML = html;
}

// ════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// ════════════════════════════════════════════════════════════════
// FUNCIONES GLOBALES PARA COMPATIBILIDAD
// ════════════════════════════════════════════════════════════════

window.Calendar = Calendar;
window.CalendarState = CalendarState;
window.cargarDisponibilidad = cargarDisponibilidad;
window.actualizarResumenSeleccion = actualizarResumenSeleccion;
window.renderSlotsView = renderSlotsView;
window.renderSlots = renderSlotsView;  // ← ALIAS para compatibilidad con app.js

console.log('✅ calendar.js v3.1 cargado (fix recursión)');
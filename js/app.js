/* ================================================================
   PLATAFORMA AGENDA — app.js (v4 taller)

   Wizard de reserva de 5 pasos con transiciones fluidas
   fade + translateX (estilo Piamonte.cl).

   Pasos:
     1 → Selección de servicio
     2 → Mecánico + Fecha + Datos del vehículo
     3 → Bloque horario (dispara Supabase aquí, con spinner)
     4 → Datos del cliente
     5 → Retiro a domicilio (opcional) + Confirmar
   ================================================================ */

// ── HELPERS UI (disponibles antes del DOMContentLoaded) ──────
function showLoader(msg) {
  const l = document.getElementById('loader');
  if (!l) return;
  l.style.display = 'flex';
  const t = document.getElementById('loader-txt');
  if (t) t.textContent = msg || 'Cargando...';
}
function hideLoader() {
  const l = document.getElementById('loader');
  if (l) l.style.display = 'none';
}
function showError(msg) {
  const t = document.getElementById('toast-error');
  if (!t) { alert(msg); return; }
  t.textContent = msg;
  t.classList.add('visible');
  setTimeout(() => t.classList.remove('visible'), 5000);
}
function esc(s) {
  return String(s || '').replace(/[<>&"']/g, c =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ════════════════════════════════════════════════════════════════
// CONFIGURACIÓN DE PASOS
// ════════════════════════════════════════════════════════════════
const PASOS_CONFIG = [
  { num: 1, label: 'Servicio'  },
  { num: 2, label: 'Vehículo'  },
  { num: 3, label: 'Horario'   },
  { num: 4, label: 'Datos'     },
  { num: 5, label: 'Entrega'   }
];

// ════════════════════════════════════════════════════════════════
// ESTADO DEL WIZARD
// ════════════════════════════════════════════════════════════════
const Wizard = {
  // Catálogos
  servicios:    [],
  empleados:    [],

  // Selecciones del usuario (se preservan al volver)
  pasoActual:        1,
  servicioElegido:   null,
  empleadoElegido:   null,
  fechaElegida:      null,
  horaElegida:       null,
  disponibilidad:    null,

  // Datos del vehículo (paso 2)
  vehiculo: {
    patente: '',
    modelo:  '',
    km:      ''
  },

  // Datos del cliente (paso 4)
  cliente: {
    nombre:  '',
    email:   '',
    tel:     '',
    notas:   ''
  },

  // Retiro a domicilio (paso 5)
  retiroDomicilio:   false,
  retiroDireccion:   '',

  // ─────────────────────────────────────────────────────────────
  async init() {
    showLoader('Cargando…');
    try {
      [this.servicios, this.empleados] = await Promise.all([
        API.getServicios(),
        API.getEmpleados()
      ]);
    } catch (e) {
      hideLoader();
      showError('Error al conectar: ' + e.message);
      return;
    }
    hideLoader();

    if (!this.servicios.length) {
      showError('No hay servicios cargados. Verifica Supabase.');
      return;
    }

    this._renderStepper();
    this._renderServicios();
    this._initCalendario();
    this._renderRetiroPrecio();

    // Activar paso 1 sin animación
    this._mostrarPaso(1, null);

    // Escuchar selección de fecha
    document.addEventListener('fechaSeleccionada', (e) => {
      this._onFechaSelected(e.detail.fecha);
    });

    // Escuchar selección de slot
    document.addEventListener('slotSeleccionado', (e) => {
      const { empleadoID, horaInicio } = e.detail;
      this.empleadoElegido = empleadoID;
      this.horaElegida     = horaInicio;
      this._habilitarSiguiente(3);
      this._actualizarResumen();
    });

    // Keyboard ESC no necesario (no hay modal)
    console.log('✅ app.js v4 taller cargado.');
  },

  // ─────────────────────────────────────────────────────────────
  // STEPPER
  // ─────────────────────────────────────────────────────────────
  _renderStepper() {
    const el = document.getElementById('stepper');
    if (!el) return;
    let html = '';
    PASOS_CONFIG.forEach((p, i) => {
      html += `
        <div class="stepper-step" id="stp-${p.num}" data-paso="${p.num}">
          <div class="stepper-inner">
            <div class="stepper-dot"><span>${p.num}</span></div>
            <div class="stepper-label">${p.label}</div>
          </div>
          ${i < PASOS_CONFIG.length - 1 ? '<div class="stepper-line" id="stpline-' + p.num + '"></div>' : ''}
        </div>`;
    });
    el.innerHTML = html;
    this._actualizarStepper(1);
  },

  _actualizarStepper(pasoActivo) {
    PASOS_CONFIG.forEach(p => {
      const el    = document.getElementById('stp-' + p.num);
      const linea = document.getElementById('stpline-' + p.num);
      if (!el) return;
      el.classList.remove('activo', 'completado');
      if (p.num === pasoActivo)   el.classList.add('activo');
      if (p.num < pasoActivo)     el.classList.add('completado');
      if (linea) {
        linea.classList.toggle('done', p.num < pasoActivo);
      }
    });
  },

  // ─────────────────────────────────────────────────────────────
  // NAVEGACIÓN ENTRE PASOS (con transición CSS)
  // ─────────────────────────────────────────────────────────────
  irA(numDestino) {
    const origen = this.pasoActual;

    // Validar antes de avanzar (no validar al volver)
    if (numDestino > origen) {
      const error = this._validarPaso(origen);
      if (error) { showError(error); return; }
    }

    // Guardar datos del paso actual antes de salir
    this._guardarDatosPasoActual();

    // ── Paso 2: mecánico + fecha + vehículo ──────────────────
    if (numDestino === 2) {
      this._mostrarPaso(2, origen);
      this.pasoActual = 2;
      this._actualizarStepper(2);

      // Re-renderizar chips (pueden haber cambiado si se vuelve desde paso 3)
      this._renderEmpleadosP2();

      // Re-inicializar calendario DESPUÉS de que el paso sea visible
      // (el div estaba oculto con display:none al hacer Calendar.init())
      setTimeout(() => {
        this._initCalendario();
        // Restaurar fecha seleccionada si ya había una
        if (this.fechaElegida) {
          const fd = document.getElementById('fecha-display');
          if (fd) {
            fd.textContent = new Date(this.fechaElegida + 'T12:00:00')
              .toLocaleDateString('es-CL', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
              });
          }
        }
        // Restaurar campos del vehículo
        const pi = document.getElementById('inp-patente');
        const pm = document.getElementById('inp-modelo');
        const pk = document.getElementById('inp-km');
        if (pi && this.vehiculo.patente) pi.value = this.vehiculo.patente;
        if (pm && this.vehiculo.modelo)  pm.value = this.vehiculo.modelo;
        if (pk && this.vehiculo.km)      pk.value = this.vehiculo.km;
        // Verificar si el botón debe habilitarse
        this._checkHabilitarSiguiente2();
      }, 80);

      this._actualizarResumen();
      return;
    }

    // ── Paso 3: horario (dispara Supabase) ───────────────────
    if (numDestino === 3 && origen !== 3) {
      this._mostrarPaso(3, origen);
      this.pasoActual = 3;
      this._actualizarStepper(3);
      this._cargarDisponibilidad();
      return;
    }

    // ── Paso 4: formulario del cliente ───────────────────────
    if (numDestino === 4) {
      this._mostrarPaso(4, origen);
      this.pasoActual = 4;
      this._actualizarStepper(4);
      this._renderResumenP4();
      return;
    }

    // ── Paso 5: retiro + confirmar ───────────────────────────
    if (numDestino === 5) {
      const err4 = this._validarPaso4();
      if (err4) { showError(err4); return; }
      this._guardarDatosCliente();
      this._mostrarPaso(5, origen);
      this.pasoActual = 5;
      this._actualizarStepper(5);
      this._renderResumenFinal();
      return;
    }

    // ── Paso 1 (default) ─────────────────────────────────────
    this._mostrarPaso(numDestino, origen);
    this.pasoActual = numDestino;
    this._actualizarStepper(numDestino);
    this._actualizarResumen();
  },

  // ─────────────────────────────────────────────────────────────
  // LÓGICA DE TRANSICIÓN CSS
  // _mostrarPaso(destino, origen)
  //   origen = null → sin animación (primer render)
  //   destino > origen → slide desde la derecha
  //   destino < origen → slide desde la izquierda
  // ─────────────────────────────────────────────────────────────
  _mostrarPaso(destino, origen) {
    const elOrigen  = origen  ? document.getElementById('paso-' + origen)  : null;
    const elDestino = document.getElementById('paso-' + destino);
    if (!elDestino) return;

    const avanzando = origen ? destino > origen : true;

    // Animar salida del paso actual
    if (elOrigen && elOrigen !== elDestino) {
      elOrigen.classList.remove('paso--activo', 'desde-izquierda');
      if (!avanzando) elOrigen.classList.add('paso--saliendo', 'hacia-derecha');
      else            elOrigen.classList.add('paso--saliendo');

      setTimeout(() => {
        elOrigen.classList.remove('paso--saliendo', 'hacia-derecha');
        elOrigen.style.display = 'none';
      }, 370);
    }

    // Breve delay para que se note la animación
    setTimeout(() => {
      elDestino.style.display = 'block';
      elDestino.classList.remove('paso--activo', 'paso--saliendo', 'desde-izquierda', 'hacia-derecha');
      if (origen !== null) {
        if (!avanzando) elDestino.classList.add('desde-izquierda');
      }
      // Forzar reflow antes de añadir la clase de animación
      void elDestino.offsetWidth;
      elDestino.classList.add('paso--activo');

      // Scroll suave al wizard
      setTimeout(() => {
        document.getElementById('reservar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }, elOrigen && elOrigen !== elDestino ? 60 : 0);
  },

  // ─────────────────────────────────────────────────────────────
  // VALIDACIONES POR PASO
  // ─────────────────────────────────────────────────────────────
  _validarPaso(num) {
    if (num === 1) {
      if (!this.servicioElegido) return 'Selecciona un servicio para continuar.';
    }
    if (num === 2) {
      if (!this.empleadoElegido) {
        return 'Selecciona un ' + (window.TENANT?.t('profesional') || 'mecánico') + '.';
      }
      if (!this.fechaElegida) return 'Selecciona una fecha.';
      const pat = document.getElementById('inp-patente')?.value.trim();
      if (!pat) return 'Ingresa la patente del vehículo.';
    }
    if (num === 3) {
      if (!this.horaElegida) return 'Selecciona un bloque horario.';
    }
    return null;
  },

  _validarPaso4() {
    const nombre = document.getElementById('inp-nombre')?.value.trim();
    const email  = document.getElementById('inp-email')?.value.trim();
    if (!nombre || nombre.length < 2) return 'Nombre inválido (mínimo 2 caracteres).';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Email inválido.';
    return null;
  },

  // ─────────────────────────────────────────────────────────────
  // GUARDAR DATOS DEL PASO ACTUAL (para no perderlos al volver)
  // ─────────────────────────────────────────────────────────────
  _guardarDatosPasoActual() {
    if (this.pasoActual === 2) {
      this.vehiculo.patente = document.getElementById('inp-patente')?.value.trim() || '';
      this.vehiculo.modelo  = document.getElementById('inp-modelo')?.value.trim()  || '';
      this.vehiculo.km      = document.getElementById('inp-km')?.value.trim()       || '';
    }
    if (this.pasoActual === 4) {
      this._guardarDatosCliente();
    }
    if (this.pasoActual === 5) {
      this.retiroDireccion = document.getElementById('inp-retiro-dir')?.value.trim() || '';
    }
  },

  _guardarDatosCliente() {
    this.cliente.nombre = document.getElementById('inp-nombre')?.value.trim() || '';
    this.cliente.email  = document.getElementById('inp-email')?.value.trim()  || '';
    this.cliente.tel    = document.getElementById('inp-tel')?.value.trim()    || '';
    this.cliente.notas  = document.getElementById('inp-notas')?.value.trim()  || '';
  },

  // ─────────────────────────────────────────────────────────────
  // PASO 1: SERVICIOS — alimenta el SrvDropdown (index.html)
  // ─────────────────────────────────────────────────────────────
  _renderServicios() {
    // Si existe el dropdown ERP, poblar y salir
    if (typeof SrvDropdown !== 'undefined') {
      SrvDropdown.poblar(this.servicios);
      return;
    }
    // Fallback: renderizar cards clásicas (compatibilidad)
    const cont = document.getElementById('servicios-grid');
    if (!cont) return;

    const porCat = {};
    this.servicios.forEach(s => {
      const cat = s.categoria || 'Otros';
      (porCat[cat] = porCat[cat] || []).push(s);
    });

    let html = '<div class="srv-grid">';
    Object.keys(porCat).forEach(cat => {
      porCat[cat].forEach(s => {
        html += `
          <div class="srv-card" data-id="${esc(s.id)}">
            <div class="srv-cat">${esc(cat)}</div>
            <div class="srv-name">${esc(s.nombre)}</div>
            <div class="srv-meta">
              <span>⏱ ${s.duracion} min</span>
              <span class="srv-price">$${s.precio.toLocaleString('es-CL')}</span>
            </div>
          </div>`;
      });
    });
    html += '</div>';
    cont.innerHTML = html;

    cont.querySelectorAll('.srv-card').forEach(card => {
      card.addEventListener('click', () => this._onServicioSelected(card.dataset.id));
    });
  },

  _onServicioSelected(id) {
    this.servicioElegido = this.servicios.find(s => s.id === id);
    if (!this.servicioElegido) return;

    document.querySelectorAll('.srv-card').forEach(c =>
      c.classList.toggle('selected', c.dataset.id === id));

    // Reiniciar selecciones posteriores si cambió el servicio
    this.empleadoElegido = null;
    this.fechaElegida    = null;
    this.horaElegida     = null;
    this.disponibilidad  = null;

    this._habilitarSiguiente(1);
    this._actualizarResumen();
    this._renderEmpleadosP2();

    // Resetear calendario
    if (typeof Calendar !== 'undefined') Calendar.reset?.();
    const fd = document.getElementById('fecha-display');
    if (fd) fd.textContent = '';
    const sc = document.getElementById('slots-container');
    if (sc) sc.innerHTML = '<div class="slots-loading"><div class="slot-spinner"></div><p>Verificando disponibilidad…</p></div>';
  },

  // ─────────────────────────────────────────────────────────────
  // PASO 2: MECÁNICO — Visual Cards con foto
  // ─────────────────────────────────────────────────────────────
  _renderEmpleadosP2() {
    const cont  = document.getElementById('empleados-chips-p2');
    const label = document.getElementById('mecanico-label');
    if (!cont) return;

    if (label) label.textContent = 'Selecciona un ' + (window.TENANT?.t('profesional') || 'mecánico');

    let emps = this.empleados;
    if (this.servicioElegido?.requiereSkill) {
      emps = emps.filter(e => (e.skills || []).includes(this.servicioElegido.requiereSkill));
    }
    if (!emps.length) {
      cont.innerHTML = '<p style="color:var(--muted);font-size:13px">No hay ' +
        (window.TENANT?.t('profesionales') || 'mecánicos') + ' disponibles para este servicio.</p>';
      return;
    }

    // Renderizar Visual Cards (mecanico-cards definidas en index.html CSS)
    let html = '';
    emps.forEach(e => {
      const sel   = this.empleadoElegido === e.id ? 'selected' : '';
      const foto  = e.foto
        ? `<img class="mecanico-foto" src="${esc(e.foto)}" alt="${esc(e.nombre)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        : '';
      const inicial = esc(e.nombre.charAt(0).toUpperCase());
      const colorBg = esc(e.color || '#C9A84C');
      const espec   = esc(e.especialidad || e.descripcion || '');

      html += `
        <div class="mecanico-card ${sel}" onclick="Wizard._selectEmpleado('${esc(e.id)}')" data-emp="${esc(e.id)}">
          <div class="selected-badge">✓</div>
          ${foto}
          <div class="mecanico-foto-placeholder" style="background:${colorBg}20;color:${colorBg};font-weight:700;${foto ? 'display:none' : ''}">
            ${inicial}
          </div>
          <div class="mecanico-nombre">${esc(e.nombre)}</div>
          ${espec ? `<div class="mecanico-especialidad">${espec}</div>` : ''}
        </div>`;
    });
    cont.innerHTML = html;
  },

  // Llamado desde el onclick inline de cada chip (más robusto que event delegation)
  _selectEmpleado(empId) {
    console.log('[Wizard] _selectEmpleado →', empId);
    this.empleadoElegido = empId;
    this.horaElegida     = null;
    this._renderEmpleadosP2();
    this._checkHabilitarSiguiente2();
    this._actualizarResumen();
  },

  _initCalendario() {
    if (typeof Calendar === 'undefined') return;
    // Limpiar instancia previa si existe (evita calendarios dobles al volver al paso 2)
    const cont = document.getElementById('calendario');
    if (cont && cont.dataset.calInit === '1') {
      // Ya inicializado: sólo re-renderizar el mes actual
      if (typeof Calendar.render === 'function') Calendar.render();
      return;
    }
    Calendar.init('calendario', (fecha) => this._onFechaSelected(fecha));
    if (cont) cont.dataset.calInit = '1';
  },

  _onFechaSelected(fecha) {
    this.fechaElegida = fecha;
    const d = new Date(fecha + 'T12:00:00');
    const fd = document.getElementById('fecha-display');
    if (fd) fd.textContent = d.toLocaleDateString('es-CL', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
    this._checkHabilitarSiguiente2();
    this._actualizarResumen();
  },

  _checkHabilitarSiguiente2() {
    const ok = !!(this.empleadoElegido && this.fechaElegida);
    console.log('[Wizard P2] check →',
      'mecánico:', this.empleadoElegido || 'null',
      '| fecha:', this.fechaElegida || 'null',
      '| habilitar:', ok);
    if (ok) {
      this._habilitarSiguiente(2);
    } else {
      this._deshabilitarSiguiente(2);
    }
  },

  // ─────────────────────────────────────────────────────────────
  // PASO 3: CARGAR DISPONIBILIDAD (Supabase query aquí)
  // ─────────────────────────────────────────────────────────────
  async _cargarDisponibilidad() {
    const cont = document.getElementById('slots-container');
    if (!cont) return;

    // Mostrar spinner
    cont.innerHTML = `
      <div class="slots-loading">
        <div class="slot-spinner"></div>
        <p>Verificando disponibilidad en tiempo real…</p>
      </div>`;

    // Deshabilitar "siguiente" mientras carga
    this._deshabilitarSiguiente(3);

    if (!this.servicioElegido || !this.fechaElegida) {
      cont.innerHTML = '<p class="slots-vacio">Selecciona servicio y fecha primero.</p>';
      return;
    }

    let result;
    try {
      result = await API.getDisponibilidad(this.fechaElegida, this.servicioElegido.id);
    } catch (e) {
      cont.innerHTML = '<p class="slots-vacio">❌ Error al cargar disponibilidad: ' + esc(e.message) + '</p>';
      return;
    }

    if (!result?.ok) {
      cont.innerHTML = '<p class="slots-vacio">❌ ' + esc(result?.error || 'Error desconocido') + '</p>';
      return;
    }

    this.disponibilidad = result.empleados;

    // Filtrar sólo el mecánico seleccionado (ya fue elegido en paso 2)
    const empData = this.empleadoElegido && this.disponibilidad
      ? this.disponibilidad[this.empleadoElegido]
      : null;

    if (!empData || !empData.hayDisponibilidad) {
      cont.innerHTML = `
        <div class="slots-vacio">
          <p>😔 No hay horarios disponibles para el mecánico y fecha seleccionados.</p>
          <button class="btn-volver" style="margin-top:12px" onclick="Wizard.irA(2)">← Cambiar fecha o mecánico</button>
        </div>`;
      return;
    }

    // Renderizar slots del mecánico seleccionado
    this._renderSlots(empData);
  },

  _renderSlots(empData) {
    const cont = document.getElementById('slots-container');
    if (!cont) return;

    const slots = (empData.slots || []).filter(s => !s.pasado);
    const disponibles = slots.filter(s => s.disponible);

    if (!disponibles.length) {
      cont.innerHTML = `
        <div class="slots-vacio">
          <p>No hay bloques disponibles para ${esc(empData.empleado.nombre)} en esta fecha.</p>
          <button class="btn-volver" style="margin-top:12px" onclick="Wizard.irA(2)">← Cambiar fecha o mecánico</button>
        </div>`;
      return;
    }

    let html = `
      <div class="slots-barbero">
        <div class="slots-barbero-header">
          <div class="slots-barbero-avatar" style="background:${esc(empData.empleado.color||'#C9A84C')}">
            ${esc(empData.empleado.nombre.charAt(0))}
          </div>
          <div>
            <div class="slots-barbero-nombre">${esc(empData.empleado.nombre)}</div>
            <div class="slots-barbero-skills">${disponibles.length} bloques disponibles</div>
          </div>
        </div>
        <div class="slots-horas">`;

    slots.forEach(s => {
      if (s.pasado) return;
      const sel   = this.horaElegida === s.horaInicio ? 'selected' : '';
      const dispo = s.disponible;
      html += `
        <button class="slot-btn ${sel} ${dispo ? '' : 'slot-ocupado'}"
          ${dispo ? '' : 'disabled'}
          data-hora="${esc(s.horaInicio)}"
          data-fin="${esc(s.horaFin)}"
          data-empid="${esc(empData.empleado.id)}"
          title="${dispo ? s.horaInicio + ' – ' + s.horaFin : 'Ocupado'}">
          ${esc(s.horaInicio)}${dispo ? '' : ' 🔒'}
        </button>`;
    });

    html += `</div></div>`;
    cont.innerHTML = html;

    // Inyectar estilo para slot ocupado si no existe
    if (!document.getElementById('slot-ocupado-style')) {
      const st = document.createElement('style');
      st.id = 'slot-ocupado-style';
      st.textContent = '.slot-ocupado{opacity:.35;cursor:not-allowed!important;background:transparent!important;border-color:var(--border)!important;color:var(--hint)!important}';
      document.head.appendChild(st);
    }

    cont.querySelectorAll('.slot-btn:not(.slot-ocupado)').forEach(btn => {
      btn.addEventListener('click', () => {
        cont.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.horaElegida     = btn.dataset.hora;
        this.empleadoElegido = btn.dataset.empid;
        this._habilitarSiguiente(3);
        this._actualizarResumen();
      });
    });

    // Restaurar selección previa si existe
    if (this.horaElegida) {
      const prev = cont.querySelector(`[data-hora="${this.horaElegida}"]`);
      if (prev) {
        prev.classList.add('selected');
        this._habilitarSiguiente(3);
      }
    }
  },

  // ─────────────────────────────────────────────────────────────
  // PASO 4: RESUMEN + FORM CLIENTE
  // ─────────────────────────────────────────────────────────────
  _renderResumenP4() {
    const cont = document.getElementById('p4-resumen');
    if (!cont) return;

    const empNombre = this._getEmpNombre();
    const fechaFmt  = this._formatFecha(this.fechaElegida);
    const s = this.servicioElegido;

    cont.innerHTML = `
      <div class="res-item"><div class="label">Servicio</div><strong>${esc(s?.nombre||'—')}</strong></div>
      <div class="res-item"><div class="label">${window.TENANT?.t('profesionalCap')||'Mecánico'}</div><strong>${esc(empNombre)}</strong></div>
      <div class="res-item"><div class="label">Fecha</div><strong>${esc(fechaFmt)}</strong></div>
      <div class="res-item"><div class="label">Hora</div><strong>${esc(this.horaElegida||'—')}</strong></div>
      ${this.vehiculo.patente ? `<div class="res-item"><div class="label">Patente</div><strong>${esc(this.vehiculo.patente)}</strong></div>` : ''}
      ${this.vehiculo.modelo ? `<div class="res-item"><div class="label">Vehículo</div><strong>${esc(this.vehiculo.modelo)}</strong></div>` : ''}
      <div class="res-item"><div class="label">Precio</div><strong style="color:var(--gold-lt)">$${(s?.precio||0).toLocaleString('es-CL')}</strong></div>
    `;

    // Restaurar datos guardados previamente
    if (this.cliente.nombre) {
      const el = document.getElementById('inp-nombre');
      if (el) el.value = this.cliente.nombre;
    }
    if (this.cliente.email) {
      const el = document.getElementById('inp-email');
      if (el) el.value = this.cliente.email;
    }
    if (this.cliente.tel) {
      const el = document.getElementById('inp-tel');
      if (el) el.value = this.cliente.tel;
    }
    if (this.cliente.notas) {
      const el = document.getElementById('inp-notas');
      if (el) el.value = this.cliente.notas;
    }
    setTimeout(() => document.getElementById('inp-nombre')?.focus(), 200);
  },

  // ─────────────────────────────────────────────────────────────
  // PASO 5: RETIRO A DOMICILIO
  // ─────────────────────────────────────────────────────────────
  _renderRetiroPrecio() {
    const cargo = window.TENANT?.retiroCargo || 15000;
    const label = document.getElementById('retiro-precio-label');
    if (label) label.textContent = '+ $' + cargo.toLocaleString('es-CL');
  },

  toggleRetiro(activo) {
    this.retiroDomicilio = activo;
    const cardSi  = document.getElementById('card-retiro-si');
    const cardNo  = document.getElementById('card-retiro-no');
    const radioSi = document.getElementById('radio-si');
    const radioNo = document.getElementById('radio-no');
    if (!cardSi || !cardNo) return;

    if (activo) {
      cardSi.classList.add('seleccionado');
      cardNo.classList.remove('seleccionado');
      if (radioSi) radioSi.style.cssText = 'border-color:var(--gold);background:var(--gold);box-shadow:inset 0 0 0 4px var(--card)';
      if (radioNo) radioNo.style.cssText = '';
      setTimeout(() => document.getElementById('inp-retiro-dir')?.focus(), 200);
    } else {
      cardNo.classList.add('seleccionado');
      cardSi.classList.remove('seleccionado');
      if (radioNo) radioNo.style.cssText = 'border-color:var(--gold);background:var(--gold);box-shadow:inset 0 0 0 4px var(--card)';
      if (radioSi) radioSi.style.cssText = '';
    }
    this._renderResumenFinal();
  },

  _renderResumenFinal() {
    const cont = document.getElementById('p5-resumen-final');
    if (!cont) return;

    const s     = this.servicioElegido;
    const cargo = this.retiroDomicilio ? (window.TENANT?.retiroCargo || 15000) : 0;
    const total = (s?.precio || 0) + cargo;

    cont.innerHTML = `
      <div style="background:var(--card2);border:1px solid var(--border);border-radius:var(--r-lg);padding:16px;margin-bottom:4px">
        <div class="sidebar-titulo" style="margin-bottom:10px">Resumen final</div>
        <div class="resumen-fila"><span>Servicio</span><strong>$${(s?.precio||0).toLocaleString('es-CL')}</strong></div>
        ${cargo ? `<div class="resumen-fila"><span>Retiro a domicilio</span><strong>$${cargo.toLocaleString('es-CL')}</strong></div>` : ''}
        <div class="resumen-total"><span>Total a pagar</span><strong>$${total.toLocaleString('es-CL')}</strong></div>
      </div>`;
  },

  // ─────────────────────────────────────────────────────────────
  // CONFIRMAR RESERVA (se ejecuta en paso 5)
  // ─────────────────────────────────────────────────────────────
  async confirmarReserva() {
    // Guardar dirección de retiro si aplica
    this.retiroDireccion = document.getElementById('inp-retiro-dir')?.value.trim() || '';

    if (this.retiroDomicilio && !this.retiroDireccion) {
      showError('Ingresa la dirección de retiro.');
      return;
    }

    const btn = document.getElementById('btn-confirmar');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Creando reserva…'; }

    showLoader('Creando reserva…');

    const cargo = this.retiroDomicilio ? (window.TENANT?.retiroCargo || 15000) : 0;

    const res = await API.crearReserva({
      nombre:            this.cliente.nombre,
      email:             this.cliente.email,
      telefono:          this.cliente.tel,
      notas:             this.cliente.notas,
      servicioID:        this.servicioElegido.id,
      empleadoID:        this.empleadoElegido,
      fecha:             this.fechaElegida,
      horaInicio:        this.horaElegida,
      // Vehículo
      patente:           this.vehiculo.patente,
      modeloVehiculo:    this.vehiculo.modelo,
      kilometraje:       parseInt(this.vehiculo.km) || 0,
      // Retiro
      retiroDomicilio:   this.retiroDomicilio,
      retiroDireccion:   this.retiroDireccion,
      retiroCargo:       cargo
    });

    hideLoader();

    if (btn) { btn.disabled = false; btn.textContent = '✅ Confirmar Reserva'; }

    if (!res.ok) {
      showError(res.error || 'Error al crear la reserva');
      return;
    }

    this._mostrarConfirmacion(res.reserva, res.codigo);
  },

  // ─────────────────────────────────────────────────────────────
  // PANTALLA DE CONFIRMACIÓN
  // ─────────────────────────────────────────────────────────────
  _mostrarConfirmacion(reserva, codigo) {
    // Usar ConfModal si existe (version publica con modal WhatsApp)
    if (typeof ConfModal !== 'undefined') {
      ConfModal.abrir({
        codigo:   codigo || reserva.codigo || reserva.id,
        nombre:   reserva.nombre_cliente,
        servicio: reserva.servicio_nombre,
        mecanico: reserva.empleado_nombre,
        fecha:    new Date(reserva.fecha + 'T12:00:00').toLocaleDateString('es-CL', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        }),
        hora:     (reserva.hora_inicio || '').slice(0, 5),
        retiro:   reserva.retiro_domicilio,
        retiroDir: reserva.retiro_direccion || '',
        patente:  reserva.patente || '',
        reservaId: reserva.id,
        clienteId: reserva.cliente_id || null
      });
      return;
    }

    // Fallback: modo clasico (admin)
    document.getElementById('reservas-screen').style.display = 'none';
    document.getElementById('confirmacion-screen').style.display = 'block';

    document.getElementById('conf-id').textContent      = codigo || reserva.codigo || reserva.id;
    document.getElementById('conf-nombre').textContent  = reserva.nombre_cliente;
    document.getElementById('conf-srv').textContent     = reserva.servicio_nombre;
    document.getElementById('conf-mecanico').textContent = reserva.empleado_nombre;

    const fd = document.getElementById('conf-fecha');
    if (fd) fd.textContent = new Date(reserva.fecha + 'T12:00:00').toLocaleDateString('es-CL', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
    const fh = document.getElementById('conf-hora');
    if (fh) fh.textContent = (reserva.hora_inicio || '').slice(0, 5);

    const vbadge = document.getElementById('conf-vehiculo-badge');
    if (vbadge && reserva.patente) {
      vbadge.textContent = reserva.patente + (reserva.modelo_vehiculo ? ' · ' + reserva.modelo_vehiculo : '');
      vbadge.style.display = 'inline-block';
    }

    const retRow = document.getElementById('conf-retiro-row');
    const retEl  = document.getElementById('conf-retiro');
    if (retRow && reserva.retiro_domicilio) {
      retRow.style.display = 'flex';
      if (retEl) retEl.textContent = reserva.retiro_direccion || 'Si';
    }

    if (typeof Survey !== 'undefined' && reserva?.id) {
      Survey.init(reserva.id, reserva.cliente_id || null, reserva.patente || null);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  nuevaReserva() {
    // Cerrar modal si existe
    if (typeof ConfModal !== 'undefined') {
      ConfModal.cerrar();
    }
    if (document.getElementById('confirmacion-screen')) {
      document.getElementById('confirmacion-screen').style.display = 'none';
    }
    if (document.getElementById('reservas-screen')) {
      document.getElementById('reservas-screen').style.display = 'block';
    }

    // Reset completo
    this.servicioElegido  = null;
    this.empleadoElegido  = null;
    this.fechaElegida     = null;
    this.horaElegida      = null;
    this.disponibilidad   = null;
    this.vehiculo         = { patente: '', modelo: '', km: '' };
    this.cliente          = { nombre: '', email: '', tel: '', notas: '' };
    this.retiroDomicilio  = false;
    this.retiroDireccion  = '';

    // Limpiar dropdown ERP si existe
    if (typeof SrvDropdown !== 'undefined') SrvDropdown.limpiar();

    document.querySelectorAll('.srv-card').forEach(c => c.classList.remove('selected'));
    document.querySelectorAll('.mecanico-card').forEach(c => c.classList.remove('selected'));

    ['inp-patente','inp-modelo','inp-km','inp-nombre','inp-email','inp-tel','inp-notas','inp-retiro-dir']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

    const fd = document.getElementById('fecha-display');
    if (fd) fd.textContent = '';

    const sc = document.getElementById('slots-container');
    if (sc) sc.innerHTML = '<div class="slots-loading"><div class="slot-spinner"></div><p>Verificando disponibilidad…</p></div>';

    this.toggleRetiro(false);
    this._deshabilitarSiguiente(1);

    if (typeof Calendar !== 'undefined') Calendar.reset?.();

    this.pasoActual = 1;
    this._actualizarStepper(1);
    this._renderEmpleadosP2();

    // Ocultar todos los pasos, mostrar paso 1
    for (let i = 1; i <= 5; i++) {
      const el = document.getElementById('paso-' + i);
      if (el) { el.classList.remove('paso--activo','paso--saliendo','desde-izquierda','hacia-derecha'); el.style.display = 'none'; }
    }
    this._mostrarPaso(1, null);
    this._actualizarResumen();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  // ─────────────────────────────────────────────────────────────
  // SIDEBAR: RESUMEN DE SELECCIÓN
  // ─────────────────────────────────────────────────────────────
  _actualizarResumen() {
    const cont = document.getElementById('resumen-seleccion');
    if (!cont) return;

    if (!this.servicioElegido) {
      cont.innerHTML = '<p class="resumen-placeholder">Selecciona un servicio para comenzar.</p>';
      return;
    }

    const empNombre = this._getEmpNombre();
    const fechaFmt  = this._formatFecha(this.fechaElegida, true);
    const s = this.servicioElegido;
    const cargo = this.retiroDomicilio ? (window.TENANT?.retiroCargo || 15000) : 0;
    const total = (s.precio || 0) + cargo;

    let html = `
      <div class="resumen-fila"><span>Servicio</span><strong>${esc(s.nombre)}</strong></div>
      <div class="resumen-fila"><span>Duración</span><strong>${s.duracion} min</strong></div>`;
    if (empNombre)           html += `<div class="resumen-fila"><span>${window.TENANT?.t('profesionalCap')||'Mecánico'}</span><strong>${esc(empNombre)}</strong></div>`;
    if (fechaFmt)            html += `<div class="resumen-fila"><span>Fecha</span><strong>${fechaFmt}</strong></div>`;
    if (this.horaElegida)    html += `<div class="resumen-fila"><span>Hora</span><strong>${esc(this.horaElegida)}</strong></div>`;
    if (this.vehiculo.patente) html += `<div class="resumen-fila"><span>Patente</span><strong>${esc(this.vehiculo.patente)}</strong></div>`;
    if (cargo)               html += `<div class="resumen-fila"><span>Retiro dom.</span><strong>$${cargo.toLocaleString('es-CL')}</strong></div>`;
    html += `<div class="resumen-total"><span>Total</span><strong>$${total.toLocaleString('es-CL')}</strong></div>`;

    cont.innerHTML = html;
  },

  // ─────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────
  _habilitarSiguiente(paso) {
    const btn = document.getElementById('btn-siguiente-' + paso);
    if (btn) btn.disabled = false;
  },
  _deshabilitarSiguiente(paso) {
    const btn = document.getElementById('btn-siguiente-' + paso);
    if (btn) btn.disabled = true;
  },

  _getEmpNombre() {
    if (!this.empleadoElegido) return null;
    if (this.disponibilidad?.[this.empleadoElegido]) {
      return this.disponibilidad[this.empleadoElegido].empleado.nombre;
    }
    const emp = this.empleados.find(e => e.id === this.empleadoElegido);
    return emp?.nombre || null;
  },

  _formatFecha(fechaStr, corta = false) {
    if (!fechaStr) return null;
    const d = new Date(fechaStr + 'T12:00:00');
    if (corta) return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
    return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
};

// Exportar globalmente
window.Wizard = Wizard;

// ════════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  if (typeof API === 'undefined') {
    showError('supabase-config.js no cargó. Verifica las rutas en index.html.');
    return;
  }
  Wizard.init();
});

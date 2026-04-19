/* ================================================================
   PLATAFORMA AGENDA — supabase-config.js (VERSION PUBLICA)

   Solo funciones necesarias para el booking publico:
   - getServicios
   - getEmpleados
   - getDisponibilidad
   - crearReserva (solo INSERT, precio viene de BD)

   ELIMINADO: cancelar, reagendar, cambiarEstado, registrarPago,
   getClientes, getDashboard, cerrarAgenda, etc.
   ================================================================ */

if (!window.TENANT) {
  throw new Error('Carga tenant.config.js ANTES que este archivo');
}

const SUPABASE_URL = 'https://kdzvreikuyzgocmexflk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkenZyZWlrdXl6Z29jbWV4ZmxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMDU1NjMsImV4cCI6MjA5MTY4MTU2M30.RMJKv7Tr7H18nEdovjDz2bUhUwzy8I1QIXaBAwnHjPo';

if (typeof supabase === 'undefined') {
  console.error('Carga el SDK de Supabase ANTES que este archivo');
}

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.db = db;
window.SUPABASE_URL = SUPABASE_URL;
window.CONFIG = window.TENANT;
window.ESTADOS = window.TENANT.estados;

// ---- UTILIDADES DE SANITIZACION ----

function sanitizeStr(str, maxLen) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[<>"'`]/g, '')       // strip HTML/script chars
    .replace(/javascript:/gi, '')  // strip js protocol
    .replace(/on\w+=/gi, '')       // strip event handlers
    .trim()
    .slice(0, maxLen || 500);
}

function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validarTelefonoChile(tel) {
  const clean = tel.replace(/[\s\-\(\)]/g, '');
  return /^(\+?56)?9\d{8}$/.test(clean);
}

function validarPatenteChilena(pat) {
  const clean = pat.replace(/[\s\-]/g, '').toUpperCase();
  // Formato nuevo: BBBB-99 (4 letras 2 numeros) o antiguo: BB-9999 (2 letras 4 numeros)
  return /^[A-Z]{4}\d{2}$/.test(clean) || /^[A-Z]{2}\d{4}$/.test(clean);
}

// ======================================================================
// API PUBLICA (solo operaciones de booking)
// ======================================================================

const API = {

  // ---- SERVICIOS (solo lectura) ----
  async getServicios() {
    try {
      const { data, error } = await db
        .from('servicios')
        .select('*')
        .eq('activo', true)
        .order('orden', { ascending: true })
        .order('categoria', { ascending: true });
      if (error) throw error;
      return data.map(s => ({
        id:            s.id,
        nombre:        s.nombre,
        duracion:      s.duracion_min,
        precio:        s.precio,
        categoria:     s.categoria,
        requiereSkill: s.requiere_skill || '',
        esSesion:      s.es_sesion,
        maxSesiones:   s.max_sesiones,
        descripcion:   s.descripcion
      }));
    } catch (e) {
      console.error('getServicios:', e);
      return [];
    }
  },

  // ---- EMPLEADOS (solo lectura) ----
  async getEmpleados() {
    try {
      const { data, error } = await db
        .from('empleados')
        .select('*')
        .eq('activo', true)
        .order('orden', { ascending: true })
        .order('nombre', { ascending: true });
      if (error) throw error;
      return data.map(e => ({
        id:          e.id,
        nombre:      e.nombre,
        email:       e.email,
        telefono:    e.telefono || '',
        skills:      e.skills || [],
        color:       e.color || '#6B7280',
        foto:        e.foto_url || '',
        descripcion: e.descripcion || ''
      }));
    } catch (e) {
      console.error('getEmpleados:', e);
      return [];
    }
  },

  // ---- DISPONIBILIDAD (solo lectura) ----
  async getDisponibilidad(fecha, servicioID) {
    try {
      const servicios = await this.getServicios();
      const servicio = servicios.find(s => s.id === servicioID);
      if (!servicio) return { ok: false, error: 'Servicio no encontrado' };

      let empleados = await this.getEmpleados();
      if (servicio.requiereSkill) {
        empleados = empleados.filter(e => e.skills.includes(servicio.requiereSkill));
      }

      const fechaObj = new Date(fecha + 'T12:00:00');
      const diaSemana = fechaObj.getDay();

      const [horariosRes, reservasRes, cerradasRes] = await Promise.all([
        db.from('horarios').select('*').eq('dia_semana', diaSemana).eq('disponible', true),
        db.from('reservas').select('id, empleado_id, hora_inicio, hora_fin').eq('fecha', fecha).neq('estado', window.TENANT.estados.CANCELADA),
        db.from('agendas_cerradas').select('*').eq('fecha', fecha).eq('activo', true)
      ]);

      if (horariosRes.error) throw horariosRes.error;
      if (reservasRes.error) throw reservasRes.error;
      if (cerradasRes.error) throw cerradasRes.error;

      const horarios = horariosRes.data || [];
      const reservas = reservasRes.data || [];
      const cerradas = cerradasRes.data || [];

      const resultado = {};
      for (const emp of empleados) {
        const horario = horarios.find(h => h.empleado_id === emp.id);
        if (!horario) continue;

        const cerradoEmp = cerradas.filter(c => !c.empleado_id || c.empleado_id === emp.id);
        const cerradoTodoElDia = cerradoEmp.some(c => !c.hora_inicio);
        if (cerradoTodoElDia) {
          resultado[emp.id] = { empleado: emp, slots: [], hayDisponibilidad: false, cerrado: true };
          continue;
        }

        const reservasEmp = reservas.filter(r => r.empleado_id === emp.id);
        const slots = this._calcularSlots(
          horario.hora_inicio, horario.hora_fin,
          servicio.duracion, reservasEmp, cerradoEmp, fecha
        );

        resultado[emp.id] = {
          empleado: emp,
          slots,
          hayDisponibilidad: slots.some(s => s.disponible)
        };
      }

      return { ok: true, servicio, fecha, empleados: resultado };
    } catch (e) {
      console.error('getDisponibilidad:', e);
      return { ok: false, error: e.message };
    }
  },

  _calcularSlots(horaInicio, horaFin, duracionServicio, reservas, cerradas, fecha) {
    const slots = [];
    const inicio = this._horaAMinutos(horaInicio);
    const fin    = this._horaAMinutos(horaFin);

    const ahora = new Date();
    const hoyStr = ahora.toISOString().split('T')[0];
    const esHoy = fecha === hoyStr;
    const minutosAhora = esHoy ? (ahora.getHours() * 60 + ahora.getMinutes()) : 0;

    for (let mins = inicio; mins < fin; mins += window.TENANT.slotMinutos) {
      const slotInicio = this._minutosAHora(mins);
      const slotFin    = this._minutosAHora(mins + duracionServicio);

      if (mins + duracionServicio > fin) break;

      if (esHoy && mins <= minutosAhora) {
        slots.push({ horaInicio: slotInicio, horaFin: slotFin, disponible: false, pasado: true });
        continue;
      }

      const ocupadoReserva = reservas.some(r => {
        const ri = this._horaAMinutos(r.hora_inicio);
        const rf = this._horaAMinutos(r.hora_fin);
        return mins < rf && (mins + duracionServicio) > ri;
      });

      const ocupadoCerrada = cerradas.some(c => {
        if (!c.hora_inicio) return false;
        const ci = this._horaAMinutos(c.hora_inicio);
        const cf = this._horaAMinutos(c.hora_fin || c.hora_inicio);
        return mins < cf && (mins + duracionServicio) > ci;
      });

      slots.push({
        horaInicio: slotInicio,
        horaFin: slotFin,
        disponible: !ocupadoReserva && !ocupadoCerrada
      });
    }
    return slots;
  },

  _horaAMinutos(hora) {
    if (!hora) return 0;
    const str = String(hora).replace(/:\d{2}$/, '');
    const [h, m] = str.split(':').map(Number);
    return h * 60 + (m || 0);
  },

  _minutosAHora(mins) {
    const h = Math.floor(mins / 60), m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  },

  // ---- CREAR RESERVA (INSERT unico, precio se toma de BD) ----
  async crearReserva(payload) {
    try {
      // Validar y sanitizar inputs
      const nombre = sanitizeStr(payload.nombre, 100);
      const email = sanitizeStr(payload.email, 200).toLowerCase();
      const telefono = sanitizeStr(payload.telefono, 20);
      const notas = sanitizeStr(payload.notas, 1000);
      const patente = sanitizeStr(payload.patente, 8).toUpperCase().replace(/[^A-Z0-9]/g, '');
      const modelo = sanitizeStr(payload.modeloVehiculo, 100);
      const retiroDir = sanitizeStr(payload.retiroDireccion, 300);

      if (!nombre || nombre.length < 2) return { ok: false, error: 'Nombre invalido (min 2 caracteres)' };
      if (!validarEmail(email)) return { ok: false, error: 'Email invalido' };
      if (telefono && !validarTelefonoChile(telefono)) return { ok: false, error: 'Telefono invalido. Formato: +56 9 XXXX XXXX' };
      if (patente && !validarPatenteChilena(patente)) return { ok: false, error: 'Patente invalida. Formato: ABCD12 o AB1234' };
      if (!payload.servicioID) return { ok: false, error: 'Servicio requerido' };
      if (!payload.empleadoID) return { ok: false, error: window.TENANT.t('profesionalCap') + ' requerido' };
      if (!payload.fecha) return { ok: false, error: 'Fecha requerida' };
      if (!payload.horaInicio) return { ok: false, error: 'Hora requerida' };

      const fechaReserva = new Date(payload.fecha + 'T' + payload.horaInicio + ':00');
      if (fechaReserva < new Date()) return { ok: false, error: 'No puedes reservar en fecha pasada' };

      // Obtener precio DESDE LA BD (nunca del frontend)
      const servicios = await this.getServicios();
      const servicio = servicios.find(s => s.id === payload.servicioID);
      if (!servicio) return { ok: false, error: 'Servicio no encontrado' };

      const empleados = await this.getEmpleados();
      const empleado = empleados.find(e => e.id === payload.empleadoID);
      if (!empleado) return { ok: false, error: window.TENANT.t('profesionalCap') + ' no encontrado' };

      if (servicio.requiereSkill && !empleado.skills.includes(servicio.requiereSkill)) {
        return { ok: false, error: 'El ' + window.TENANT.profesionalLabel + ' seleccionado no realiza este servicio' };
      }

      const horaFin = this._minutosAHora(this._horaAMinutos(payload.horaInicio) + servicio.duracion);

      // Doble check de solapamiento
      const { data: existentes } = await db
        .from('reservas')
        .select('id, hora_inicio, hora_fin')
        .eq('empleado_id', payload.empleadoID)
        .eq('fecha', payload.fecha)
        .neq('estado', window.TENANT.estados.CANCELADA);

      const nuevaInicio = this._horaAMinutos(payload.horaInicio);
      const nuevaFin = this._horaAMinutos(horaFin);
      const conflicto = (existentes || []).some(r => {
        const ei = this._horaAMinutos(r.hora_inicio);
        const ef = this._horaAMinutos(r.hora_fin);
        return nuevaInicio < ef && nuevaFin > ei;
      });
      if (conflicto) return { ok: false, error: 'El horario ya no esta disponible' };

      // PRECIO DESDE SERVICIO EN BD, no del payload
      const retiroCargo = payload.retiroDomicilio ? (window.TENANT.retiroCargo || 0) : 0;

      const reservaData = {
        nombre_cliente:   nombre,
        email:            email,
        telefono:         telefono,
        servicio_id:      servicio.id,
        servicio_nombre:  servicio.nombre,
        empleado_id:      empleado.id,
        empleado_nombre:  empleado.nombre,
        fecha:            payload.fecha,
        hora_inicio:      payload.horaInicio,
        hora_fin:         horaFin,
        duracion_min:     servicio.duracion,
        precio:           servicio.precio,    // SIEMPRE de la BD
        notas_cliente:    notas,
        sesion_num:       parseInt(payload.sesionNum) || 1,
        sesiones_totales: servicio.esSesion ? servicio.maxSesiones : 1,
        estado:           window.TENANT.estados.CONFIRMADA,
        patente:          patente,
        modelo_vehiculo:  modelo,
        kilometraje:      Math.max(0, Math.min(9999999, parseInt(payload.kilometraje) || 0)),
        retiro_domicilio: !!payload.retiroDomicilio,
        retiro_direccion: retiroDir,
        retiro_cargo:     retiroCargo
      };

      const { data, error } = await db
        .from('reservas')
        .insert(reservaData)
        .select()
        .single();

      if (error) throw error;

      // Upsert cliente CRM (fire-and-forget)
      this._upsertCliente(data).catch(() => {});

      // Notificar Apps Script (fire-and-forget)
      this._dispatchAppsScript('nuevaReserva', data);

      return { ok: true, reservaID: data.id, codigo: data.codigo, reserva: data };
    } catch (e) {
      console.error('crearReserva:', e);
      return { ok: false, error: 'Error al crear la reserva. Intenta nuevamente.' };
    }
  },

  async _upsertCliente(reserva) {
    const email = reserva.email.toLowerCase().trim();
    const { data: existente } = await db.from('clientes').select('id, total_reservas, monto_total').eq('email', email).maybeSingle();
    if (existente) {
      const total = (existente.total_reservas || 0) + 1;
      const monto = (existente.monto_total || 0) + (reserva.precio || 0);
      const etiqueta = total >= 10 ? 'VIP' : total >= 3 ? 'Frecuente' : 'Nuevo';
      await db.from('clientes').update({ total_reservas: total, monto_total: monto, etiqueta, ultima_visita: new Date().toISOString() }).eq('email', email);
      await db.from('reservas').update({ cliente_id: existente.id }).eq('id', reserva.id);
    } else {
      const { data: nuevo } = await db.from('clientes').insert({
        email, nombre: reserva.nombre_cliente, telefono: reserva.telefono || '',
        total_reservas: 1, monto_total: reserva.precio || 0, etiqueta: 'Nuevo',
        ultima_visita: new Date().toISOString()
      }).select().single();
      if (nuevo) await db.from('reservas').update({ cliente_id: nuevo.id }).eq('id', reserva.id);
    }
  },

  _validarPayload(p) {
    if (!p) return 'Datos vacios';
    if (!p.nombre || p.nombre.trim().length < 2) return 'Nombre invalido';
    if (!p.email || !validarEmail(p.email)) return 'Email invalido';
    if (!p.servicioID) return 'Servicio requerido';
    if (!p.empleadoID) return window.TENANT.t('profesionalCap') + ' requerido';
    if (!p.fecha) return 'Fecha requerida';
    if (!p.horaInicio) return 'Hora requerida';
    return null;
  },

  // ---- DISPATCH AL APPS SCRIPT (modo hibrido) ----
  _dispatchAppsScript(accion, reserva, anterior = null) {
    const url = window.TENANT.appsScriptUrl;
    if (!url || url.includes('REEMPLAZAR')) {
      console.warn('TENANT.appsScriptUrl no configurada');
      return Promise.resolve();
    }

    const body = JSON.stringify({
      accion,
      reserva,
      anterior,
      secret: window.TENANT.webhookSecret || ''
    });

    console.log('Webhook enviado: ' + accion, { reservaId: reserva?.id });

    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body,
      keepalive: true,
      mode: 'no-cors'
    }).catch(e => {
      console.warn('Apps Script dispatch fallo:', e.message);
      // Retry una vez tras 2 segundos
      setTimeout(() => {
        fetch(url, { method: 'POST', body, mode: 'no-cors', keepalive: true }).catch(() => {});
      }, 2000);
    });
  }
};

window.API = API;

// Exportar validadores para uso en index.html
window.sanitizeStr = sanitizeStr;
window.validarEmail = validarEmail;
window.validarTelefonoChile = validarTelefonoChile;
window.validarPatenteChilena = validarPatenteChilena;

console.log('Supabase + API publico listos para tenant:', window.TENANT.id);

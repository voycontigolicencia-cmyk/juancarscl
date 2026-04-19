/* ================================================================
   ERP API — VERSION PUBLICA

   Solo funciones de lectura para el cliente:
   - getEstadoActualPatente (consultar estado de su vehiculo)
   - getGarantiasPatente (consultar garantias de su vehiculo)
   - registrarEncuesta (encuesta post-servicio)

   ELIMINADO: crearGarantia, agregarRepuesto, subirFotoServicio,
   emitirDocumento, registrarGasto, crearReservaInterna, etc.
   ================================================================ */

(function(global) {
  'use strict';

  function getDb() {
    if (!global.db) throw new Error('Supabase no inicializado');
    return global.db;
  }

  // ---- ESTADO DEL VEHICULO (solo lectura) ----
  async function getEstadoActualPatente(patente, codigoReserva) {
    const db = getDb();
    try {
      const pat = sanitizeStr(patente, 8).toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!pat) return null;

      const cols = 'id, codigo, estado, servicio_nombre, empleado_nombre, fecha, hora_inicio, hora_fin, diagnostico, autorizacion_enviada, autorizado';

      let query = db.from('reservas').select(cols)
        .eq('patente', pat)
        .not('estado', 'in', '("Cancelada","No se presento")')
        .order('created_at', { ascending: false })
        .limit(1);

      if (codigoReserva) {
        const codigo = sanitizeStr(codigoReserva, 12).toUpperCase().replace(/[^A-Z0-9\-]/g, '');
        query = db.from('reservas').select(cols)
          .eq('patente', pat)
          .eq('codigo', codigo)
          .limit(1);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data?.[0] || null;
    } catch (e) {
      console.error('getEstadoActualPatente:', e);
      return null;
    }
  }

  // ---- GARANTIAS (solo lectura) ----
  async function getGarantiasPatente(patente) {
    const db = getDb();
    try {
      const pat = sanitizeStr(patente, 8).toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!pat) return [];

      const { data, error } = await db
        .from('garantias')
        .select('id, patente, descripcion, meses, fecha_inicio, fecha_fin, condiciones, reserva_id')
        .eq('patente', pat)
        .order('fecha_inicio', { ascending: false });

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist') || error.status === 404) {
          return [];
        }
        throw error;
      }

      const hoy = new Date().toISOString().split('T')[0];
      return (data || []).map(g => ({
        ...g,
        estado: g.fecha_fin && g.fecha_fin >= hoy ? 'Vigente' : 'Vencida'
      }));
    } catch (e) {
      console.error('getGarantiasPatente:', e);
      return [];
    }
  }

  // ---- ENCUESTA DE SATISFACCION (solo INSERT) ----
  async function registrarEncuesta({ reservaId, clienteId, patente, respuesta, comentario }) {
    const db = getDb();
    try {
      if (!reservaId || !respuesta) throw new Error('Datos incompletos');

      // Verificar que no haya encuesta previa
      const { data: existe } = await db
        .from('encuestas_satisfaccion')
        .select('id')
        .eq('reserva_id', reservaId)
        .limit(1)
        .maybeSingle();  // maybeSingle en vez de single (evita 406)

      if (existe) return { ya_respondida: true };

      const { data, error } = await db
        .from('encuestas_satisfaccion')
        .insert({
          reserva_id: reservaId,
          cliente_id: clienteId || null,
          patente:    sanitizeStr(patente, 8).toUpperCase().replace(/[^A-Z0-9]/g, ''),
          respuesta:  respuesta === 'positivo' ? 'positivo' : 'negativo',
          comentario: sanitizeStr(comentario, 500),
          respondido_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (e) {
      if (e.code === 'PGRST116') return { ya_respondida: true };
      console.error('registrarEncuesta:', e);
      throw e;
    }
  }

  // ---- HISTORIAL POR PATENTE (solo lectura) ----
  async function getHistorialPatente(patente) {
    const db = getDb();
    try {
      const pat = sanitizeStr(patente, 8).toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!pat) return [];

      const { data, error } = await db
        .from('reservas')
        .select('id, codigo, servicio_nombre, empleado_nombre, fecha, hora_inicio, estado, diagnostico')
        .eq('patente', pat)
        .order('fecha', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error('getHistorialPatente:', e);
      return [];
    }
  }

  // ---- EXPORT ----
  global.ERP = {
    getEstadoActualPatente,
    getGarantiasPatente,
    getHistorialPatente,
    registrarEncuesta
  };

  console.log('erp-api.js publico cargado.');
})(window);

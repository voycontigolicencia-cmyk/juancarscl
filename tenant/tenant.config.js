/* ================================================================
   PLATAFORMA AGENDA — tenant.config.js (VERSION PUBLICA)

   SIN adminToken, SIN webhookSecret, SIN appsScriptUrl.
   Solo datos necesarios para el booking publico.
   ================================================================ */

window.TENANT = {

  // -- IDENTIDAD --
  id:           'taller-mecanico',
  nombre:       'Taller Mecanico Pro',
  razonSocial:  'Taller Mecanico Pro SpA',

  // -- TIPO DE NEGOCIO --
  tipo:                   'taller_mecanico',
  profesionalLabel:       'mecanico',
  profesionalLabelPlural: 'mecanicos',
  servicioLabel:          'servicio',
  servicioLabelPlural:    'servicios',

  // -- CONTACTO Y MARCA (datos publicos) --
  email:        'voycontigo.licencia@gmail.com',
  telefono:     '+56 9 9514 8887',
  direccion:    'Santiago concha 1830, Santiago',
  ciudad:       'Santiago',
  pais:         'Chile',
  horarioPublico: 'Lun-Sab: 9:00 - 20:00',

  whatsapp:     'https://wa.me/56995148887',
  instagram:    'https://www.instagram.com/electromecanicajuancars?igsh=MTN2cGJsMXlvZ2I5',
  mapsUrl:      'https://maps.app.goo.gl/swEvfY5qe6uz4FAr6',
  lat:          -33.4690056,
  lng:          -70.6372465,

  logoUrl:      'https://res.cloudinary.com/dzrsht5kg/image/upload/v1776280434/juancars_saf4ux.png',

  // Paleta visual
  colorPrimario:    '#E05C1A',
  colorSecundario:  '#0F1218',
  colorAcento:      '#22C55E',

  // -- HORARIOS DEL NEGOCIO --
  timezone:       'America/Santiago',
  horaApertura:   9,
  horaCierre:     20,
  slotMinutos:    15,
  diasOperacion:  [1, 2, 3, 4, 5, 6],

  // -- ESTADOS DE RESERVA --
  estados: {
    PENDIENTE:   'Pendiente',
    CONFIRMADA:  'Confirmada',
    EN_CURSO:    'En curso',
    COMPLETADA:  'Completada',
    CANCELADA:   'Cancelada',
    NO_SHOW:     'No se presento'
  },

  // -- METODOS DE PAGO --
  metodosPago: [
    { id: 'efectivo',      nombre: 'Efectivo',      icono: '...' },
    { id: 'debito',        nombre: 'Debito',        icono: '...' },
    { id: 'credito',       nombre: 'Credito',       icono: '...' },
    { id: 'transferencia', nombre: 'Transferencia', icono: '...' },
    { id: 'mercadopago',   nombre: 'MercadoPago',   icono: '...' }
  ],

  // -- TALLER MECANICO --
  retiroCargo:    15000,
  retiroLabel:    'Retiro y entrega a domicilio',

  // -- INTEGRACIONES (necesarias para notificaciones al crear reserva) --
  appsScriptUrl:  'https://script.google.com/macros/s/AKfycbxKy-acwQAGqd3TASb1O22fwgSVcKCZyym-GqRHhvMOKloNA9vUKA6Spi_yqar01DxrLA/exec',
  appsScriptMode: 'hybrid',
  webhookSecret:  'Javiteamo'

  // NO hay adminToken
  // NO hay adminEmails
};

// -- HELPER: vocabulario contextual --
window.TENANT.t = function(clave) {
  const map = {
    profesional:        this.profesionalLabel,
    profesionales:      this.profesionalLabelPlural,
    profesionalCap:     this.profesionalLabel.charAt(0).toUpperCase() + this.profesionalLabel.slice(1),
    profesionalesCap:   this.profesionalLabelPlural.charAt(0).toUpperCase() + this.profesionalLabelPlural.slice(1),
    servicio:           this.servicioLabel,
    servicios:          this.servicioLabelPlural
  };
  return map[clave] || clave;
};

// Aplica variables CSS de marca al cargar
(function aplicarBranding() {
  const root = document.documentElement;
  root.style.setProperty('--color-primario',    window.TENANT.colorPrimario);
  root.style.setProperty('--color-secundario',  window.TENANT.colorSecundario);
  root.style.setProperty('--color-acento',      window.TENANT.colorAcento);
  document.title = window.TENANT.nombre;
})();

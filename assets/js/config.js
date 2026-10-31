/* =====================================================================
   CONFIGURACIÓN DE LA WEB — Minimarket La Prensa
   Este es el único archivo de código que normalmente tendrás que tocar.
   ===================================================================== */
window.LA_PRENSA_CONFIG = {
  /* De dónde se lee el catálogo.
     - Por defecto: el archivo data/catalogo.csv de este repositorio.
     - Si prefieres usar una Hoja de cálculo de Google, publícala como CSV
       (Archivo > Compartir > Publicar en la Web > CSV) y pega aquí la URL. */
  catalogoUrl: 'data/catalogo.csv',

  /* Clave de Web3Forms: las reservas llegan por correo a la cuenta
     asociada a esta clave. */
  web3formsKey: 'e2390145-9940-473c-a70a-e7632bccad72',

  telefono: '954 15 25 54',

  /* Horario de apertura. 0 = domingo, 1 = lunes … 6 = sábado.
     Se usa para el aviso "Abierto ahora" y para los días de recogida. */
  horario: {
    0: [['09:00', '15:00']],
    1: [['08:30', '15:00'], ['18:00', '21:00']],
    2: [['08:30', '15:00'], ['18:00', '21:00']],
    3: [['08:30', '15:00'], ['18:00', '21:00']],
    4: [['08:30', '15:00'], ['18:00', '21:00']],
    5: [['08:30', '15:00'], ['18:00', '21:00']],
    6: [['08:30', '15:00']]
  },

  /* Días de recogida que se ofrecen en el formulario. */
  diasRecogida: 7
};

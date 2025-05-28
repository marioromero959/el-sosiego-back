/**
 * Custom reservation routes
 */

export default {
    routes: [
      // Verificar disponibilidad
      {
        method: 'POST',
        path: '/reservations/check-availability',
        handler: 'reservation.checkAvailability',
        config: {
          auth: false,
          policies: [],
          middlewares: [],
        },
      },
      // Buscar por código de confirmación
      {
        method: 'GET',
        path: '/reservations/by-code/:confirmationCode',
        handler: 'reservation.findByConfirmationCode',
        config: {
          auth: false,
          policies: [],
          middlewares: [],
        },
      },
      // Obtener por estado
      {
        method: 'GET',
        path: '/reservations/by-status/:status',
        handler: 'reservation.findByStatus',
        config: {
          auth: false, // Cambiar a true en producción si quieres que sea privado
          policies: [],
          middlewares: [],
        },
      },
      // Estadísticas (para admin)
      {
        method: 'GET',
        path: '/reservations/stats',
        handler: 'reservation.getStats',
        config: {
          auth: false, // Cambiar a true en producción
          policies: [],
          middlewares: [],
        },
      },
      // Reservas próximas a vencer
      {
        method: 'GET',
        path: '/reservations/expiring',
        handler: 'reservation.getExpiring',
        config: {
          auth: false, // Cambiar a true en producción
          policies: [],
          middlewares: [],
        },
      },
      // Cancelar expiradas (para admin)
      {
        method: 'POST',
        path: '/reservations/cancel-expired',
        handler: 'reservation.cancelExpired',
        config: {
          auth: false, // Cambiar a true en producción
          policies: [],
          middlewares: [],
        },
      },
    ],
  };
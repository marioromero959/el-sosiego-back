/**
 * reservation router
 */

export default {
    routes: [
      // 🔥 RUTAS ESPECÍFICAS PRIMERO (antes de las rutas con :id genérico)
      
      // Test email
      {
        method: 'POST',
        path: '/reservations/test-email',
        handler: 'reservation.testEmail',
        config: {
          policies: [],
          middlewares: [],
        },
      },
      
      // Verificar disponibilidad
      {
        method: 'POST',
        path: '/reservations/check-availability',
        handler: 'reservation.checkAvailability',
        config: {
          policies: [],
          middlewares: [],
        },
      },
      
      // Obtener estadísticas
      {
        method: 'GET',
        path: '/reservations/stats',
        handler: 'reservation.getStats',
        config: {
          policies: [],
          middlewares: [],
        },
      },
      
      // Obtener reservas próximas a vencer
      {
        method: 'GET',
        path: '/reservations/expiring',
        handler: 'reservation.getExpiring',
        config: {
          policies: [],
          middlewares: [],
        },
      },
      
      // Cancelar reservas expiradas
      {
        method: 'POST',
        path: '/reservations/cancel-expired',
        handler: 'reservation.cancelExpired',
        config: {
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
          policies: [],
          middlewares: [],
        },
      },
      
      // Obtener reservas por estado
      {
        method: 'GET',
        path: '/reservations/status/:status',
        handler: 'reservation.findByStatus',
        config: {
          policies: [],
          middlewares: [],
        },
      },
      
      // 🔥 Rutas CRUD estándar (AL FINAL)
      {
        method: 'GET',
        path: '/reservations',
        handler: 'reservation.find',
        config: {
          policies: [],
          middlewares: [],
        },
      },
      {
        method: 'POST',
        path: '/reservations',
        handler: 'reservation.create',
        config: {
          policies: [],
          middlewares: [],
        },
      },
      {
        method: 'GET',
        path: '/reservations/:id',
        handler: 'reservation.findOne',
        config: {
          policies: [],
          middlewares: [],
        },
      },
      {
        method: 'PUT',
        path: '/reservations/:id',
        handler: 'reservation.update',
        config: {
          policies: [],
          middlewares: [],
        },
      },
      {
        method: 'DELETE',
        path: '/reservations/:id',
        handler: 'reservation.delete',
        config: {
          policies: [],
          middlewares: [],
        },
      },
    ],
  };
// src/api/payment/routes/payment.ts

export default {
  routes: [
    // ✅ NUEVO: Crear preferencia de Checkout Pro
    {
      method: 'POST',
      path: '/payments/create-preference',
      handler: 'payment.createPreference',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    // ✅ NUEVO: Webhook para notificaciones de MercadoPago
    {
      method: 'POST',
      path: '/payments/webhook',
      handler: 'payment.webhook',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    // ✅ NUEVO: Verificar estado de pago
    {
      method: 'GET',
      path: '/payments/verify/:preferenceId',
      handler: 'payment.verifyPayment',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    // ✅ MANTENER: Obtener configuración
    {
      method: 'GET',
      path: '/payments/config',
      handler: 'payment.getConfig',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    // ✅ MANTENER: Estado de reserva
    {
      method: 'GET',
      path: '/reservations/status/:confirmationCode',
      handler: 'payment.getReservationStatus',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    }
  ],
};
/**
 * Custom reservation routes (emails y acciones específicas)
 */

export default {
  routes: [
    // 🆕 Test de email (verifica configuración SMTP)
    {
      method: 'GET',
      path: '/reservations/test-smtp',
      handler: 'reservation.testSMTP',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    // 🆕 Enviar email de confirmación (recibe ID en el body)
    {
      method: 'POST',
      path: '/reservations/send-confirmation-email',
      handler: 'reservation.sendConfirmationEmail',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    // 🆕 Enviar email de confirmación (ID en la URL)
    {
      method: 'POST',
      path: '/reservations/:id/send-confirmation',
      handler: 'reservation.sendConfirmationEmail',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};

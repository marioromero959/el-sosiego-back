/**
 * Custom reservation routes (emails y acciones específicas)
 */

export default {
  routes: [
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
  ],
};

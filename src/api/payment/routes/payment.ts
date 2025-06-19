// src/api/payment/routes/payment.ts

export default {
  routes: [
    {
      method: 'POST',
      path: '/payments/payment',
      handler: 'payment.processPayment',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
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
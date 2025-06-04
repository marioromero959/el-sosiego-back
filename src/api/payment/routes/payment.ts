// src/api/payment/routes/payment.ts

export default {
  routes: [
    {
      method: 'POST',
      path: '/payments/direct-payment',
      handler: 'payment.processDirectPayment',
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
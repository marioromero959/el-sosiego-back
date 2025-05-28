'use strict';

module.exports = {
  routes: [
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
    {
      method: 'GET',
      path: '/payments/status/:paymentId',
      handler: 'payment.getPaymentStatus',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};
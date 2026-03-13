// Public GET-only route for booking settings (read by frontend)
export default {
  routes: [
    {
      method: 'GET',
      path: '/booking-setting',
      handler: 'booking-setting.find',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};

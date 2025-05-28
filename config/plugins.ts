export default ({ env }) => ({
    'users-permissions': {
      config: {
        jwt: {
          expiresIn: '7d',
        },
      },
    },
    documentation: {
      enabled: true,
      config: {
        openapi: '3.0.0',
        info: {
          version: '1.0.0',
          title: 'Casa de Campo API',
          description: 'API para sistema de reservas',
        },
      },
    },
  });
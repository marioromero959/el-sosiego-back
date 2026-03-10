// import type { Core } from '@strapi/strapi';

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  bootstrap({ strapi }) {
    // Health check endpoint para monitoring (UptimeRobot, etc.)
    strapi.server.router.get('/health', (ctx) => {
      ctx.status = 200;
      ctx.body = { 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        service: 'casa-campo-backend'
      };
    });

    strapi.server.router.get('/_health', (ctx) => {
      ctx.status = 200;
      ctx.body = { 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        service: 'casa-campo-backend'
      };
    });
  },
};

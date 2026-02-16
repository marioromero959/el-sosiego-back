// src/api/health/controllers/health.ts
export default {
  async check(ctx: any) {
    ctx.body = { 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    };
  },
};

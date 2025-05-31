/**
 * reservation controller
 */

import { factories } from '@strapi/strapi';

// Interface para los datos de disponibilidad
interface AvailabilityRequest {
  checkIn: string;
  checkOut: string;
}

export default factories.createCoreController('api::reservation.reservation', ({ strapi }) => ({
  
  // Override del create para añadir validaciones
  async create(ctx) {
    try {
      const { data } = ctx.request.body;

      // Validar datos usando el servicio
      const reservationService = strapi.service('api::reservation.reservation');
      const validation = reservationService.validateReservationData(data);

      if (!validation.isValid) {
        return ctx.badRequest('Datos de reserva inválidos', { errors: validation.errors });
      }

      // Validar disponibilidad antes de crear
      const isAvailable = await reservationService.checkAvailability(data.checkIn, data.checkOut);

      if (!isAvailable) {
        return ctx.badRequest('Las fechas seleccionadas no están disponibles');
      }

      // Crear la reserva (el servicio se encargará de generar el código y enviar email)
      const result = await super.create(ctx);

      return result;
    } catch (error) {
      console.error('Error creating reservation:', error);
      return ctx.internalServerError(`Error al crear la reserva: ${error.message}`);
    }
  },

  // 🆕 Verificar disponibilidad
  async checkAvailability(ctx) {
    try {
      const { checkIn, checkOut }: AvailabilityRequest = ctx.request.body;

      if (!checkIn || !checkOut) {
        return ctx.badRequest('checkIn y checkOut son requeridos');
      }

      const checkInDate = new Date(checkIn);
      const checkOutDate = new Date(checkOut);
      const now = new Date();

      // Validaciones básicas
      if (checkInDate < now) {
        return ctx.badRequest('La fecha de entrada no puede ser en el pasado');
      }

      if (checkOutDate <= checkInDate) {
        return ctx.badRequest('La fecha de salida debe ser posterior a la fecha de entrada');
      }

      const reservationService = strapi.service('api::reservation.reservation');
      const isAvailable = await reservationService.checkAvailability(checkIn, checkOut);

      return {
        data: {
          available: isAvailable,
          checkIn,
          checkOut,
          message: isAvailable ? 'Fechas disponibles' : 'Fechas no disponibles'
        }
      };
    } catch (error) {
      console.error('Error checking availability:', error);
      return ctx.internalServerError('Error al verificar disponibilidad');
    }
  },

  // 🆕 Buscar por código de confirmación
  async findByConfirmationCode(ctx) {
    try {
      const { confirmationCode } = ctx.params;

      if (!confirmationCode) {
        return ctx.badRequest('Código de confirmación es requerido');
      }

      const reservationService = strapi.service('api::reservation.reservation');
      const reservation = await reservationService.findByConfirmationCode(confirmationCode);

      if (!reservation) {
        return ctx.notFound('Reserva no encontrada');
      }

      return { data: reservation };
    } catch (error) {
      console.error('Error finding reservation by code:', error);
      return ctx.internalServerError('Error al buscar la reserva');
    }
  },

  // 🆕 Obtener reservas por estado
  async findByStatus(ctx) {
    try {
      const { status } = ctx.params;

      const validStatuses = ['pending', 'confirmed', 'paid', 'cancelled', 'completed'];
      if (!validStatuses.includes(status)) {
        return ctx.badRequest(`Estado inválido. Debe ser uno de: ${validStatuses.join(', ')}`);
      }

      const reservationService = strapi.service('api::reservation.reservation');
      const reservations = await reservationService.findByStatus(status as any);

      return { data: reservations };
    } catch (error) {
      console.error('Error finding reservations by status:', error);
      return ctx.internalServerError('Error al buscar reservas por estado');
    }
  },

  // 🆕 Obtener estadísticas de reservas
  async getStats(ctx) {
    try {
      const reservationService = strapi.service('api::reservation.reservation');
      const stats = await reservationService.getReservationStats();

      return { data: stats };
    } catch (error) {
      console.error('Error getting reservation stats:', error);
      return ctx.internalServerError('Error al obtener estadísticas');
    }
  },

  // 🆕 Obtener reservas próximas a vencer
  async getExpiring(ctx) {
    try {
      const { hours = 24 } = ctx.query;
      
      const reservationService = strapi.service('api::reservation.reservation');
      const expiring = await reservationService.getExpiringReservations(Number(hours));

      return { 
        data: expiring,
        meta: {
          count: expiring.length,
          hoursBeforeExpiration: Number(hours)
        }
      };
    } catch (error) {
      console.error('Error getting expiring reservations:', error);
      return ctx.internalServerError('Error al obtener reservas próximas a vencer');
    }
  },

  // 🆕 Cancelar reservas expiradas (endpoint administrativo)
  async cancelExpired(ctx) {
    try {
      const reservationService = strapi.service('api::reservation.reservation');
      const cancelledCount = await reservationService.cancelExpiredReservations();

      return { 
        data: {
          message: `${cancelledCount} reservas canceladas`,
          cancelledCount
        }
      };
    } catch (error) {
      console.error('Error cancelling expired reservations:', error);
      return ctx.internalServerError('Error al cancelar reservas expiradas');
    }
  },

  // 🆕 Enviar email de confirmación manualmente
  async sendConfirmationEmail(ctx) {
    try {
      const { id } = ctx.params;
      
      const reservationService = strapi.service('api::reservation.reservation');
      const emailSent = await reservationService.sendConfirmationEmail(id);
      
      if (emailSent) {
        return { data: { message: 'Email de confirmación enviado exitosamente' } };
      } else {
        return ctx.badRequest('Error al enviar el email de confirmación');
      }
    } catch (error) {
      console.error('Error sending confirmation email:', error);
      return ctx.internalServerError('Error al enviar email de confirmación');
    }
  },

  // 🆕 Enviar recordatorio de pago
  async sendPaymentReminder(ctx) {
    try {
      const { id } = ctx.params;
      
      const reservationService = strapi.service('api::reservation.reservation');
      const emailSent = await reservationService.sendPaymentReminder(id);
      
      if (emailSent) {
        return { data: { message: 'Recordatorio de pago enviado exitosamente' } };
      } else {
        return ctx.badRequest('Error al enviar el recordatorio de pago');
      }
    } catch (error) {
      console.error('Error sending payment reminder:', error);
      return ctx.internalServerError('Error al enviar recordatorio de pago');
    }
  },

  // 🆕 Endpoint de testing de email
  async testEmail(ctx) {
    try {
      console.log('🧪 Testing email service...');
      
      // Datos de prueba
      const testData = {
        confirmationCode: 'ES123TEST',
        guestName: 'Usuario de Prueba',
        guestEmail: 'tu-email@gmail.com', // 🚨 CAMBIA ESTO
        guestPhone: '+54 11 1234-5678',
        checkIn: new Date(),
        checkOut: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        guests: 2,
        totalAmount: 15000,
        specialRequests: 'Esta es una prueba'
      };
      
      // Importar servicio de email
      const emailService = require('../../../services/email.service').default;
      
      // Generar template
      const template = emailService.getReservationConfirmationTemplate(testData);
      
      // Enviar email
      const result = await emailService.sendEmail({
        to: testData.guestEmail,
        template,
      });
      
      return { 
        data: { 
          message: result ? 'Email enviado exitosamente' : 'Error al enviar email',
          emailSent: result,
          testData: {
            to: testData.guestEmail,
            confirmationCode: testData.confirmationCode
          }
        } 
      };
    } catch (error) {
      console.error('❌ Error in test:', error);
      return ctx.internalServerError(`Error: ${error.message}`);
    }
  },

  // Override del update para validaciones adicionales
  async update(ctx) {
    try {
      const { id } = ctx.params;
      const { data } = ctx.request.body;

      // Si se están actualizando las fechas, verificar disponibilidad
      if (data.checkIn || data.checkOut) {
        const currentReservation = await strapi.entityService.findOne('api::reservation.reservation', id);
        
        if (!currentReservation) {
          return ctx.notFound('Reserva no encontrada');
        }

        const checkIn = data.checkIn || currentReservation.checkIn;
        const checkOut = data.checkOut || currentReservation.checkOut;

        // Validar disponibilidad excluyendo la reserva actual
        const conflictingReservations = await strapi.entityService.findMany(
          'api::reservation.reservation',
          {
            filters: {
              $and: [
                { id: { $ne: id } }, // Excluir la reserva actual
                {
                  $or: [
                    {
                      $and: [
                        { checkIn: { $lte: checkOut } },
                        { checkOut: { $gte: checkIn } }
                      ]
                    }
                  ]
                },
                {
                  statusReservation: {
                    $in: ['confirmed', 'paid'],
                  },
                },
              ],
            },
          }
        );

        if (conflictingReservations.length > 0) {
          return ctx.badRequest('Las fechas seleccionadas entran en conflicto con otra reserva');
        }
      }

      const result = await super.update(ctx);
      return result;
    } catch (error) {
      console.error('Error updating reservation:', error);
      return ctx.internalServerError(`Error al actualizar la reserva: ${error.message}`);
    }
  }
}));
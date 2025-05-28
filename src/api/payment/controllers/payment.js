'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const mercadoPagoService = require('../services/mercadopago');

module.exports = createCoreController('api::payment.payment', ({ strapi }) => ({
  // Crear preferencia de pago
  async createPreference(ctx) {
    try {
      const { reservationId } = ctx.request.body;

      if (!reservationId) {
        return ctx.badRequest('ID de reserva es requerido');
      }

      // Obtener datos de la reserva
      const reservation = await strapi.entityService.findOne('api::reservation.reservation', reservationId);

      if (!reservation) {
        return ctx.notFound('Reserva no encontrada');
      }

      if (reservation.paymentStatus === 'paid') {
        return ctx.badRequest('Esta reserva ya ha sido pagada');
      }

      console.log('Creating preference for reservation:', reservation.id);

      // Crear preferencia en Mercado Pago
      const preference = await mercadoPagoService.createPreference(reservation);

      console.log('Preference created:', preference.id);

      // Guardar información del pago
      const payment = await strapi.entityService.create('api::payment.payment', {
        data: {
          amount: reservation.totalPrice,
          currency: 'ARS',
          status: 'pending',
          mercadoPagoId: preference.id,
          transactionDetails: {
            preferenceId: preference.id,
            initPoint: preference.init_point,
            sandboxInitPoint: preference.sandbox_init_point
          }
        }
      });

      return {
        data: {
          preferenceId: preference.id,
          initPoint: preference.init_point,
          sandboxInitPoint: preference.sandbox_init_point,
          publicKey: process.env.MERCADO_PAGO_PUBLIC_KEY,
          paymentId: payment.id
        }
      };
    } catch (error) {
      console.error('Error creating payment preference:', error);
      return ctx.internalServerError('Error al crear preferencia de pago: ' + error.message);
    }
  },

  // Webhook de Mercado Pago
  async webhook(ctx) {
    try {
      const webhookData = ctx.request.body;
      console.log('Webhook received:', JSON.stringify(webhookData, null, 2));

      // Procesar webhook
      const paymentInfo = await mercadoPagoService.processWebhook(webhookData);
      
      if (!paymentInfo) {
        console.log('Webhook processed but no action needed');
        return ctx.ok('Webhook processed but no action needed');
      }

      console.log('Payment info:', paymentInfo);

      // Buscar la reserva
      const reservations = await strapi.entityService.findMany('api::reservation.reservation', {
        filters: { id: paymentInfo.externalReference }
      });

      if (!reservations || reservations.length === 0) {
        console.error('Reservation not found for external reference:', paymentInfo.externalReference);
        return ctx.notFound('Reserva no encontrada');
      }

      const reservation = reservations[0];

      // Actualizar estado según el pago
      let reservationStatus = reservation.status;
      let paymentStatus = 'pending';

      switch (paymentInfo.status) {
        case 'approved':
          reservationStatus = 'confirmed';
          paymentStatus = 'paid';
          console.log('Payment approved, updating reservation to confirmed');
          break;
        case 'rejected':
        case 'cancelled':
          paymentStatus = 'failed';
          console.log('Payment failed or cancelled');
          break;
        case 'in_process':
          paymentStatus = 'processing';
          console.log('Payment in process');
          break;
        default:
          paymentStatus = 'pending';
          console.log('Payment pending');
      }

      // Actualizar reserva
      await strapi.entityService.update('api::reservation.reservation', reservation.id, {
        data: {
          status: reservationStatus,
          paymentStatus: paymentStatus,
          mercadoPagoId: paymentInfo.paymentId.toString()
        }
      });

      console.log(`Reservation ${reservation.id} updated with status: ${reservationStatus}, payment: ${paymentStatus}`);

      return ctx.ok('Webhook processed successfully');
    } catch (error) {
      console.error('Error processing webhook:', error);
      return ctx.internalServerError('Error al procesar webhook: ' + error.message);
    }
  },

  // Obtener estado de pago
  async getPaymentStatus(ctx) {
    try {
      const { paymentId } = ctx.params;

      const payments = await strapi.entityService.findMany('api::payment.payment', {
        filters: { mercadoPagoId: paymentId }
      });

      if (!payments || payments.length === 0) {
        return ctx.notFound('Pago no encontrado');
      }

      return { data: payments[0] };
    } catch (error) {
      console.error('Error getting payment status:', error);
      return ctx.internalServerError('Error al obtener estado del pago');
    }
  }
}));
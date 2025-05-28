/**
 * payment controller
 */

import { factories } from '@strapi/strapi';

// Interfaces para tipado
interface Reservation {
  id: number;
  checkIn: string;
  checkOut: string;
  guests: number;
  name: string;
  email: string;
  phone: string;
  totalPrice: number;
  statusReservation?: 'pending' | 'confirmed' | 'paid' | 'cancelled' | 'completed';
  paymentStatus?: 'pending' | 'processing' | 'paid' | 'failed' | 'refunded';
  confirmationCode?: string;
  mercadoPagoId?: string;
}

interface PaymentInfo {
  paymentId: number;
  status: string;
  statusDetail: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  paymentType: string;
  externalReference: string;
  transactionDetails: any;
  payer: any;
  dateCreated: string;
  dateApproved: string;
}

export default factories.createCoreController('api::payment.payment', ({ strapi }) => ({
  // Crear preferencia de pago
  async createPreference(ctx) {
    try {
      const { reservationId } = ctx.request.body;

      if (!reservationId) {
        return ctx.badRequest('ID de reserva es requerido');
      }

      // Obtener datos de la reserva
      const reservation = await strapi.entityService.findOne('api::reservation.reservation', reservationId) as Reservation;

      if (!reservation) {
        return ctx.notFound('Reserva no encontrada');
      }

      if (reservation.paymentStatus === 'paid') {
        return ctx.badRequest('Esta reserva ya ha sido pagada');
      }

      // Verificar que la reserva no esté vencida
      const now = new Date();
      const checkInDate = new Date(reservation.checkIn);
      if (checkInDate < now) {
        return ctx.badRequest('No se puede pagar una reserva con fecha pasada');
      }

      console.log('Creating preference for reservation:', reservation.id);

      // Crear preferencia en Mercado Pago
      const mercadoPagoService = strapi.service('api::payment.mercadopago');
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
            sandboxInitPoint: preference.sandbox_init_point,
            reservationId: reservation.id,
            createdAt: new Date().toISOString()
          }
        }
      });

      return {
        data: {
          preferenceId: preference.id,
          initPoint: preference.init_point,
          sandboxInitPoint: preference.sandbox_init_point,
          publicKey: process.env.MERCADO_PAGO_PUBLIC_KEY,
          paymentId: payment.id,
          reservation: {
            id: reservation.id,
            confirmationCode: reservation.confirmationCode,
            totalPrice: reservation.totalPrice
          }
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
      const mercadoPagoService = strapi.service('api::payment.mercadopago');
      const paymentInfo: PaymentInfo | null = await mercadoPagoService.processWebhook(webhookData);
      
      if (!paymentInfo) {
        console.log('Webhook processed but no action needed');
        return ctx.ok('Webhook processed but no action needed');
      }

      console.log('Payment info:', paymentInfo);

      // Buscar la reserva
      const reservation = await strapi.entityService.findOne(
        'api::reservation.reservation', 
        paymentInfo.externalReference
      ) as Reservation;

      if (!reservation) {
        console.error('Reservation not found for external reference:', paymentInfo.externalReference);
        return ctx.notFound('Reserva no encontrada');
      }

      // Actualizar estado según el pago
      let reservationStatus: Reservation['statusReservation'] = reservation.statusReservation;
      let paymentStatus: Reservation['paymentStatus'] = 'pending';

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

      // Actualizar reserva - CORREGIDO: usar statusReservation en lugar de status
      await strapi.entityService.update('api::reservation.reservation', reservation.id, {
        data: {
          statusReservation: reservationStatus,
          paymentStatus: paymentStatus,
          mercadoPagoId: paymentInfo.paymentId.toString()
        }
      });

      // Actualizar registro de pago
      const payments = await strapi.entityService.findMany('api::payment.payment', {
        filters: { mercadoPagoId: paymentInfo.paymentId.toString() }
      });

      if (payments.length > 0) {
        await strapi.entityService.update('api::payment.payment', payments[0].id, {
          data: {
            statusPayment: paymentInfo.status,
            paymentMethod: paymentInfo.paymentMethod,
            paymentType: paymentInfo.paymentType,
            webhookData: webhookData
          }
        });
      }

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
  },

  // Obtener estado de reserva por código de confirmación
  async getReservationStatus(ctx) {
    try {
      const { confirmationCode } = ctx.params;

      const reservations = await strapi.entityService.findMany('api::reservation.reservation', {
        filters: { confirmationCode }
      });

      if (!reservations || reservations.length === 0) {
        return ctx.notFound('Reserva no encontrada');
      }

      const reservation = reservations[0] as Reservation;
      
      return {
        data: {
          id: reservation.id,
          confirmationCode: reservation.confirmationCode,
          statusReservation: reservation.statusReservation,
          paymentStatus: reservation.paymentStatus,
          checkIn: reservation.checkIn,
          checkOut: reservation.checkOut,
          totalPrice: reservation.totalPrice,
          name: reservation.name,
          email: reservation.email,
          guests: reservation.guests
        }
      };
    } catch (error) {
      console.error('Error getting reservation status:', error);
      return ctx.internalServerError('Error al obtener estado de la reserva');
    }
  }
}));
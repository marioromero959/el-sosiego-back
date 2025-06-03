/**
 * payment controller
 */

import { factories } from '@strapi/strapi';

// Interfaces para tipado
interface ReservationData {
  checkIn: string;
  checkOut: string;
  guests: number;
  name: string;
  email: string;
  phone: string;
  totalAmount: number;
  specialRequests?: string;
}

interface PaymentTransactionDetails {
  preferenceId: string;
  initPoint: string;
  sandboxInitPoint: string;
  tempId: string;
  reservationData: ReservationData;
  description: string;
  customerEmail: string;
  createdAt: string;
}

interface StrapiPayment {
  id: number;
  amount: number;
  currency: string;
  status: string;
  mercadoPagoId: string;
  transactionDetails: Record<string, any>;
  statusPayment?: string;
  paymentMethod?: string;
  paymentType?: string;
  webhookData?: any;
  reservation?: number;
}

interface PaymentEntity {
  id: number;
  amount: number;
  currency: string;
  status: string;
  mercadoPagoId: string;
  transactionDetails: PaymentTransactionDetails;
}

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
  specialRequests?: string;
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
      const { 
        customerEmail, 
        description, 
        reservationData 
      } = ctx.request.body;

      if (!reservationData || !customerEmail) {
        return ctx.badRequest('Datos de reserva y email son requeridos');
      }

      // Verificar que la fecha no sea pasada
      const now = new Date();
      const checkInDate = new Date(reservationData.checkIn);
      if (checkInDate < now) {
        return ctx.badRequest('No se puede realizar una reserva con fecha pasada');
      }

      console.log('Creating payment preference for:', customerEmail);

      // Generar un ID temporal para la reserva pendiente
      const tempId = Date.now().toString();

      // Crear preferencia en Mercado Pago con datos temporales
      const mercadoPagoService = strapi.service('api::payment.mercadopago');
      const preference = await mercadoPagoService.createPreference({
        ...reservationData,
        id: tempId,
        totalPrice: reservationData.totalAmount,
        description: description
      });

      console.log('Preference created:', preference.id);

      // Guardar información del pago pendiente
      const payment = await strapi.entityService.create('api::payment.payment', {
        data: {
          amount: reservationData.totalAmount,
          currency: 'ARS',
          status: 'pending',
          mercadoPagoId: preference.id,
          transactionDetails: {
            preferenceId: preference.id,
            initPoint: preference.init_point,
            sandboxInitPoint: preference.sandbox_init_point,
            tempId: tempId,
            reservationData: reservationData,
            description: description,
            customerEmail: customerEmail,
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
      const mercadoPagoService = strapi.service('api::payment.mercadopago');
      const paymentInfo: PaymentInfo | null = await mercadoPagoService.processWebhook(webhookData);
      
      if (!paymentInfo) {
        console.log('Webhook processed but no action needed');
        return ctx.ok('Webhook processed but no action needed');
      }

      console.log('Payment info:', paymentInfo);

      // Buscar el pago en nuestra base de datos
      const payments = await strapi.entityService.findMany('api::payment.payment', {
        filters: { mercadoPagoId: paymentInfo.paymentId.toString() }
      });

      if (!payments || payments.length === 0) {
        console.error('Payment not found:', paymentInfo.paymentId);
        return ctx.notFound('Pago no encontrado');
      }

      const payment = payments[0] as StrapiPayment;
      const transactionDetails = payment.transactionDetails as PaymentTransactionDetails;
      const { reservationData, tempId } = transactionDetails;

      // Si el pago fue aprobado, crear la reserva
      if (paymentInfo.status === 'approved') {
        console.log('Payment approved, creating reservation');

        // Crear la reserva
        const reservation = await strapi.entityService.create('api::reservation.reservation', {
          data: {
            checkIn: reservationData.checkIn,
            checkOut: reservationData.checkOut,
            guests: reservationData.guests,
            name: reservationData.name,
            email: reservationData.email,
            phone: reservationData.phone,
            totalPrice: reservationData.totalAmount,
            specialRequests: reservationData.specialRequests,
            statusReservation: 'confirmed',
            paymentStatus: 'paid',
            mercadoPagoId: paymentInfo.paymentId.toString(),
            confirmationCode: `RES-${Date.now()}`
          }
        });

        console.log('Reservation created:', reservation.id);

        // Actualizar el pago con la referencia a la reserva
        await strapi.entityService.update('api::payment.payment', payment.id, {
          data: {
            statusPayment: paymentInfo.status,
            paymentMethod: paymentInfo.paymentMethod,
            paymentType: paymentInfo.paymentType,
            webhookData: webhookData,
            reservation: reservation.id
          }
        });

        return ctx.ok({
          message: 'Webhook processed successfully',
          reservationId: reservation.id
        });
      } else {
        // Si el pago no fue aprobado, solo actualizar el estado del pago
        await strapi.entityService.update('api::payment.payment', payment.id, {
          data: {
            statusPayment: paymentInfo.status,
            paymentMethod: paymentInfo.paymentMethod,
            paymentType: paymentInfo.paymentType,
            webhookData: webhookData
          }
        });

        return ctx.ok('Webhook processed successfully');
      }
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
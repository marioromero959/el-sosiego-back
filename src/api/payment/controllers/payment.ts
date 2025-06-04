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
// src/api/payment/controllers/payment.ts

export default factories.createCoreController('api::payment.payment', ({ strapi }) => ({
  
  // ✅ MANTENER y mejorar el método de pago directo
  async processDirectPayment(ctx) {
    try {
      const { 
        token,
        transaction_amount,
        description,
        payment_method_id,
        installments,
        payer,
        reservationData
      } = ctx.request.body;

      console.log('🏨 Processing direct payment for reservation:', {
        amount: transaction_amount,
        email: payer.email,
        checkIn: reservationData.checkIn
      });

      // Validaciones
      if (!token || !transaction_amount || !payer || !reservationData) {
        return ctx.badRequest('Datos incompletos para procesar el pago');
      }

      // Verificar disponibilidad antes del pago
      const checkInDate = new Date(reservationData.checkIn);
      const checkOutDate = new Date(reservationData.checkOut);
      
      if (checkInDate <= new Date()) {
        return ctx.badRequest('La fecha de llegada debe ser futura');
      }

      if (checkOutDate <= checkInDate) {
        return ctx.badRequest('La fecha de salida debe ser posterior a la llegada');
      }

      // Procesar pago con MercadoPago
      const mercadoPagoService = strapi.service('api::payment.mercadopago');
      const paymentResult = await mercadoPagoService.processDirectPayment({
        token,
        transaction_amount,
        description,
        payment_method_id,
        installments,
        payer
      });

      console.log('💳 Payment result:', {
        id: paymentResult.id,
        status: paymentResult.status,
        status_detail: paymentResult.status_detail
      });

      // Crear reserva solo si el pago fue aprobado
      let reservation = null;
      let confirmationCode = null;

      if (paymentResult.status === 'approved') {
        confirmationCode = `RES-${Date.now()}`;
        
        reservation = await strapi.entityService.create('api::reservation.reservation', {
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
            mercadoPagoId: paymentResult.id.toString(),
            confirmationCode: confirmationCode
          }
        });

        console.log('🏨 Reservation created:', {
          id: reservation.id,
          confirmationCode: confirmationCode
        });
      }

      // Guardar registro de pago (aprobado o no)
      await strapi.entityService.create('api::payment.payment', {
        data: {
          amount: transaction_amount,
          currency: 'USD',
          status: paymentResult.status === 'approved' ? 'approved' : 'rejected',
          mercadoPagoId: paymentResult.id.toString(),
          // statusPayment: paymentResult.status,
          paymentMethod: payment_method_id,
          paymentType: 'direct',
          // reservation: reservation?.id || null,
          transactionDetails: {
            paymentResult,
            reservationData,
            confirmationCode,
            createdAt: new Date().toISOString()
          }
        }
      });

      // Respuesta unificada
      const response = {
        id: paymentResult.id,
        status: paymentResult.status,
        status_detail: paymentResult.status_detail,
        transaction_amount: paymentResult.transaction_amount,
        description: paymentResult.description,
        payment_method_id: paymentResult.payment_method_id,
        date_created: paymentResult.date_created
      };

      if (reservation) {
        // response.reservationId = reservation.id;
        // response.confirmationCode = confirmationCode;
      }

      return { data: response };

    } catch (error) {
      console.error('❌ Error processing direct payment:', error);
      return ctx.internalServerError('Error al procesar el pago: ' + error.message);
    }
  },

  // ✅ QUITAR métodos de CheckoutPro:
  // - createPreference
  // - webhook (o mantenerlo si lo necesitas para otros usos)
  // - getPaymentStatus relacionado con preferences

  // ✅ MANTENER si los usas para consultas
  async getReservationStatus(ctx) {
    try {
      const { confirmationCode } = ctx.params;

      const reservations = await strapi.entityService.findMany('api::reservation.reservation', {
        filters: { confirmationCode }
      });

      if (!reservations || reservations.length === 0) {
        return ctx.notFound('Reserva no encontrada');
      }

      const reservation = reservations[0];
      
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
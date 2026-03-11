/**
 * payment controller - Versión simplificada sin relaciones complejas
 */

import { factories } from '@strapi/strapi';
import emailService from '../../../services/email.service';

// ✅ Interfaces para datos de negocio
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

interface CheckoutProData {
  transaction_amount: number;
  description: string;
  reservationData: ReservationData;
}

export default factories.createCoreController('api::payment.payment', ({ strapi }) => ({
  
  // ✅ Crear preferencia de Checkout Pro
  async createPreference(ctx: any) {
    try {
      const { 
        transaction_amount,
        description,
        reservationData
      }: CheckoutProData = ctx.request.body;

      console.log('🏨 Creating Checkout Pro preference for reservation:', {
        amount: transaction_amount,
        email: reservationData.email,
        checkIn: reservationData.checkIn
      });

      // Validaciones
      if (!reservationData) {
        return ctx.badRequest('Datos de reserva incompletos');
      }

      // Verificar disponibilidad antes de crear la preferencia
      const checkInDate = new Date(reservationData.checkIn);
      const checkOutDate = new Date(reservationData.checkOut);
      
      if (checkInDate <= new Date()) {
        return ctx.badRequest('La fecha de llegada debe ser futura');
      }

      if (checkOutDate <= checkInDate) {
        return ctx.badRequest('La fecha de salida debe ser posterior a la llegada');
      }

      // Crear reserva temporal con estado 'pending'
      const tempId = `TEMP-${Date.now()}`;
      const reservation = await strapi.entityService.create('api::reservation.reservation', {
        data: {
          checkIn: reservationData.checkIn,
          checkOut: reservationData.checkOut,
          guests: reservationData.guests,
          name: reservationData.name,
          email: reservationData.email,
          phone: reservationData.phone,
          totalPrice: reservationData.totalAmount,
          specialRequests: reservationData.specialRequests || '',
          statusReservation: 'pending' as any,
          paymentStatus: 'pending' as any,
          confirmationCode: tempId
        }
      }) as any;

      console.log('🏨 Temporary reservation created:', {
        id: reservation.id,
        tempId: tempId
      });

      // Preparar datos para MercadoPago
      const preferenceData = {
        id: reservation.id.toString(),
        checkIn: reservationData.checkIn,
        checkOut: reservationData.checkOut,
        guests: reservationData.guests,
        name: reservationData.name,
        email: reservationData.email,
        phone: reservationData.phone,
        totalPrice: reservationData.totalAmount,
        description: description || `Reserva Casa de Campo El Sosiego - ${reservationData.name}`
      };

      // Crear preferencia de Checkout Pro
      const mercadoPagoService = strapi.service('api::payment.mercadopago');
      const preference = await mercadoPagoService.createPreference(preferenceData);

      console.log('💳 Checkout Pro preference created:', {
        preferenceId: preference.id,
        initPoint: preference.init_point
      });

      // Guardar registro de pago pendiente (solo campos básicos)
      await strapi.entityService.create('api::payment.payment', {
        data: {
          amount: transaction_amount,
          currency: 'ARS',
          status: 'pending' as any,
          mercadoPagoId: preference.id,
          transactionDetails: {
            preferenceId: preference.id,
            reservationId: reservation.id,
            tempId: tempId,
            customerEmail: reservationData.email,
            customerName: reservationData.name,
            description: description,
            createdAt: new Date().toISOString()
          }
        }
      });

      // Respuesta con datos de la preferencia (solo producción)
      return {
        data: {
          preferenceId: preference.id,
          initPoint: preference.init_point, // ✅ Solo URL de producción
          reservationId: reservation.id,
          tempId: tempId,
          status: 'preference_created'
        }
      };

    } catch (error: any) {
      console.error('❌ Error creating Checkout Pro preference:', error);
      return ctx.internalServerError('Error al crear preferencia de pago: ' + error.message);
    }
  },

  // ✅ Webhook para manejar notificaciones de MercadoPago
  async webhook(ctx: any) {
    try {
      console.log('🔔 Webhook received:', {
        type: ctx.request.body?.type,
        id: ctx.request.body?.data?.id,
        action: ctx.request.body?.action
      });

      const webhookData = ctx.request.body;
      
      // Validar que es una notificación de pago
      if (webhookData.type !== 'payment') {
        console.log('ℹ️ Webhook ignored - not a payment notification');
        return ctx.send({ received: true });
      }

      // Procesar la notificación
      const mercadoPagoService = strapi.service('api::payment.mercadopago');
      const paymentInfo = await mercadoPagoService.processWebhook(webhookData);
      
      if (!paymentInfo) {
        return ctx.send({ received: true });
      }

      // Buscar la reserva asociada
      if (paymentInfo.externalReference) {
        const reservationId = parseInt(paymentInfo.externalReference);
        
        if (!isNaN(reservationId)) {
          const reservation = await strapi.entityService.findOne('api::reservation.reservation', reservationId) as any;
          
          if (reservation) {
            // Actualizar estado de la reserva según el pago
            let newStatus: any = 'pending';
            let newPaymentStatus: any = 'pending';
            let confirmationCode = reservation.confirmationCode;

            if (paymentInfo.status === 'approved') {
              newStatus = 'confirmed';
              newPaymentStatus = 'paid';
              confirmationCode = `RES-${Date.now()}`;
            } else if (paymentInfo.status === 'rejected') {
              newStatus = 'cancelled';
              newPaymentStatus = 'failed';
            }

            await strapi.entityService.update('api::reservation.reservation', reservationId, {
              data: {
                statusReservation: newStatus,
                paymentStatus: newPaymentStatus,
                mercadoPagoId: paymentInfo.paymentId.toString(),
                confirmationCode: confirmationCode
              }
            });

            // ✅ Enviar email de confirmación si el pago fue aprobado
            if (paymentInfo.status === 'approved') {
              try {
                const nights = Math.ceil(
                  (new Date(reservation.checkOut).getTime() - new Date(reservation.checkIn).getTime()) / 
                  (1000 * 3600 * 24)
                );

                const emailData = {
                  confirmationCode: confirmationCode,
                  guestName: reservation.name,
                  guestEmail: reservation.email,
                  guestPhone: reservation.phone,
                  checkIn: reservation.checkIn,
                  checkOut: reservation.checkOut,
                  guests: reservation.guests,
                  totalAmount: reservation.totalPrice,
                  nights: nights
                };

                const template = emailService.getReservationConfirmationTemplate(emailData);
                const emailSent = await emailService.sendEmail({
                  to: reservation.email,
                  template: template
                });

                if (emailSent) {
                  console.log('✅ Email de confirmación enviado a:', reservation.email);
                } else {
                  console.warn('⚠️ No se pudo enviar email de confirmación');
                }
              } catch (emailError) {
                console.error('❌ Error enviando email de confirmación:', emailError);
                // No fallar el webhook por error de email
              }
            }

            // Buscar y actualizar el registro de pago
            const allPayments = await strapi.entityService.findMany('api::payment.payment', {
              filters: { mercadoPagoId: { $ne: null } }
            }) as any[];

            // Buscar el pago que corresponde a esta reserva
            const paymentToUpdate = allPayments.find((payment: any) => {
              const details = payment.transactionDetails;
              return details && (
                details.reservationId === reservationId ||
                details.preferenceId === paymentInfo.externalReference ||
                payment.mercadoPagoId.includes(reservationId.toString())
              );
            });

            if (paymentToUpdate) {
              await strapi.entityService.update('api::payment.payment', paymentToUpdate.id, {
                data: {
                  status: (paymentInfo.status === 'approved' ? 'approved' : 'rejected') as any,
                  mercadoPagoId: paymentInfo.paymentId.toString(),
                  transactionDetails: {
                    ...paymentToUpdate.transactionDetails,
                    paymentId: paymentInfo.paymentId,
                    paymentStatus: paymentInfo.status,
                    paymentMethod: paymentInfo.paymentMethod,
                    amount: paymentInfo.amount,
                    updatedAt: new Date().toISOString()
                  }
                }
              });
            }

            console.log('✅ Reservation updated:', {
              reservationId,
              status: newStatus,
              paymentStatus: newPaymentStatus,
              confirmationCode
            });
          }
        }
      }

      return ctx.send({ received: true });

    } catch (error: any) {
      console.error('❌ Error processing webhook:', error);
      return ctx.send({ received: true, error: error.message });
    }
  },

  // ✅ Verificar estado de pago por preferencia o paymentId
  async verifyPayment(ctx: any) {
    try {
      const { preferenceId } = ctx.params;

      console.log('🔍 Verifying payment for:', preferenceId);

      // Intentar múltiples veces en caso de que el webhook aún no haya procesado
      let attempts = 0;
      const maxAttempts = 5;
      let payment = null;
      let reservation = null;

      while (attempts < maxAttempts) {
        // Buscar el pago por preferenceId o paymentId
        const allPayments = await strapi.entityService.findMany('api::payment.payment', {
          filters: { mercadoPagoId: { $ne: null } }
        }) as any[];

        // Buscar el pago que corresponde a esta preferencia o payment ID
        payment = allPayments.find((p: any) => {
          // Buscar por preferenceId
          if (p.mercadoPagoId === preferenceId || 
              (p.transactionDetails && p.transactionDetails.preferenceId === preferenceId)) {
            return true;
          }
          // Buscar por paymentId (puede venir como "15,payment-id" o solo "payment-id")
          const paymentIdMatch = preferenceId.split(',')[1] || preferenceId;
          if (p.mercadoPagoId && p.mercadoPagoId.includes(paymentIdMatch)) {
            return true;
          }
          return false;
        });

        // Si encontramos el pago, buscar la reserva
        if (payment) {
          // Primero intentar con reservationId del transactionDetails
          if (payment.transactionDetails && payment.transactionDetails.reservationId) {
            reservation = await strapi.entityService.findOne(
              'api::reservation.reservation', 
              payment.transactionDetails.reservationId
            ) as any;
          }

          // Si no hay reserva, buscar por mercadoPagoId
          if (!reservation) {
            const allReservations = await strapi.entityService.findMany('api::reservation.reservation', {
              filters: { mercadoPagoId: { $ne: null } }
            }) as any[];

            reservation = allReservations.find((r: any) => 
              r.mercadoPagoId && (r.mercadoPagoId === payment.mercadoPagoId || r.mercadoPagoId.includes(preferenceId))
            );
          }

          // Si la reserva ya está confirmada, retornar inmediatamente
          if (reservation && (reservation.statusReservation === 'confirmed' || reservation.paymentStatus === 'paid')) {
            break;
          }
        }

        attempts++;
        if (attempts < maxAttempts) {
          // Esperar 1 segundo antes de reintentar
          await new Promise(resolve => setTimeout(resolve, 1000));
          console.log(`⏳ Reintento ${attempts}/${maxAttempts} - esperando webhook...`);
        }
      }

      if (!payment) {
        return ctx.notFound('Pago no encontrado para: ' + preferenceId);
      }

      // Si aún no hay reserva, buscar por ID numérico en el preferenceId
      if (!reservation && preferenceId) {
        const reservationIdMatch = preferenceId.split(',')[0];
        const reservationId = parseInt(reservationIdMatch);
        if (!isNaN(reservationId)) {
          try {
            reservation = await strapi.entityService.findOne('api::reservation.reservation', reservationId) as any;
          } catch (error) {
            console.log('Reserva no encontrada con ID:', reservationId);
          }
        }
      }

      return {
        data: {
          paymentId: payment.id,
          status: reservation?.statusReservation === 'confirmed' ? 'approved' : payment.status,
          reservationId: reservation?.id,
          confirmationCode: reservation?.confirmationCode,
          paymentStatus: reservation?.paymentStatus,
          statusReservation: reservation?.statusReservation
        }
      };

    } catch (error: any) {
      console.error('❌ Error verifying payment:', error);
      return ctx.internalServerError('Error al verificar el pago: ' + error.message);
    }
  },

  // ✅ Obtener estado de reserva
  async getReservationStatus(ctx: any) {
    try {
      const { confirmationCode } = ctx.params;

      const reservations = await strapi.entityService.findMany('api::reservation.reservation', {
        filters: { confirmationCode }
      }) as any[];

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
    } catch (error: any) {
      console.error('Error getting reservation status:', error);
      return ctx.internalServerError('Error al obtener estado de la reserva');
    }
  },

  // ✅ Obtener configuración de MercadoPago
  async getConfig(ctx: any) {
    return {
      data: {
        publicKey: process.env.MERCADO_PAGO_PUBLIC_KEY,
        currency: 'ARS',
        country: 'AR'
      }
    };
  }

}));
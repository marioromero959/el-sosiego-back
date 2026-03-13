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
      // Parsear fechas como locales para evitar errores de zona horaria
      const [ci_y, ci_m, ci_d] = reservationData.checkIn.split('-').map(Number);
      const [co_y, co_m, co_d] = reservationData.checkOut.split('-').map(Number);
      const checkInDate = new Date(ci_y, ci_m - 1, ci_d);
      const checkOutDate = new Date(co_y, co_m - 1, co_d);

      // Leer configuración de anticipación mínima (default: 1 día = mañana mínimo)
      let minAdvanceDays = parseInt(process.env.MIN_ADVANCE_BOOKING_DAYS || '1');
      try {
        const settings = await strapi.db.query('api::booking-setting.booking-setting').findOne({});
        if (settings?.minAdvanceDays !== undefined && settings.minAdvanceDays !== null) {
          minAdvanceDays = settings.minAdvanceDays;
        }
      } catch (_) { /* usar default */ }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const minCheckIn = new Date(today);
      minCheckIn.setDate(today.getDate() + minAdvanceDays);

      if (checkInDate < minCheckIn) {
        const msg = minAdvanceDays <= 1
          ? 'La fecha de llegada debe ser a partir de mañana'
          : `Las reservas deben realizarse con al menos ${minAdvanceDays} días de anticipación`;
        return ctx.badRequest(msg);
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
      console.log('🔔 ========== WEBHOOK RECEIVED ==========');
      console.log('🔔 Webhook received:', {
        type: ctx.request.body?.type,
        id: ctx.request.body?.data?.id,
        action: ctx.request.body?.action,
        fullBody: JSON.stringify(ctx.request.body)
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
              console.log('📧 ========== INTENTANDO ENVIAR EMAIL ==========');
              console.log('📧 Email destinatario:', reservation.email);
              console.log('📧 Código confirmación:', confirmationCode);
              
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

                console.log('📧 Preparando template de email...');
                const template = emailService.getReservationConfirmationTemplate(emailData);
                
                console.log('📧 Enviando email...');
                const emailSent = await emailService.sendEmail({
                  to: reservation.email,
                  template: template
                });

                if (emailSent) {
                  console.log('✅ ========== EMAIL ENVIADO EXITOSAMENTE ==========');
                  console.log('✅ Email de confirmación enviado a:', reservation.email);
                } else {
                  console.warn('⚠️ ========== EMAIL NO SE PUDO ENVIAR ==========');
                  console.warn('⚠️ No se pudo enviar email de confirmación');
                }
              } catch (emailError) {
                console.error('❌ ========== ERROR EN ENVÍO DE EMAIL ==========');
                console.error('❌ Error enviando email de confirmación:', emailError);
                console.error('❌ Stack:', emailError.stack);
                // No fallar el webhook por error de email
              }
            } else {
              console.log('ℹ️ Email no enviado - pago no aprobado. Status:', paymentInfo.status);
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

  // ✅ Verificar estado de pago por preferencia
  async verifyPayment(ctx: any) {
    try {
      const { preferenceId } = ctx.params;
      const payment_id = ctx.query.payment_id;
      const external_reference = ctx.query.external_reference;

      console.log('🔍 Verifying payment:', {
        preferenceId,
        payment_id,
        external_reference,
        allParams: ctx.params,
        allQuery: ctx.query
      });

      let reservation = null;
      
      // 🔍 OPCIÓN 1: Buscar por external_reference (ID de reserva directo)
      if (external_reference) {
        const reservationId = parseInt(external_reference);
        console.log('🔍 Reservation ID to search:', reservationId);
        
        if (!isNaN(reservationId)) {
          try {
            reservation = await strapi.entityService.findOne('api::reservation.reservation', reservationId) as any;
            
            if (reservation) {
              console.log('✅ Reserva encontrada por external_reference:', {
                id: reservation.id,
                status: reservation.statusReservation,
                email: reservation.email
              });
            }
          } catch (error) {
            console.log('❌ Reserva no encontrada con ID:', reservationId);
          }
        }
      }

      // 🔍 OPCIÓN 2: Buscar por mercadoPagoId (payment_id)
      if (!reservation && payment_id) {
        console.log('🔍 Buscando reserva por mercadoPagoId (payment_id):', payment_id);
        
        const allReservations = await strapi.entityService.findMany('api::reservation.reservation', {
          filters: { mercadoPagoId: { $ne: null } }
        }) as any[];

        reservation = allReservations.find((r: any) => r.mercadoPagoId === payment_id);
        
        if (reservation) {
          console.log('✅ Reserva encontrada por mercadoPagoId:', {
            id: reservation.id,
            mercadoPagoId: reservation.mercadoPagoId,
            email: reservation.email
          });
        }
      }

      // Si encontramos la reserva, obtener info del pago de MercadoPago
      if (reservation && payment_id) {
        console.log('📞 Obteniendo información del pago de MercadoPago...');
        
        const mercadoPagoService = strapi.service('api::payment.mercadopago');
        const paymentInfo = await mercadoPagoService.getPaymentInfo(payment_id);
        
        console.log('📞 MercadoPago API response:', paymentInfo);

        // Actualizar reserva si el pago fue aprobado
        if (paymentInfo.status === 'approved' && reservation.statusReservation !== 'confirmed') {
          console.log('✅ Pago aprobado, actualizando reserva...');
          
          const confirmationCode = `RES-${Date.now()}`;
          
          reservation = await strapi.entityService.update('api::reservation.reservation', reservation.id, {
            data: {
              statusReservation: 'confirmed',
              paymentStatus: 'paid',
              mercadoPagoId: payment_id,
              confirmationCode: confirmationCode
            }
          }) as any;

          console.log('✅ Reserva actualizada:', {
            id: reservation.id,
            statusReservation: reservation.statusReservation,
            confirmationCode: reservation.confirmationCode
          });

          // 📧 ENVIAR EMAIL DE CONFIRMACIÓN
          console.log('📧 ========== INTENTANDO ENVIAR EMAIL DESDE VERIFY ==========');
          const reservationService = strapi.service('api::reservation.reservation');
          
          try {
            await reservationService.sendConfirmationEmail(reservation.id);
            console.log('✅ Email enviado desde verify');
          } catch (emailError) {
            console.error('❌ Error enviando email desde verify:', emailError);
          }
        }
      }

      if (!reservation) {
        console.log('❌ Reserva no encontrada con los parámetros proporcionados');
        return ctx.notFound('Reserva no encontrada');
      }

      return {
        data: {
          status: reservation.statusReservation === 'confirmed' ? 'approved' : reservation.statusReservation,
          reservationId: reservation.id,
          confirmationCode: reservation.confirmationCode,
          paymentStatus: reservation.paymentStatus,
          statusReservation: reservation.statusReservation
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
    let minAdvanceDays = parseInt(process.env.MIN_ADVANCE_BOOKING_DAYS || '1');
    try {
      const settings = await strapi.db.query('api::booking-setting.booking-setting').findOne({});
      if (settings?.minAdvanceDays !== undefined && settings.minAdvanceDays !== null) {
        minAdvanceDays = settings.minAdvanceDays;
      }
    } catch (_) { /* usar default */ }

    return {
      data: {
        publicKey: process.env.MERCADO_PAGO_PUBLIC_KEY,
        currency: 'ARS',
        country: 'AR',
        minAdvanceDays
      }
    };
  }

}));
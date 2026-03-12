/**
 * reservation service
 */

import { factories } from '@strapi/strapi';
import emailService from '../../../services/email.service';

// Interfaces para tipado
interface ReservationData {
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
  specialRequests?: string;
  notes?: string;
}

export default factories.createCoreService('api::reservation.reservation', ({ strapi }) => ({
  
  // Override del método create para generar código de confirmación automáticamente
  async create(params: any) {
    try {
      // Generar código de confirmación único
      const confirmationCode = this.generateConfirmationCode();
      
      // Verificar disponibilidad de fechas
      const isAvailable = await this.checkAvailability(
        params.data.checkIn, 
        params.data.checkOut
      );
      
      if (!isAvailable) {
        throw new Error('Las fechas seleccionadas no están disponibles');
      }
      
      // Agregar campos automáticos
      params.data.confirmationCode = confirmationCode;
      params.data.statusReservation = params.data.statusReservation || 'pending';
      params.data.paymentStatus = params.data.paymentStatus || 'pending';
      
      // Crear la reserva usando el método padre
      const result = await super.create(params);
      
      // Enviar email de confirmación automáticamente
      if (result && result.email) {
        console.log('🚀 Enviando email de confirmación automáticamente...');
        await this.sendConfirmationEmail(result.id);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error creating reservation:', error);
      throw error;
    }
  },

  async sendConfirmationEmail(reservationId: number) {
    try {
      const reservation = await strapi.entityService.findOne(
        'api::reservation.reservation',
        reservationId
      );

      if (!reservation) {
        console.error('❌ Reserva no encontrada:', reservationId);
        throw new Error('Reserva no encontrada');
      }

      if (!reservation.email) {
        console.error('❌ Email no existe en la reserva:', reservationId);
        throw new Error('Email no encontrado en la reserva');
      }

      // Generar código de confirmación si no existe
      if (!reservation.confirmationCode) {
        const code = this.generateConfirmationCode();
        await strapi.entityService.update('api::reservation.reservation', reservationId, {
          data: { confirmationCode: code },
        });
        reservation.confirmationCode = code;
      }

      // Calcular noches
      const nights = Math.ceil(
        (new Date(reservation.checkOut).getTime() - new Date(reservation.checkIn).getTime()) / 
        (1000 * 3600 * 24)
      );

      // Preparar datos para el template
      const templateData = {
        confirmationCode: reservation.confirmationCode,
        guestName: reservation.name,
        guestEmail: reservation.email,
        guestPhone: reservation.phone,
        checkIn: reservation.checkIn,
        checkOut: reservation.checkOut,
        guests: reservation.guests,
        totalAmount: reservation.totalPrice,
        nights: nights,
        specialRequests: reservation.specialRequests
      };

      const template = emailService.getReservationConfirmationTemplate(templateData);
      const emailSent = await emailService.sendEmail({
        to: reservation.email,
        template,
      });

      if (emailSent) {
        await strapi.entityService.update('api::reservation.reservation', reservationId, {
          data: { 
            emailSent: true,
            emailSentAt: new Date()
          },
        });
        console.log('✅ Email de confirmación enviado a:', reservation.email);
      } else {
        console.warn('⚠️ Error al enviar email de confirmación');
      }

      return emailSent;
    } catch (error) {
      console.error('❌ Error enviando email de confirmación:', error);
      return false;
    }
  },

  async sendPaymentReminder(reservationId: number) {
    try {
      console.log('⏰ Enviando recordatorio de pago para reserva:', reservationId);
      
      const reservation = await strapi.entityService.findOne(
        'api::reservation.reservation',
        reservationId
      );

      if (!reservation || !reservation.email) {
        throw new Error('Reserva o email no encontrado');
      }

      // Preparar datos para el template
      const templateData = {
        confirmationCode: reservation.confirmationCode,
        guestName: reservation.name,
        totalAmount: reservation.totalPrice
      };

      const template = emailService.getPaymentReminderTemplate(templateData);
      const emailSent = await emailService.sendEmail({
        to: reservation.email,
        template,
      });

      if (emailSent) {
        await strapi.entityService.update('api::reservation.reservation', reservationId, {
          data: { 
            reminderEmailSent: true,
            reminderEmailSentAt: new Date()
          },
        });
        console.log('✅ Recordatorio de pago enviado exitosamente');
      }

      return emailSent;
    } catch (error) {
      console.error('❌ Error sending payment reminder:', error);
      return false;
    }
  },

  generateConfirmationCode(): string {
    const prefix = 'ES';
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `${prefix}${timestamp}${random}`;
  },

  // Verificar disponibilidad de fechas (CORREGIDO)
  async checkAvailability(checkIn: string, checkOut: string): Promise<boolean> {
    try {
      console.log(`🔍 Checking availability for: ${checkIn} to ${checkOut}`);
      
      // Crear objetos Date y normalizar a medianoche UTC
      const reqCheckIn = new Date(checkIn);
      reqCheckIn.setUTCHours(0, 0, 0, 0);
      const reqCheckOut = new Date(checkOut);
      reqCheckOut.setUTCHours(0, 0, 0, 0);
      
      console.log(`🔍 Normalized dates (UTC): ${reqCheckIn.toISOString()} to ${reqCheckOut.toISOString()}`);
      
      // Validar que las fechas sean válidas y en orden correcto
      if (isNaN(reqCheckIn.getTime()) || isNaN(reqCheckOut.getTime())) {
        throw new Error('Fechas inválidas');
      }
      
      if (reqCheckOut <= reqCheckIn) {
        throw new Error('La fecha de salida debe ser posterior a la fecha de entrada');
      }
      
      // Obtener todas las reservas confirmadas
      const confirmedReservations = await strapi.entityService.findMany(
        'api::reservation.reservation',
        {
          filters: {
            statusReservation: {
              $in: ['confirmed', 'paid'],
            },
          },
        }
      );
      
      console.log(`📋 Found ${confirmedReservations.length} confirmed reservations`);
      
      // Verificar conflictos
      for (const reservation of confirmedReservations) {
        // Normalizar fechas de la reserva existente a medianoche UTC
        const resCheckIn = new Date(reservation.checkIn);
        resCheckIn.setUTCHours(0, 0, 0, 0);
        const resCheckOut = new Date(reservation.checkOut);
        resCheckOut.setUTCHours(0, 0, 0, 0);
        
        console.log(`🧮 Checking against reservation ${reservation.id}:`);
        console.log(`   Normalized existing dates (UTC): ${resCheckIn.toISOString()} to ${resCheckOut.toISOString()}`);
        
        // Verificar superposición de rangos
        // Una reserva se superpone si:
        // - La nueva check-in está antes o en el mismo día que la existente check-out Y
        // - La nueva check-out está después o en el mismo día que la existente check-in
        if (reqCheckIn < resCheckOut && reqCheckOut > resCheckIn) {
          console.log(`❌ Conflict found with reservation ${reservation.id}`);
          return false;
        }
      }
      
      console.log('✅ No conflicts found - dates are available');
      return true;
      
    } catch (error) {
      console.error('❌ Error checking availability:', error);
      throw error;
    }
  },

  // Buscar por código de confirmación
  async findByConfirmationCode(confirmationCode: string) {
    try {
      const reservations = await strapi.entityService.findMany(
        'api::reservation.reservation',
        {
          filters: { confirmationCode },
          limit: 1,
        }
      );
      
      return reservations[0] || null;
    } catch (error) {
      console.error('Error finding reservation by confirmation code:', error);
      throw new Error('Error al buscar reserva por código de confirmación');
    }
  },

  // Obtener reservas por estado - CORREGIDO: usar statusReservation
  async findByStatus(status: 'pending' | 'confirmed' | 'paid' | 'cancelled' | 'completed') {
    try {
      return await strapi.entityService.findMany(
        'api::reservation.reservation',
        {
          filters: { statusReservation: status },
        }
      );
    } catch (error) {
      console.error('Error finding reservations by status:', error);
      throw new Error('Error al buscar reservas por estado');
    }
  },

  // Obtener reservas por estado de pago
  async findByPaymentStatus(paymentStatus: 'pending' | 'processing' | 'paid' | 'failed' | 'refunded') {
    try {
      return await strapi.entityService.findMany(
        'api::reservation.reservation',
        {
          filters: { paymentStatus },
        }
      );
    } catch (error) {
      console.error('Error finding reservations by payment status:', error);
      throw new Error('Error al buscar reservas por estado de pago');
    }
  },

  // Validar datos de reserva
  validateReservationData(data: Partial<ReservationData>): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validar fechas
    if (data.checkIn && data.checkOut) {
      const checkIn = new Date(data.checkIn);
      const checkOut = new Date(data.checkOut);
      const now = new Date();

      if (checkIn < now) {
        errors.push('La fecha de entrada no puede ser en el pasado');
      }

      if (checkOut <= checkIn) {
        errors.push('La fecha de salida debe ser posterior a la fecha de entrada');
      }
    }

    // Validar huéspedes
    if (data.guests !== undefined && (data.guests < 1 || data.guests > 8)) {
      errors.push('El número de huéspedes debe estar entre 1 y 8');
    }

    // Validar campos requeridos
    const requiredFields: (keyof ReservationData)[] = ['name', 'email', 'phone', 'totalPrice'];
    for (const field of requiredFields) {
      const value = data[field];
      if (!value || (typeof value === 'string' && value.trim() === '')) {
        errors.push(`El campo ${field} es requerido`);
      }
    }

    // Validar email
    if (data.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.email)) {
        errors.push('El formato del email no es válido');
      }
    }

    // Validar precio
    if (data.totalPrice !== undefined && (isNaN(Number(data.totalPrice)) || Number(data.totalPrice) <= 0)) {
      errors.push('El precio total debe ser un número mayor a 0');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  },

  // Calcular estadísticas de reservas
  async getReservationStats() {
    try {
      const [totalReservations, confirmedReservations, pendingPayments, paidReservations] = await Promise.all([
        strapi.entityService.count('api::reservation.reservation'),
        strapi.entityService.count('api::reservation.reservation', {
          filters: { statusReservation: 'confirmed' }
        }),
        strapi.entityService.count('api::reservation.reservation', {
          filters: { paymentStatus: 'pending' }
        }),
        strapi.entityService.count('api::reservation.reservation', {
          filters: { paymentStatus: 'paid' }
        })
      ]);

      return {
        totalReservations,
        confirmedReservations,
        pendingPayments,
        paidReservations,
        conversionRate: totalReservations > 0 ? (paidReservations / totalReservations) * 100 : 0
      };
    } catch (error) {
      console.error('Error getting reservation stats:', error);
      throw new Error('Error al obtener estadísticas de reservas');
    }
  },

  // Obtener reservas próximas a vencer
  async getExpiringReservations(hoursBeforeExpiration: number = 24) {
    try {
      const expirationDate = new Date();
      expirationDate.setHours(expirationDate.getHours() + hoursBeforeExpiration);

      return await strapi.entityService.findMany(
        'api::reservation.reservation',
        {
          filters: {
            $and: [
              { statusReservation: 'pending' },
              { paymentStatus: 'pending' },
              { checkIn: { $lte: expirationDate.toISOString() } }
            ]
          }
        }
      );
    } catch (error) {
      console.error('Error getting expiring reservations:', error);
      throw new Error('Error al obtener reservas próximas a vencer');
    }
  },

  // Cancelar reservas expiradas
  async cancelExpiredReservations() {
    try {
      const now = new Date();
      
      const expiredReservations = await strapi.entityService.findMany(
        'api::reservation.reservation',
        {
          filters: {
            $and: [
              { statusReservation: 'pending' },
              { paymentStatus: 'pending' },
              { checkIn: { $lt: now.toISOString() } }
            ]
          }
        }
      );

      const cancelPromises = expiredReservations.map((reservation: any) =>
        strapi.entityService.update('api::reservation.reservation', reservation.id, {
          data: {
            statusReservation: 'cancelled',
            notes: `Cancelada automáticamente por expiración - ${now.toISOString()}`
          }
        })
      );

      await Promise.all(cancelPromises);

      console.log(`Cancelled ${expiredReservations.length} expired reservations`);
      return expiredReservations.length;
    } catch (error) {
      console.error('Error cancelling expired reservations:', error);
      throw new Error('Error al cancelar reservas expiradas');
    }
  }
}));
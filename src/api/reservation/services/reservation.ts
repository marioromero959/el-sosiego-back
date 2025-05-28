/**
 * reservation service
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
    
    return super.create(params);
  },

  // Generar código de confirmación único
  generateConfirmationCode(): string {
    const prefix = 'CC';
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}${timestamp}${random}`;
  },

  // Verificar disponibilidad de fechas
  async checkAvailability(checkIn: string, checkOut: string): Promise<boolean> {
    try {
      const conflictingReservations = await strapi.entityService.findMany(
        'api::reservation.reservation',
        {
          filters: {
            $and: [
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

      return conflictingReservations.length === 0;
    } catch (error) {
      console.error('Error checking availability:', error);
      throw new Error('Error al verificar disponibilidad');
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
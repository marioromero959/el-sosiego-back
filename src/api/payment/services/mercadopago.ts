/**
 * MercadoPago service
 */

import { factories } from '@strapi/strapi';

// Tipos para MercadoPago
interface MercadoPagoPreference {
  id: string;
  init_point: string;
  sandbox_init_point: string;
}

interface MercadoPagoPayment {
  id: number;
  status: string;
  status_detail: string;
  transaction_amount: number;
  currency_id: string;
  payment_method_id: string;
  payment_type_id: string;
  external_reference: string;
  transaction_details: any;
  payer: any;
  date_created: string;
  date_approved: string;
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

interface ReservationData {
  id: number;
  confirmationCode?: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  name: string;
  email: string;
  phone: string;
  totalPrice: number;
}

export default factories.createCoreService('api::payment.payment', ({ strapi }) => ({
  
  async createPreference(reservationData: ReservationData): Promise<MercadoPagoPreference> {
    try {
      // Importar con la nueva API de MercadoPago v2
      const { MercadoPagoConfig, Preference } = require('mercadopago');

      // Configurar cliente
      const client = new MercadoPagoConfig({ 
        accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN,
        options: { timeout: 5000 }
      });

      const preference = new Preference(client);

      // Datos de la preferencia
      const preferenceData = {
        items: [
          {
            title: `Reserva Casa de Campo El Sosiego - ${reservationData.confirmationCode || reservationData.id}`,
            description: `Del ${reservationData.checkIn} al ${reservationData.checkOut} - ${reservationData.guests} huéspedes`,
            unit_price: Number(reservationData.totalPrice),
            quantity: 1,
            currency_id: 'ARS'
          }
        ],
        payer: {
          name: reservationData.name,
          email: reservationData.email,
          phone: {
            number: reservationData.phone
          }
        },
        payment_methods: {
          excluded_payment_methods: [],
          excluded_payment_types: [],
          installments: 12
        },
        back_urls: {
          success: `${process.env.FRONTEND_URL}/reserva-exitosa?id=${reservationData.id}`,
          failure: `${process.env.FRONTEND_URL}/reserva-fallida?id=${reservationData.id}`,
          pending: `${process.env.FRONTEND_URL}/reserva-pendiente?id=${reservationData.id}`
        },
        auto_return: 'approved',
        external_reference: reservationData.id.toString(),
        notification_url: `${process.env.BACKEND_URL}/api/payments/webhook`,
        expires: true,
        expiration_date_from: new Date().toISOString(),
        expiration_date_to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      const response = await preference.create({ body: preferenceData });
      return response;
    } catch (error) {
      console.error('Error creating MercadoPago preference:', error);
      throw new Error('Error al crear preferencia de pago');
    }
  },

  async getPayment(paymentId: number): Promise<MercadoPagoPayment> {
    try {
      const { MercadoPagoConfig, Payment } = require('mercadopago');
      
      const client = new MercadoPagoConfig({ 
        accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN 
      });

      const payment = new Payment(client);
      const response = await payment.get({ id: paymentId });
      return response;
    } catch (error) {
      console.error('Error getting payment:', error);
      throw new Error('Error al obtener información del pago');
    }
  },

  async processWebhook(data: any): Promise<PaymentInfo | null> {
    try {
      if (data.type === 'payment') {
        const payment = await this.getPayment(data.data.id);
        
        return {
          paymentId: payment.id,
          status: payment.status,
          statusDetail: payment.status_detail,
          amount: payment.transaction_amount,
          currency: payment.currency_id,
          paymentMethod: payment.payment_method_id,
          paymentType: payment.payment_type_id,
          externalReference: payment.external_reference,
          transactionDetails: payment.transaction_details,
          payer: payment.payer,
          dateCreated: payment.date_created,
          dateApproved: payment.date_approved
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error processing webhook:', error);
      throw new Error('Error al procesar webhook');
    }
  },

  // Validar firma de webhook (opcional pero recomendado para producción)
  validateWebhookSignature(body: string, signature: string): boolean {
    try {
      const crypto = require('crypto');
      const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
      
      if (!secret) {
        console.warn('MERCADO_PAGO_WEBHOOK_SECRET not configured');
        return true; // En desarrollo, permitir sin validación
      }
      
      const hash = crypto.createHmac('sha256', secret).update(body).digest('hex');
      return hash === signature;
    } catch (error) {
      console.error('Error validating webhook signature:', error);
      return false;
    }
  }
}));
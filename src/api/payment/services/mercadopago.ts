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
  id: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  name: string;
  email: string;
  phone: string;
  totalPrice: number;
  description?: string;
}

export default factories.createCoreService('api::payment.payment', ({ strapi }) => ({


  async processDirectPayment(paymentData: {
    token: string;
    transaction_amount: number;
    description: string;
    payment_method_id: string;
    installments: number;
    payer: {
      email: string;
      identification: {
        type: string;
        number: string;
      };
    };
  }): Promise<any> {
    try {
      console.log('[MercadoPago] Processing direct payment:', {
        amount: paymentData.transaction_amount,
        method: paymentData.payment_method_id
      });

      const { MercadoPagoConfig, Payment } = require('mercadopago');

      const client = new MercadoPagoConfig({ 
        accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN,
        options: { timeout: 5000 }
      });

      const payment = new Payment(client);

      const paymentRequest = {
        transaction_amount: paymentData.transaction_amount,
        token: paymentData.token,
        description: paymentData.description,
        payment_method_id: paymentData.payment_method_id,
        installments: paymentData.installments,
        payer: {
          email: paymentData.payer.email,
          identification: {
            type: paymentData.payer.identification.type,
            number: paymentData.payer.identification.number
          }
        }
      };

      const response = await payment.create({ body: paymentRequest });

      console.log('[MercadoPago] Direct payment processed:', {
        id: response.id,
        status: response.status,
        status_detail: response.status_detail
      });

      return response;
    } catch (error) {
      console.error('[MercadoPago] Error processing direct payment:', {
        error: error.message,
        stack: error.stack
      });
      throw new Error('Error al procesar pago directo');
    }
  },
  
  async createPreference(reservationData: ReservationData): Promise<MercadoPagoPreference> {
    try {
      console.log('[MercadoPago] Creating preference for reservation:', {
        id: reservationData.id,
        checkIn: reservationData.checkIn,
        checkOut: reservationData.checkOut,
        totalPrice: reservationData.totalPrice
      });

      // Importar con la nueva API de MercadoPago v2
      const { MercadoPagoConfig, Preference } = require('mercadopago');

      // Configurar cliente
      const client = new MercadoPagoConfig({ 
        accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN,
        options: { timeout: 5000 }
      });

      console.log('[MercadoPago] Client configured successfully');

      const preference = new Preference(client);

      // Datos de la preferencia
      const preferenceData = {
        items: [
          {
            title: reservationData.description || `Reserva Casa de Campo El Sosiego`,
            description: `Del ${new Date(reservationData.checkIn).toLocaleDateString()} al ${new Date(reservationData.checkOut).toLocaleDateString()} - ${reservationData.guests} huéspedes`,
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
      console.log('[MercadoPago] Preference created successfully:', {
        preferenceId: response.id,
        initPoint: response.init_point
      });
      return response;
    } catch (error) {
      console.error('[MercadoPago] Error creating preference:', {
        error: error.message,
        stack: error.stack,
        data: {
          id: reservationData.id,
          totalPrice: reservationData.totalPrice
        }
      });
      throw new Error('Error al crear preferencia de pago');
    }
  },

  async getPayment(paymentId: number): Promise<MercadoPagoPayment> {
    try {
      console.log('[MercadoPago] Getting payment info for ID:', paymentId);
      const { MercadoPagoConfig, Payment } = require('mercadopago');
      
      const client = new MercadoPagoConfig({ 
        accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN 
      });

      const payment = new Payment(client);
      const response = await payment.get({ id: paymentId });
      console.log('[MercadoPago] Payment info retrieved:', {
        status: response.status,
        statusDetail: response.status_detail,
        amount: response.transaction_amount
      });
      return response;
    } catch (error) {
      console.error('[MercadoPago] Error getting payment:', {
        error: error.message,
        stack: error.stack,
        paymentId
      });
      throw new Error('Error al obtener información del pago');
    }
  },

  async processWebhook(data: any): Promise<PaymentInfo | null> {
    try {
      console.log('[MercadoPago] Processing webhook:', {
        type: data.type,
        id: data.data?.id
      });

      if (data.type === 'payment') {
        const payment = await this.getPayment(data.data.id);
        
        const paymentInfo = {
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

        console.log('[MercadoPago] Webhook processed successfully:', {
          status: paymentInfo.status,
          amount: paymentInfo.amount,
          externalReference: paymentInfo.externalReference
        });

        return paymentInfo;
      }
      
      console.log('[MercadoPago] Webhook ignored - not a payment event');
      return null;
    } catch (error) {
      console.error('[MercadoPago] Error processing webhook:', {
        error: error.message,
        stack: error.stack,
        data
      });
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
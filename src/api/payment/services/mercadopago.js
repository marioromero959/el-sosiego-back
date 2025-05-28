'use strict';

const mercadopago = require('mercadopago');

class MercadoPagoService {
  constructor() {
    // Configurar Mercado Pago
    mercadopago.configure({
      access_token: process.env.MERCADO_PAGO_ACCESS_TOKEN,
    });
  }

  // Crear preferencia de pago
  async createPreference(reservationData) {
    try {
      const preference = {
        items: [
          {
            title: `Reserva Casa de Campo El Sosiego - ${reservationData.confirmationCode || reservationData.id}`,
            description: `Del ${reservationData.checkIn} al ${reservationData.checkOut} - ${reservationData.guests} huéspedes`,
            unit_price: parseFloat(reservationData.totalPrice),
            quantity: 1,
            currency_id: 'ARS' // Pesos argentinos
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

      const response = await mercadopago.preferences.create(preference);
      return response.body;
    } catch (error) {
      console.error('Error creating MercadoPago preference:', error);
      throw new Error('Error al crear preferencia de pago');
    }
  }

  // Obtener información de pago
  async getPayment(paymentId) {
    try {
      const payment = await mercadopago.payment.findById(paymentId);
      return payment.body;
    } catch (error) {
      console.error('Error getting payment:', error);
      throw new Error('Error al obtener información del pago');
    }
  }

  // Procesar webhook
  async processWebhook(data) {
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
  }
}

module.exports = new MercadoPagoService();
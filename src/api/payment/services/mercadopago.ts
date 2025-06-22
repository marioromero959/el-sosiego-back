/**
 * MercadoPago service - Con redirección funcionando
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreService('api::payment.payment', ({ strapi }) => ({

  // ✅ Crear preferencia con redirección
  async createPreference(reservationData: any): Promise<any> {
    try {
      console.log('[MercadoPago] 🚀 Creating preference with redirect URLs...');
      
      const { MercadoPagoConfig, Preference } = require('mercadopago');

      const client = new MercadoPagoConfig({ 
        accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN,
        options: { timeout: 15000 }
      });

      const preference = new Preference(client);

      // ✅ Configuración que sabemos que funciona + URLs de retorno
      const preferenceData = {
        items: [
          {
            title: "Reserva Casa de Campo El Sosiego",
            description: `Reserva del ${new Date(reservationData.checkIn).toLocaleDateString('es-AR')} al ${new Date(reservationData.checkOut).toLocaleDateString('es-AR')} - ${reservationData.guests} huéspedes`,
            unit_price: Number(reservationData.totalPrice),
            quantity: 1,
            currency_id: 'ARS'
          }
        ],
        
        // ✅ Datos básicos del pagador
        payer: {
          email: reservationData.email,
          name: reservationData.name
        },
        
        // ✅ URLs de retorno - ¡Aquí está la clave!
        back_urls: {
          success: `${process.env.FRONTEND_URL}/reserva-exitosa?preference_id=${reservationData.id}`,
          failure: `${process.env.FRONTEND_URL}/reserva-fallida?preference_id=${reservationData.id}`,
          pending: `${process.env.FRONTEND_URL}/reserva-pendiente?preference_id=${reservationData.id}`
        },
        
        // ✅ Retorno automático solo en pagos aprobados
        auto_return: "approved",
        
        // ✅ Referencia externa para identificar la reserva
        external_reference: reservationData.id.toString(),
        
        // ✅ URL para notificaciones webhook
        notification_url: `${process.env.BACKEND_URL}/api/payments/webhook`,
        
        // ✅ Sin expiración para pruebas
        expires: false
      };

      console.log('[MercadoPago] 📋 URLs configured:', {
        success: preferenceData.back_urls.success,
        failure: preferenceData.back_urls.failure,
        pending: preferenceData.back_urls.pending,
        webhook: preferenceData.notification_url
      });

      const response = await preference.create({ body: preferenceData });
      
      console.log('[MercadoPago] ✅ Preference with redirect created:', {
        preferenceId: response.id,
        initPoint: response.init_point
      });
      
      return response;
      
    } catch (error: any) {
      console.error('[MercadoPago] ❌ Error creating preference with redirect:', error.message);
      throw error;
    }
  },

  // ✅ Obtener información de pago
  async getPayment(paymentId: number): Promise<any> {
    try {
      console.log('[MercadoPago] Getting payment info for ID:', paymentId);
      
      const { MercadoPagoConfig, Payment } = require('mercadopago');
      
      const client = new MercadoPagoConfig({ 
        accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN,
        options: { timeout: 10000 }
      });

      const payment = new Payment(client);
      const response = await payment.get({ id: paymentId });
      
      console.log('[MercadoPago] Payment info retrieved:', {
        status: response.status,
        statusDetail: response.status_detail,
        amount: response.transaction_amount
      });
      
      return response;
    } catch (error: any) {
      console.error('[MercadoPago] Error getting payment:', error);
      throw new Error('Error al obtener información del pago');
    }
  },

  // ✅ Procesar webhook
  async processWebhook(data: any): Promise<any> {
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
    } catch (error: any) {
      console.error('[MercadoPago] Error processing webhook:', error);
      throw new Error('Error al procesar webhook');
    }
  }

}));
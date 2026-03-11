/**
 * MercadoPago service - Con redirección funcionando
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreService('api::payment.payment', ({ strapi }) => ({

  // ✅ Crear preferencia con redirección
  async createPreference(reservationData: any): Promise<any> {
    try {
      console.log('[MercadoPago] 🚀 Creating preference with redirect URLs...');
      
      // 🔍 DEBUG: Verificar credenciales
      const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
      console.log('[MercadoPago] 🔑 Access Token present:', !!accessToken);
      console.log('[MercadoPago] 🔑 Access Token prefix:', accessToken?.substring(0, 15) + '...');
      
      if (!accessToken) {
        throw new Error('MERCADO_PAGO_ACCESS_TOKEN no está configurado en las variables de entorno');
      }
      
      const { MercadoPagoConfig, Preference } = require('mercadopago');

      const client = new MercadoPagoConfig({ 
        accessToken: accessToken,
        options: { timeout: 15000 }
      });

      const preference = new Preference(client);

      // Separar nombre y apellido para Mercado Pago
      const nameParts = reservationData.name.trim().split(' ');
      const firstName = nameParts[0] || 'Cliente';
      const lastName = nameParts.slice(1).join(' ') || 'Reserva';

      // Procesar teléfono: +5491123456789 -> area_code: "11", number: "23456789"
      let areaCode = '';
      let phoneNumber = '';
      if (reservationData.phone) {
        const cleanPhone = reservationData.phone.replace(/\D/g, ''); // Quitar no-dígitos
        if (cleanPhone.startsWith('549')) {
          // Formato: 549 + area_code(2-4 dígitos) + número
          areaCode = cleanPhone.substring(3, 5); // Toma "11" de "5491123456789"
          phoneNumber = cleanPhone.substring(5); // Toma "23456789"
        } else if (cleanPhone.length >= 10) {
          areaCode = cleanPhone.substring(0, 2);
          phoneNumber = cleanPhone.substring(2);
        }
      }

      console.log('[MercadoPago] 📞 Parsed phone:', { 
        original: reservationData.phone, 
        areaCode, 
        phoneNumber 
      });

      // ✅ Configuración optimizada para producción
      const preferenceData = {
        items: [
          {
            id: `RES-${reservationData.id}`,
            title: "Reserva Casa de Campo El Sosiego",
            description: `Reserva del ${new Date(reservationData.checkIn).toLocaleDateString('es-AR')} al ${new Date(reservationData.checkOut).toLocaleDateString('es-AR')} - ${reservationData.guests} huéspedes`,
            category_id: 'accommodation', // Categoría para alojamiento
            unit_price: Number(reservationData.totalPrice),
            quantity: 1,
            currency_id: 'ARS'
          }
        ],
        
        // ✅ Datos completos del pagador (requeridos para producción)
        payer: {
          name: firstName,
          surname: lastName,
          email: reservationData.email,
          ...(areaCode && phoneNumber && {
            phone: {
              area_code: areaCode,
              number: phoneNumber
            }
          })
        },
        
        // ✅ Descriptor para resumen de tarjeta
        statement_descriptor: 'Casa El Sosiego',
        
        // ✅ Respuesta binaria para aprobación instantánea
        binary_mode: true,
        
        // ✅ URLs de retorno - MercadoPago agregará sus parámetros automáticamente
        back_urls: {
          success: `${process.env.FRONTEND_URL}/reserva-exitosa`,
          failure: `${process.env.FRONTEND_URL}/reserva-fallida`,
          pending: `${process.env.FRONTEND_URL}/reserva-pendiente`
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

      console.log('[MercadoPago] 📋 Preference data:', JSON.stringify({
        payer: preferenceData.payer,
        items: preferenceData.items,
        external_reference: preferenceData.external_reference
      }, null, 2));

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
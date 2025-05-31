import nodemailer from 'nodemailer';

interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
}

interface SendEmailOptions {
  to: string;
  template: EmailTemplate;
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    contentType?: string;
  }>;
}

class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: process.env.EMAIL_PORT === '465',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }

  async sendEmail({ to, template }: SendEmailOptions): Promise<boolean> {
    try {
      const mailOptions = {
        from: {
          name: process.env.EMAIL_FROM_NAME || 'El Sosiego',
          address: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        },
        to,
        subject: template.subject,
        html: template.html,
        text: template.text,
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('✅ Email enviado:', result.messageId);
      return true;
    } catch (error) {
      console.error('❌ Error enviando email:', error);
      return false;
    }
  }

  // Template para confirmación de reserva
  getReservationConfirmationTemplate(reservationData: any): EmailTemplate {
    const {
      confirmationCode,
      guestName,
      guestEmail,
      guestPhone,
      checkIn,
      checkOut,
      guests,
      totalAmount,
    } = reservationData;

    const checkInDate = new Date(checkIn).toLocaleDateString('es-AR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const checkOutDate = new Date(checkOut).toLocaleDateString('es-AR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const nights = Math.ceil((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 3600 * 24));

    return {
      subject: `🏡 Confirmación de Reserva #${confirmationCode} - El Sosiego`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { 
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
              line-height: 1.6; 
              color: #333; 
              margin: 0; 
              padding: 0; 
              background-color: #f4f4f4; 
            }
            .container { 
              max-width: 600px; 
              margin: 20px auto; 
              background: white; 
              border-radius: 10px; 
              overflow: hidden; 
              box-shadow: 0 0 20px rgba(0,0,0,0.1); 
            }
            .header { 
              background: linear-gradient(135deg, #2c5530, #4a7c59); 
              color: white; 
              padding: 40px 30px; 
              text-align: center; 
            }
            .header h1 { margin: 0; font-size: 28px; }
            .header h2 { margin: 10px 0 0 0; font-weight: 300; font-size: 18px; }
            .content { padding: 30px; }
            .info-box { 
              background: #f8f9fa; 
              border-left: 4px solid #2c5530; 
              padding: 20px; 
              margin: 20px 0; 
              border-radius: 0 8px 8px 0; 
            }
            .info-box h3 { margin: 0 0 15px 0; color: #2c5530; }
            .highlight { color: #2c5530; font-weight: bold; font-size: 18px; }
            .footer { 
              background: #f1f1f1; 
              padding: 20px; 
              text-align: center; 
              font-size: 14px; 
              color: #666; 
            }
            .btn { 
              display: inline-block; 
              background: #2c5530; 
              color: white !important; 
              padding: 12px 30px; 
              text-decoration: none; 
              border-radius: 5px; 
              margin: 20px 0; 
              font-weight: bold; 
            }
            .divider { height: 1px; background: #eee; margin: 30px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🏡 El Sosiego</h1>
              <h2>Casa de Campo</h2>
              <p style="margin: 20px 0 0 0; font-size: 16px;">¡Tu reserva ha sido confirmada!</p>
            </div>
            
            <div class="content">
              <p style="font-size: 18px;">Estimado/a <strong>${guestName}</strong>,</p>
              
              <p>¡Gracias por elegir El Sosiego para tu escapada! Nos complace confirmar tu reserva.</p>
              
              <div class="info-box">
                <h3>📋 Detalles de la Reserva</h3>
                <p><strong>Código de Confirmación:</strong> <span class="highlight">${confirmationCode}</span></p>
                <p><strong>Huésped Principal:</strong> ${guestName}</p>
                <p><strong>Email:</strong> ${guestEmail}</p>
                <p><strong>Teléfono:</strong> ${guestPhone}</p>
              </div>
              
              <div class="info-box">
                <h3>📅 Fechas de Estadía</h3>
                <p><strong>Check-in:</strong> ${checkInDate} (15:00 hs)</p>
                <p><strong>Check-out:</strong> ${checkOutDate} (11:00 hs)</p>
                <p><strong>Duración:</strong> ${nights} noche${nights > 1 ? 's' : ''}</p>
                <p><strong>Huéspedes:</strong> ${guests} persona${guests > 1 ? 's' : ''}</p>
              </div>
              
              <div class="info-box">
                <h3>💰 Resumen de Pago</h3>
                <p><strong>Total:</strong> <span class="highlight">$${totalAmount.toLocaleString('es-AR')}</span></p>
              </div>
              
              <div class="divider"></div>
              
              <div class="info-box">
                <h3>📍 Información Importante</h3>
                <ul style="margin: 0; padding-left: 20px;">
                  <li><strong>Dirección:</strong> [Tu dirección aquí]</li>
                  <li><strong>Check-in:</strong> A partir de las 15:00 hs</li>
                  <li><strong>Check-out:</strong> Hasta las 11:00 hs</li>
                  <li>Traer documento de identidad</li>
                  <li>Conservar este código para futuras consultas</li>
                </ul>
              </div>
              
              <div style="text-align: center;">
                <a href="https://wa.me/[tu-telefono]?text=Hola,%20tengo%20una%20consulta%20sobre%20mi%20reserva%20${confirmationCode}" class="btn">
                  💬 Contactar por WhatsApp
                </a>
              </div>
              
              <p>Si tienes alguna pregunta, no dudes en contactarnos. ¡Esperamos recibirte pronto!</p>
              
              <p>Saludos cordiales,<br>
              <strong>Equipo El Sosiego</strong> 🌿</p>
            </div>
            
            <div class="footer">
              <p>El Sosiego - Casa de Campo<br>
              Email: ${process.env.EMAIL_FROM} | Reserva: ${confirmationCode}</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        El Sosiego - Confirmación de Reserva #${confirmationCode}
        
        Estimado/a ${guestName},
        
        ¡Gracias por elegir El Sosiego! Tu reserva ha sido confirmada.
        
        DETALLES DE LA RESERVA:
        - Código: ${confirmationCode}
        - Huésped: ${guestName}
        - Check-in: ${checkInDate} (15:00 hs)
        - Check-out: ${checkOutDate} (11:00 hs)
        - Duración: ${nights} noche${nights > 1 ? 's' : ''}
        - Huéspedes: ${guests}
        - Total: $${totalAmount.toLocaleString('es-AR')}
        
        ¡Esperamos recibirte pronto!
        
        Equipo El Sosiego
      `,
    };
  }

  // Template para recordatorio de pago
  getPaymentReminderTemplate(reservationData: any): EmailTemplate {
    const { confirmationCode, guestName, totalAmount } = reservationData;

    return {
      subject: `⏰ Recordatorio de Pago - Reserva #${confirmationCode}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; background: white; }
            .header { background: #f39c12; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .warning-box { 
              background: #fff3cd; 
              border: 1px solid #ffeaa7; 
              padding: 15px; 
              margin: 15px 0; 
              border-radius: 5px; 
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>⏰ Recordatorio de Pago</h1>
            </div>
            
            <div class="content">
              <p>Estimado/a <strong>${guestName}</strong>,</p>
              
              <div class="warning-box">
                <h3>Su reserva está pendiente de pago</h3>
                <p><strong>Código:</strong> ${confirmationCode}</p>
                <p><strong>Monto:</strong> $${totalAmount.toLocaleString('es-AR')}</p>
              </div>
              
              <p>Para confirmar su reserva, complete el pago lo antes posible.</p>
              
              <p>Saludos,<br>Equipo El Sosiego</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };
  }
}

export default new EmailService();
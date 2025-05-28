/**
 * Shared types for reservation system
 */

// Estados de reserva según el schema
export type ReservationStatus = 'pending' | 'confirmed' | 'paid' | 'cancelled' | 'completed';
export type PaymentStatus = 'pending' | 'processing' | 'paid' | 'failed' | 'refunded';

// Interface base para una reserva
export interface Reservation {
  id: number;
  documentId?: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  name: string;
  email: string;
  phone: string;
  totalPrice: number;
  statusReservation?: ReservationStatus;
  paymentStatus?: PaymentStatus;
  confirmationCode?: string;
  mercadoPagoId?: string;
  specialRequests?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
}

// Interface para crear una reserva
export interface CreateReservationData {
  checkIn: string;
  checkOut: string;
  guests: number;
  name: string;
  email: string;
  phone: string;
  totalPrice: number;
  specialRequests?: string;
  statusReservation?: ReservationStatus;
  paymentStatus?: PaymentStatus;
}

// Interface para actualizar una reserva
export interface UpdateReservationData extends Partial<CreateReservationData> {
  confirmationCode?: string;
  mercadoPagoId?: string;
  notes?: string;
}

// Interface para parámetros de Strapi
export interface StrapiCreateParams {
  data: CreateReservationData;
}

export interface StrapiUpdateParams {
  data: UpdateReservationData;
}

// Interface para respuesta de disponibilidad
export interface AvailabilityResponse {
  available: boolean;
  checkIn: string;
  checkOut: string;
  message: string;
}

// Interface para validación
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

// Interface para estadísticas
export interface ReservationStats {
  totalReservations: number;
  confirmedReservations: number;
  pendingPayments: number;
  paidReservations: number;
  conversionRate: number;
}

// Tipos para MercadoPago
export interface MercadoPagoPreference {
  id: string;
  init_point: string;
  sandbox_init_point: string;
}

export interface MercadoPagoPayment {
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

export interface PaymentInfo {
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

// Interface para crear preferencia de pago
export interface CreatePreferenceRequest {
  reservationId: number;
}

export interface CreatePreferenceResponse {
  preferenceId: string;
  initPoint: string;
  sandboxInitPoint: string;
  publicKey: string;
  paymentId: number;
  reservation: {
    id: number;
    confirmationCode?: string;
    totalPrice: number;
  };
}
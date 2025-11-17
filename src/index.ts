/**
 * x402-stacks - Main Library Export
 * TypeScript library for implementing x402 payment protocol on Stacks blockchain
 */

// Core components
export { X402PaymentClient } from './client';
export { X402PaymentVerifier } from './verifier';

// Middleware
export {
  x402PaymentRequired,
  getPayment,
  createPaymentGate,
  conditionalPayment,
  tieredPayment,
  paymentRateLimit,
} from './middleware';

// Types
export type {
  NetworkType,
  PaymentStatus,
  X402PaymentRequired,
  PaymentDetails,
  PaymentResult,
  VerifiedPayment,
  VerificationOptions,
  X402MiddlewareConfig,
  StacksTransaction,
  X402ClientConfig,
  FacilitatorVerifyRequest,
  FacilitatorVerifyResponse,
} from './types';

// Utilities
export {
  microSTXtoSTX,
  STXtoMicroSTX,
  generateKeypair,
  isValidStacksAddress,
  getAddressNetwork,
  getAPIEndpoint,
  getExplorerURL,
  formatPaymentAmount,
  parsePaymentMemo,
  createPaymentMemo,
  estimateFee,
  waitWithBackoff,
  retryWithBackoff,
  isPaymentRequestExpired,
  createExpirationTimestamp,
  truncateAddress,
  getNetworkInstance,
} from './utils';

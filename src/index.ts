/**
 * x402-stacks - Main Library Export
 * TypeScript library for implementing x402 payment protocol on Stacks blockchain
 */

// x402 Client (axios interceptor pattern - recommended)
export {
  withPaymentInterceptor,
  createPaymentClient,
  privateKeyToAccount,
  decodeXPaymentResponse,
  encodeXPaymentResponse,
} from './interceptor';

// Legacy client (class-based)
export { X402PaymentClient } from './client';

// Server components
export { X402PaymentVerifier, SettleOptions } from './verifier';

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
  TokenType,
  TokenContract,
  X402PaymentRequired,
  PaymentDetails,
  PaymentResult,
  SignedPaymentResult,
  VerifiedPayment,
  VerificationOptions,
  X402MiddlewareConfig,
  StacksTransaction,
  X402ClientConfig,
  FacilitatorVerifyRequest,
  FacilitatorVerifyResponse,
  FacilitatorSettleRequest,
  FacilitatorSettleResponse,
  StacksAccount,
  PaymentResponse,
} from './types';

// Utilities
export {
  microSTXtoSTX,
  STXtoMicroSTX,
  satsToBTC,
  BTCtoSats,
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
  getDefaultSBTCContract,
  getTokenSymbol,
  getTokenDecimals,
  getTokenSmallestUnit,
} from './utils';

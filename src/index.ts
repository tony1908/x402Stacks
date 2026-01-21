/**
 * x402-stacks - Main Library Export
 * TypeScript library for implementing x402 payment protocol on Stacks blockchain
 *
 * This library follows Coinbase's x402 naming conventions:
 * - Default exports (no suffix): V2 Coinbase-compatible protocol
 * - V1 suffix: Legacy protocol for backward compatibility
 */

// ===== DEFAULT EXPORTS (Coinbase Compatible V2) =====

// Client (axios interceptor pattern)
export {
  wrapAxiosWithPayment,
  createPaymentClient,
  privateKeyToAccount,
  decodePaymentResponse,
  decodePaymentRequired,
  encodePaymentPayload,
  getPaymentResponseFromHeaders,
  // Backward compatibility aliases
  withPaymentInterceptorV2,
  createPaymentClientV2,
  privateKeyToAccountV2,
} from './interceptor-v2';

// Server components
export {
  X402PaymentVerifier,
  createVerifier,
  VerifyOptions,
  SettleOptions,
  // Backward compatibility aliases
  X402PaymentVerifierV2,
  createVerifierV2,
} from './verifier-v2';
export type { VerifyOptionsV2, SettleOptionsV2 } from './verifier-v2';

// Middleware
export {
  paymentMiddleware,
  getPayment,
  createPaymentGate,
  conditionalPayment,
  tieredPayment,
  paymentRateLimit,
  parsePaymentRequiredHeader,
  parsePaymentResponseHeader,
  PaymentMiddlewareConfig,
  // Backward compatibility aliases
  x402PaymentRequiredV2,
  getPaymentV2,
  createPaymentGateV2,
  conditionalPaymentV2,
  tieredPaymentV2,
  paymentRateLimitV2,
} from './middleware-v2';
export type { X402MiddlewareConfigV2 } from './middleware-v2';

// Types
export type {
  NetworkV2,
  ResourceInfo,
  PaymentRequirementsV2,
  PaymentRequiredV2,
  StacksPayloadV2,
  PaymentPayloadV2,
  VerifyResponseV2,
  SettlementResponseV2,
  FacilitatorVerifyRequestV2,
  FacilitatorSettleRequestV2,
  SupportedKind,
  SupportedResponse,
  X402ErrorCode,
} from './types-v2';

// Constants
export {
  STACKS_NETWORKS,
  X402_HEADERS,
  X402_ERROR_CODES,
  // Backward compatibility alias
  X402_HEADERS_V2,
} from './types-v2';

// ===== V1 EXPORTS (Legacy) =====

// V1 Client
export {
  wrapAxiosWithPaymentV1,
  createPaymentClientV1,
  privateKeyToAccountV1,
  decodeXPaymentResponse,
  encodeXPaymentResponse,
  // Original names (deprecated)
  withPaymentInterceptor,
} from './interceptor';

// V1 Legacy client (class-based)
export { X402PaymentClient } from './client';

// V1 Server components
export {
  X402PaymentVerifierV1,
  SettleOptionsV1,
} from './verifier';

// V1 Middleware
export {
  paymentMiddlewareV1,
  getPaymentV1,
  createPaymentGateV1,
  conditionalPaymentV1,
  tieredPaymentV1,
  paymentRateLimitV1,
  // Original names (deprecated)
  x402PaymentRequired,
} from './middleware';

// V1 Types (shared with default)
export type {
  NetworkType,
  PaymentStatus,
  TokenType,
  TokenContract,
  X402PaymentRequired as X402PaymentRequiredV1,
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

// ===== UTILITIES (shared) =====

export {
  // Currency conversion
  microSTXtoSTX,
  STXtoMicroSTX,
  satsToBTC,
  BTCtoSats,
  USDCxToMicroUSDCx,
  microUSDCxToUSDCx,

  // Account utilities
  generateKeypair,
  isValidStacksAddress,
  getAddressNetwork,

  // Network utilities
  getAPIEndpoint,
  getExplorerURL,
  getNetworkInstance,

  // Token utilities
  getDefaultSBTCContract,
  getDefaultUSDCxContract,
  getTokenSymbol,
  getTokenDecimals,
  getTokenSmallestUnit,

  // Payment utilities
  formatPaymentAmount,
  parsePaymentMemo,
  createPaymentMemo,
  estimateFee,

  // Timing utilities
  waitWithBackoff,
  retryWithBackoff,
  isPaymentRequestExpired,
  createExpirationTimestamp,

  // Display utilities
  truncateAddress,

  // CAIP-2 utilities
  networkToCAIP2,
  networkFromCAIP2,
  isValidStacksCAIP2,
  assetToV2,
  assetFromV2,
} from './utils';

/**
 * x402-stacks - V2 Type definitions for x402 payment protocol (Coinbase compatible)
 */

// ===== Network Types =====

/**
 * CAIP-2 Network identifier for Stacks
 */
export type NetworkV2 = `stacks:${string}`;

/**
 * Stacks network CAIP-2 identifiers
 */
export const STACKS_NETWORKS = {
  MAINNET: 'stacks:1' as NetworkV2,
  TESTNET: 'stacks:2147483648' as NetworkV2,
} as const;

// ===== Resource Info =====

/**
 * Information about the protected resource
 */
export interface ResourceInfo {
  /** URL of the protected resource */
  url: string;
  /** Human-readable description of the resource */
  description?: string;
  /** MIME type of the expected response */
  mimeType?: string;
}

// ===== Payment Requirements V2 =====

/**
 * Payment requirements for x402 v2 protocol
 */
export interface PaymentRequirementsV2 {
  /** Payment scheme identifier (e.g., "exact") */
  scheme: string;
  /** Network identifier in CAIP-2 format (e.g., "stacks:1") */
  network: NetworkV2;
  /** Required payment amount in atomic units (microSTX, satoshis, etc.) */
  amount: string;
  /** Asset identifier ("STX" or contract identifier like "SP...address.contract-name") */
  asset: string;
  /** Recipient address */
  payTo: string;
  /** Maximum time allowed for payment completion */
  maxTimeoutSeconds: number;
  /** Scheme-specific additional information */
  extra?: Record<string, unknown>;
}

// ===== Payment Required V2 =====

/**
 * Payment required response for x402 v2 protocol
 */
export interface PaymentRequiredV2 {
  /** Protocol version (must be 2) */
  x402Version: 2;
  /** Human-readable error message */
  error?: string;
  /** Information about the protected resource */
  resource: ResourceInfo;
  /** Array of acceptable payment methods */
  accepts: PaymentRequirementsV2[];
  /** Protocol extensions data */
  extensions?: Record<string, unknown>;
}

// ===== Payment Payload V2 =====

/**
 * Stacks-specific payment payload (transaction data)
 */
export interface StacksPayloadV2 {
  /** Signed transaction hex */
  transaction: string;
}

/**
 * Payment payload for x402 v2 protocol
 */
export interface PaymentPayloadV2 {
  /** Protocol version (must be 2) */
  x402Version: 2;
  /** Information about the resource being accessed */
  resource?: ResourceInfo;
  /** The payment method chosen by the client */
  accepted: PaymentRequirementsV2;
  /** Scheme-specific payment data (signed transaction for Stacks) */
  payload: StacksPayloadV2;
  /** Protocol extensions data */
  extensions?: Record<string, unknown>;
}

// ===== Verify Response V2 =====

/**
 * Verification response for x402 v2 protocol
 */
export interface VerifyResponseV2 {
  /** Whether the payment authorization is valid */
  isValid: boolean;
  /** Reason for invalidity (omitted if valid) */
  invalidReason?: string;
  /** Address of the payer's wallet */
  payer?: string;
}

// ===== Settlement Response V2 =====

/**
 * Settlement response for x402 v2 protocol
 */
export interface SettlementResponseV2 {
  /** Whether the payment settlement was successful */
  success: boolean;
  /** Error reason if settlement failed */
  errorReason?: string;
  /** Address of the payer's wallet */
  payer?: string;
  /** Blockchain transaction hash */
  transaction: string;
  /** Network identifier in CAIP-2 format */
  network: NetworkV2;
}

// ===== Facilitator API Types =====

/**
 * Request body for POST /verify endpoint
 */
export interface FacilitatorVerifyRequestV2 {
  /** Protocol version */
  x402Version: 2;
  /** Payment payload from client */
  paymentPayload: PaymentPayloadV2;
  /** Payment requirements from server */
  paymentRequirements: PaymentRequirementsV2;
}

/**
 * Request body for POST /settle endpoint
 */
export interface FacilitatorSettleRequestV2 {
  /** Protocol version */
  x402Version: 2;
  /** Payment payload from client */
  paymentPayload: PaymentPayloadV2;
  /** Payment requirements from server */
  paymentRequirements: PaymentRequirementsV2;
}

// ===== Supported Response =====

/**
 * A supported payment kind
 */
export interface SupportedKind {
  /** Protocol version supported */
  x402Version: number;
  /** Payment scheme identifier */
  scheme: string;
  /** Network identifier in CAIP-2 format */
  network: string;
  /** Additional scheme-specific configuration */
  extra?: Record<string, unknown>;
}

/**
 * Response from GET /supported endpoint
 */
export interface SupportedResponse {
  /** Array of supported payment kinds */
  kinds: SupportedKind[];
  /** Array of supported extension identifiers */
  extensions: string[];
  /** Map of CAIP-2 patterns to public signer addresses */
  signers: Record<string, string[]>;
}

// ===== HTTP Headers =====

/**
 * x402 HTTP header names (V2 protocol)
 */
export const X402_HEADERS = {
  /** Header containing payment required info (base64 encoded) */
  PAYMENT_REQUIRED: 'payment-required',
  /** Header containing payment signature/payload (base64 encoded) */
  PAYMENT_SIGNATURE: 'payment-signature',
  /** Header containing settlement response (base64 encoded) */
  PAYMENT_RESPONSE: 'payment-response',
} as const;

/** @deprecated Use X402_HEADERS instead */
export const X402_HEADERS_V2 = X402_HEADERS;

// ===== Error Codes =====

/**
 * Standard x402 error codes
 */
export const X402_ERROR_CODES = {
  INSUFFICIENT_FUNDS: 'insufficient_funds',
  INVALID_NETWORK: 'invalid_network',
  INVALID_PAYLOAD: 'invalid_payload',
  INVALID_PAYMENT_REQUIREMENTS: 'invalid_payment_requirements',
  INVALID_SCHEME: 'invalid_scheme',
  UNSUPPORTED_SCHEME: 'unsupported_scheme',
  INVALID_X402_VERSION: 'invalid_x402_version',
  INVALID_TRANSACTION_STATE: 'invalid_transaction_state',
  UNEXPECTED_VERIFY_ERROR: 'unexpected_verify_error',
  UNEXPECTED_SETTLE_ERROR: 'unexpected_settle_error',
  RECIPIENT_MISMATCH: 'recipient_mismatch',
  AMOUNT_INSUFFICIENT: 'amount_insufficient',
  SENDER_MISMATCH: 'sender_mismatch',
  TRANSACTION_NOT_FOUND: 'transaction_not_found',
  TRANSACTION_PENDING: 'transaction_pending',
  TRANSACTION_FAILED: 'transaction_failed',
  BROADCAST_FAILED: 'broadcast_failed',
} as const;

export type X402ErrorCode = typeof X402_ERROR_CODES[keyof typeof X402_ERROR_CODES];

/**
 * x402-stacks - Type definitions for x402 payment protocol on Stacks blockchain
 */

import { StacksNetwork } from '@stacks/network';

/**
 * Network type for Stacks blockchain
 */
export type NetworkType = 'mainnet' | 'testnet';

/**
 * Token type for payments
 */
export type TokenType = 'STX' | 'sBTC' | 'USDCx';

/**
 * Token contract configuration
 */
export interface TokenContract {
  /** Contract address */
  address: string;
  /** Contract name */
  name: string;
}

/**
 * Payment status from transaction verification
 */
export type PaymentStatus = 'pending' | 'success' | 'failed' | 'not_found';

/**
 * HTTP 402 Payment Required response body
 */
export interface X402PaymentRequired {
  /** Maximum amount required (microSTX for STX, sats for sBTC) */
  maxAmountRequired: string;

  /** Resource being accessed */
  resource: string;

  /** Stacks address to send payment to */
  payTo: string;

  /** Network to use (mainnet or testnet) */
  network: NetworkType;

  /** Unique nonce for this payment request */
  nonce: string;

  /** ISO timestamp when payment request expires */
  expiresAt: string;

  /** Optional memo to include in the payment */
  memo?: string;

  /** Token type (defaults to STX) */
  tokenType?: TokenType;

  /** Token contract info (required for sBTC) */
  tokenContract?: TokenContract;
}

/**
 * Payment details for making a transfer
 */
export interface PaymentDetails {
  /** Recipient Stacks address */
  recipient: string;

  /** Amount (microSTX for STX, sats for sBTC) */
  amount: bigint;

  /** Sender's private key (hex string) */
  senderKey: string;

  /** Network to use */
  network: NetworkType | StacksNetwork;

  /** Optional memo */
  memo?: string;

  /** Optional nonce (auto-fetched if not provided) */
  nonce?: bigint;

  /** Optional fee (auto-estimated if not provided) */
  fee?: bigint;

  /** Build as sponsored transaction (for gasless relay) */
  sponsored?: boolean;

  /** Token type (defaults to STX) */
  tokenType?: TokenType;

  /** Token contract info (required for sBTC) */
  tokenContract?: TokenContract;

  /** Sender address (required for sBTC) */
  senderAddress?: string;
}

/**
 * Result of broadcasting a payment transaction
 */
export interface PaymentResult {
  /** Transaction ID */
  txId: string;

  /** Raw transaction hex */
  txRaw: string;

  /** Whether broadcast was successful */
  success: boolean;

  /** Error message if failed */
  error?: string;
}

/**
 * Verified payment transaction details
 */
export interface VerifiedPayment {
  /** Transaction ID */
  txId: string;

  /** Payment status */
  status: PaymentStatus;

  /** Sender's Stacks address */
  sender: string;

  /** Recipient's Stacks address */
  recipient: string;

  /** Amount transferred in microSTX */
  amount: bigint;

  /** Optional memo from transaction */
  memo?: string;

  /** Block height (if confirmed) */
  blockHeight?: number;

  /** Receipt timestamp */
  timestamp?: number;

  /** Whether payment is valid for the request */
  isValid: boolean;

  /** Validation error message if invalid */
  validationError?: string;
}

/**
 * Options for payment verification
 */
export interface VerificationOptions {
  /** Expected recipient address */
  expectedRecipient: string;

  /** Minimum amount required (microSTX for STX, sats for sBTC) */
  minAmount: bigint;

  /** Expected sender address (optional) */
  expectedSender?: string;

  /** Expected memo/nonce (optional) */
  expectedMemo?: string;

  /** Maximum age of transaction in seconds (optional) */
  maxAge?: number;

  /** API resource being accessed (optional, for x402 tracking) */
  resource?: string;

  /** HTTP method being used (optional, for x402 tracking) */
  method?: string;

  /** Token type (defaults to STX) */
  tokenType?: TokenType;

  /** Token contract info (required for sBTC) */
  tokenContract?: TokenContract;
}

/**
 * Configuration for x402 middleware
 */
export interface X402MiddlewareConfig {
  /** Amount required (microSTX for STX, sats for sBTC) */
  amount: string | bigint;

  /** Server's Stacks address to receive payments */
  address: string;

  /** Network to use */
  network: NetworkType;

  /** Facilitator API URL for payment verification */
  facilitatorUrl?: string;

  /** Resource identifier (defaults to request path) */
  resource?: string;

  /** Payment expiration time in seconds (default: 300) */
  expirationSeconds?: number;

  /** Custom nonce generator (optional) */
  nonceGenerator?: () => string;

  /** Custom payment validator (optional) */
  paymentValidator?: (payment: VerifiedPayment) => boolean | Promise<boolean>;

  /** Token type (defaults to STX) */
  tokenType?: TokenType;

  /** Token contract info (required for sBTC) */
  tokenContract?: TokenContract;
}

/**
 * Transaction data from Stacks API
 */
export interface StacksTransaction {
  tx_id: string;
  nonce: number;
  fee_rate: string;
  sender_address: string;
  sponsored: boolean;
  post_condition_mode: string;
  post_conditions: any[];
  anchor_mode: string;
  tx_status: 'success' | 'pending' | 'failed' | 'abort_by_response' | 'abort_by_post_condition';
  tx_type: 'token_transfer' | 'smart_contract' | 'contract_call' | 'poison_microblock';
  receipt_time: number;
  receipt_time_iso: string;
  block_hash?: string;
  block_height?: number;
  canonical?: boolean;
  tx_index?: number;
  token_transfer?: {
    recipient_address: string;
    amount: string;
    memo: string;
  };
  events?: any[];
}

/**
 * Client configuration
 */
export interface X402ClientConfig {
  /** Network to use */
  network: NetworkType;

  /** Private key for signing transactions */
  privateKey: string;

  /** Facilitator API URL for payment verification (optional) */
  facilitatorUrl?: string;

  /** Custom API endpoint (optional) */
  apiEndpoint?: string;

  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * Facilitator API request for payment verification
 */
export interface FacilitatorVerifyRequest {
  /** Transaction ID to verify */
  tx_id: string;

  /** Expected recipient address */
  expected_recipient: string;

  /** Minimum amount (microSTX for STX, sats for sBTC) */
  min_amount: number;

  /** Expected sender address (optional) */
  expected_sender?: string;

  /** Expected memo (optional) */
  expected_memo?: string;

  /** Network type */
  network: NetworkType;

  /** API resource being accessed (optional, for x402 tracking) */
  resource?: string;

  /** HTTP method being used (optional, for x402 tracking) */
  method?: string;

  /** Token type in Facilitator API format: 'STX', 'SBTC', or 'USDCX' (uppercase) */
  token_type?: 'STX' | 'SBTC' | 'USDCX';
}

/**
 * Facilitator API response for payment verification
 */
export interface FacilitatorVerifyResponse {
  /** Whether payment is valid */
  valid: boolean;

  /** Transaction ID */
  tx_id?: string;

  /** Sender address */
  sender_address?: string;

  /** Recipient address */
  recipient_address?: string;

  /** Amount in microSTX */
  amount?: number;

  /** Transaction fee */
  fee?: number;

  /** Transaction nonce */
  nonce?: number;

  /** Transaction status */
  status?: string;

  /** Block height */
  block_height?: number;

  /** Transaction memo */
  memo?: string;

  /** Network */
  network?: string;

  /** API resource accessed */
  resource?: string;

  /** HTTP method used */
  method?: string;

  /** Validation errors if invalid */
  validation_errors?: string[];

  /** Error message */
  error?: string;
}

/**
 * Facilitator API request for payment settlement (x402 facilitator pattern)
 */
export interface FacilitatorSettleRequest {
  /** Hex-encoded signed transaction (with or without 0x prefix) */
  signed_transaction: string;

  /** Token type: 'STX', 'SBTC', or 'USDCX' */
  token_type?: 'STX' | 'SBTC' | 'USDCX';

  /** Expected recipient address */
  expected_recipient: string;

  /** Minimum amount in base units (microSTX or satoshis) */
  min_amount: number;

  /** Expected sender address (optional) */
  expected_sender?: string;

  /** Network type */
  network: NetworkType;

  /** API resource being accessed (optional, for tracking) */
  resource?: string;

  /** HTTP method being used (optional, for tracking) */
  method?: string;
}

/**
 * Facilitator API response for payment settlement
 */
export interface FacilitatorSettleResponse {
  /** Whether settlement was successful */
  success: boolean;

  /** Transaction ID */
  tx_id?: string;

  /** Token type */
  token_type?: string;

  /** Sender address */
  sender_address?: string;

  /** Recipient address */
  recipient_address?: string;

  /** Amount transferred */
  amount?: number;

  /** Transaction fee */
  fee?: number;

  /** Transaction status */
  status?: string;

  /** Block height (if confirmed) */
  block_height?: number;

  /** Network */
  network?: string;

  /** Validation errors if failed */
  validation_errors?: string[];

  /** Error message */
  error?: string;
}

/**
 * Result of signing a payment transaction (without broadcasting)
 */
export interface SignedPaymentResult {
  /** Hex-encoded signed transaction */
  signedTransaction: string;

  /** Whether signing was successful */
  success: boolean;

  /** Sender address */
  senderAddress?: string;

  /** Error message if failed */
  error?: string;
}

/**
 * Stacks account for signing transactions (similar to viem's account pattern)
 */
export interface StacksAccount {
  /** Stacks address */
  address: string;

  /** Private key (hex string) */
  privateKey: string;

  /** Network type */
  network: NetworkType;
}

/**
 * Decoded X-PAYMENT-RESPONSE header
 */
export interface PaymentResponse {
  /** Transaction ID */
  txId: string;

  /** Payment status */
  status: string;

  /** Block height (if confirmed) */
  blockHeight?: number;

  /** Any additional fields from the response */
  [key: string]: unknown;
}

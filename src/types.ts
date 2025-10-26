/**
 * x402-stacks - Type definitions for x402 payment protocol on Stacks blockchain
 */

import { StacksNetwork } from '@stacks/network';

/**
 * Network type for Stacks blockchain
 */
export type NetworkType = 'mainnet' | 'testnet';

/**
 * Payment status from transaction verification
 */
export type PaymentStatus = 'pending' | 'success' | 'failed' | 'not_found';

/**
 * HTTP 402 Payment Required response body
 */
export interface X402PaymentRequired {
  /** Maximum amount required in microSTX (1 STX = 1,000,000 microSTX) */
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
}

/**
 * Payment details for making a transfer
 */
export interface PaymentDetails {
  /** Recipient Stacks address */
  recipient: string;

  /** Amount in microSTX */
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

  /** Minimum amount required in microSTX */
  minAmount: bigint;

  /** Expected sender address (optional) */
  expectedSender?: string;

  /** Expected memo/nonce (optional) */
  expectedMemo?: string;

  /** Whether to accept unconfirmed transactions */
  acceptUnconfirmed?: boolean;

  /** Maximum age of transaction in seconds (optional) */
  maxAge?: number;
}

/**
 * Configuration for x402 middleware
 */
export interface X402MiddlewareConfig {
  /** Amount required in microSTX */
  amount: string | bigint;

  /** Server's Stacks address to receive payments */
  address: string;

  /** Network to use */
  network: NetworkType;

  /** Resource identifier (defaults to request path) */
  resource?: string;

  /** Payment expiration time in seconds (default: 300) */
  expirationSeconds?: number;

  /** Whether to accept unconfirmed transactions (default: false) */
  acceptUnconfirmed?: boolean;

  /** Custom nonce generator (optional) */
  nonceGenerator?: () => string;

  /** Custom payment validator (optional) */
  paymentValidator?: (payment: VerifiedPayment) => boolean | Promise<boolean>;
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

  /** Custom API endpoint (optional) */
  apiEndpoint?: string;

  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
}

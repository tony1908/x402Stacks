/**
 * x402-stacks - Payment Verifier
 * Handles verification of STX token transfers using facilitator API
 */

import axios, { AxiosInstance } from 'axios';
import {
  NetworkType,
  VerifiedPayment,
  VerificationOptions,
  PaymentStatus,
  FacilitatorVerifyRequest,
  FacilitatorVerifyResponse,
  FacilitatorSettleRequest,
  FacilitatorSettleResponse,
} from './types';

/**
 * Options for settling a payment via the facilitator
 */
export interface SettleOptions {
  /** Expected recipient address */
  expectedRecipient: string;

  /** Minimum amount required (microSTX for STX, sats for sBTC) */
  minAmount: bigint;

  /** Expected sender address (optional) */
  expectedSender?: string;

  /** Token type (defaults to STX) */
  tokenType?: 'STX' | 'sBTC' | 'USDCx';

  /** API resource being accessed (optional, for tracking) */
  resource?: string;

  /** HTTP method being used (optional, for tracking) */
  method?: string;
}

/**
 * Payment verifier for validating x402 payments on Stacks
 */
export class X402PaymentVerifier {
  private facilitatorUrl: string;
  private network: NetworkType;
  private httpClient: AxiosInstance;

  constructor(facilitatorUrl: string = 'http://localhost:8085', network: NetworkType = 'mainnet') {
    this.facilitatorUrl = facilitatorUrl;
    this.network = network;

    this.httpClient = axios.create({
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Verify a payment transaction using facilitator API
   * Always requires confirmed transactions
   */
  async verifyPayment(
    txId: string,
    options: VerificationOptions
  ): Promise<VerifiedPayment> {
    try {
      // Build facilitator API request (always require confirmed transactions)
      const request: FacilitatorVerifyRequest = {
        tx_id: txId,
        expected_recipient: options.expectedRecipient,
        min_amount: Number(options.minAmount),
        expected_sender: options.expectedSender,
        expected_memo: options.expectedMemo,
        network: this.network,
        resource: options.resource,
        method: options.method,
        // Map token type to facilitator API format (STX, SBTC, or USDCX)
        token_type: options.tokenType === 'sBTC' ? 'SBTC' : options.tokenType === 'USDCx' ? 'USDCX' : 'STX',
      };

      // Call facilitator API
      const response = await this.httpClient.post<FacilitatorVerifyResponse>(
        `${this.facilitatorUrl}/api/v1/verify`,
        request
      );

      const data = response.data;

      // Map facilitator response to VerifiedPayment
      return this.mapFacilitatorResponse(txId, data);
    } catch (error: any) {
      // Handle API errors
      if (error.response?.data) {
        const errorData = error.response.data;

        // If facilitator returned validation errors
        if (errorData.valid === false) {
          return {
            txId,
            status: 'not_found',
            sender: errorData.sender_address || '',
            recipient: errorData.recipient_address || '',
            amount: BigInt(errorData.amount || 0),
            memo: errorData.memo,
            blockHeight: errorData.block_height,
            isValid: false,
            validationError: errorData.validation_errors?.join(', ') || 'Payment validation failed',
          };
        }

        // If facilitator returned an error
        if (errorData.error) {
          return {
            txId,
            status: 'not_found',
            sender: '',
            recipient: '',
            amount: BigInt(0),
            isValid: false,
            validationError: errorData.error,
          };
        }
      }

      return {
        txId,
        status: 'not_found',
        sender: '',
        recipient: '',
        amount: BigInt(0),
        isValid: false,
        validationError: error instanceof Error ? error.message : 'Verification failed',
      };
    }
  }

  /**
   * Map facilitator API response to VerifiedPayment
   */
  private mapFacilitatorResponse(txId: string, data: FacilitatorVerifyResponse): VerifiedPayment {
    // Map facilitator status to PaymentStatus
    let status: PaymentStatus = 'not_found';
    if (data.status === 'confirmed') {
      status = 'success';
    } else if (data.status === 'pending') {
      status = 'pending';
    } else if (data.status === 'failed') {
      status = 'failed';
    }

    return {
      txId: data.tx_id || txId,
      status,
      sender: data.sender_address || '',
      recipient: data.recipient_address || '',
      amount: BigInt(data.amount || 0),
      memo: data.memo,
      blockHeight: data.block_height,
      timestamp: undefined, // Facilitator doesn't return timestamp
      isValid: data.valid,
      validationError: data.validation_errors?.join(', '),
    };
  }


  /**
   * Quick check if a payment is valid (returns boolean only)
   */
  async isPaymentValid(txId: string, options: VerificationOptions): Promise<boolean> {
    const verification = await this.verifyPayment(txId, options);
    return verification.isValid && verification.status === 'success';
  }

  /**
   * Settle a payment using the facilitator API (x402 facilitator pattern)
   * The facilitator will broadcast the signed transaction and wait for confirmation
   */
  async settlePayment(
    signedTransaction: string,
    options: SettleOptions
  ): Promise<VerifiedPayment> {
    try {
      // Build facilitator API request
      const request: FacilitatorSettleRequest = {
        signed_transaction: signedTransaction,
        expected_recipient: options.expectedRecipient,
        min_amount: Number(options.minAmount),
        expected_sender: options.expectedSender,
        network: this.network,
        resource: options.resource,
        method: options.method,
        token_type: options.tokenType === 'sBTC' ? 'SBTC' : options.tokenType === 'USDCx' ? 'USDCX' : 'STX',
      };

      // Call facilitator API settle endpoint
      const response = await this.httpClient.post<FacilitatorSettleResponse>(
        `${this.facilitatorUrl}/api/v1/settle`,
        request
      );

      const data = response.data;

      // Map facilitator response to VerifiedPayment
      return this.mapSettleResponse(data);
    } catch (error: any) {
      // Handle API errors
      if (error.response?.data) {
        const errorData = error.response.data as FacilitatorSettleResponse;

        // If facilitator returned validation errors
        if (errorData.success === false) {
          return {
            txId: errorData.tx_id || '',
            status: 'failed',
            sender: errorData.sender_address || '',
            recipient: errorData.recipient_address || '',
            amount: BigInt(errorData.amount || 0),
            blockHeight: errorData.block_height,
            isValid: false,
            validationError: errorData.validation_errors?.join(', ') || errorData.error || 'Settlement failed',
          };
        }
      }

      return {
        txId: '',
        status: 'failed',
        sender: '',
        recipient: '',
        amount: BigInt(0),
        isValid: false,
        validationError: error instanceof Error ? error.message : 'Settlement failed',
      };
    }
  }

  /**
   * Map facilitator settle response to VerifiedPayment
   */
  private mapSettleResponse(data: FacilitatorSettleResponse): VerifiedPayment {
    // Map facilitator status to PaymentStatus
    let status: PaymentStatus = 'failed';
    if (data.success && data.status === 'confirmed') {
      status = 'success';
    } else if (data.status === 'pending') {
      status = 'pending';
    }

    return {
      txId: data.tx_id || '',
      status,
      sender: data.sender_address || '',
      recipient: data.recipient_address || '',
      amount: BigInt(data.amount || 0),
      blockHeight: data.block_height,
      timestamp: undefined,
      isValid: data.success === true && data.status === 'confirmed',
      validationError: data.validation_errors?.join(', ') || data.error,
    };
  }

  /**
   * Wait for transaction confirmation with polling
   * Polls until transaction is confirmed on blockchain
   */
  async waitForConfirmation(
    txId: string,
    options: VerificationOptions,
    maxAttempts: number = 20,
    intervalMs: number = 30000
  ): Promise<VerifiedPayment | null> {
    for (let i = 0; i < maxAttempts; i++) {
      const verification = await this.verifyPayment(txId, options);

      if (verification.isValid && verification.status === 'success') {
        return verification;
      }

      if (verification.status === 'failed') {
        throw new Error(`Transaction failed: ${verification.validationError}`);
      }

      // Wait before next attempt
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    return null;
  }
}

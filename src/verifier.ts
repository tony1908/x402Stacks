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
} from './types';

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
   */
  async verifyPayment(
    txId: string,
    options: VerificationOptions
  ): Promise<VerifiedPayment> {
    try {
      // Build facilitator API request
      const request: FacilitatorVerifyRequest = {
        tx_id: txId,
        expected_recipient: options.expectedRecipient,
        min_amount: Number(options.minAmount),
        expected_sender: options.expectedSender,
        expected_memo: options.expectedMemo,
        accept_unconfirmed: options.acceptUnconfirmed || false,
        network: this.network,
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
   * Wait for transaction confirmation with polling
   */
  async waitForConfirmation(
    txId: string,
    options: VerificationOptions,
    maxAttempts: number = 20,
    intervalMs: number = 30000
  ): Promise<VerifiedPayment | null> {
    for (let i = 0; i < maxAttempts; i++) {
      const verification = await this.verifyPayment(txId, {
        ...options,
        acceptUnconfirmed: true,
      });

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

/**
 * x402-stacks - Payment Verifier
 * Handles verification of STX token transfers for server-side validation
 */

import axios, { AxiosInstance } from 'axios';
import {
  NetworkType,
  VerifiedPayment,
  VerificationOptions,
  PaymentStatus,
  StacksTransaction,
} from './types';

/**
 * Payment verifier for validating x402 payments on Stacks
 */
export class X402PaymentVerifier {
  private apiEndpoint: string;
  private httpClient: AxiosInstance;

  constructor(network: NetworkType = 'mainnet', customEndpoint?: string) {
    this.apiEndpoint =
      customEndpoint ||
      (network === 'mainnet'
        ? 'https://stacks-node-api.mainnet.stacks.co'
        : 'https://stacks-node-api.testnet.stacks.co');

    this.httpClient = axios.create({
      baseURL: this.apiEndpoint,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Verify a payment transaction
   */
  async verifyPayment(
    txId: string,
    options: VerificationOptions
  ): Promise<VerifiedPayment> {
    try {
      // First try to get confirmed transaction
      let transaction = await this.getConfirmedTransaction(txId);
      let isUnconfirmed = false;

      // If not found and we accept unconfirmed, try unconfirmed endpoint
      if (!transaction && options.acceptUnconfirmed) {
        transaction = await this.getUnconfirmedTransaction(txId);
        isUnconfirmed = true;
      }

      // Transaction not found
      if (!transaction) {
        return {
          txId,
          status: 'not_found',
          sender: '',
          recipient: '',
          amount: BigInt(0),
          isValid: false,
          validationError: 'Transaction not found',
        };
      }

      // Extract transaction details
      const status = this.mapTransactionStatus(transaction.tx_status, isUnconfirmed);

      // Check if it's a token transfer
      if (transaction.tx_type !== 'token_transfer' || !transaction.token_transfer) {
        return {
          txId,
          status,
          sender: transaction.sender_address,
          recipient: '',
          amount: BigInt(0),
          isValid: false,
          validationError: 'Transaction is not a token transfer',
        };
      }

      const { recipient_address, amount, memo } = transaction.token_transfer;
      const amountBigInt = BigInt(amount);

      // Build base verification result
      const verifiedPayment: VerifiedPayment = {
        txId,
        status,
        sender: transaction.sender_address,
        recipient: recipient_address,
        amount: amountBigInt,
        memo: memo || undefined,
        blockHeight: transaction.block_height,
        timestamp: transaction.receipt_time,
        isValid: false,
      };

      // Validate payment
      const validation = this.validatePayment(transaction, options, isUnconfirmed);
      verifiedPayment.isValid = validation.isValid;
      verifiedPayment.validationError = validation.error;

      return verifiedPayment;
    } catch (error) {
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
   * Get confirmed transaction from the blockchain
   */
  private async getConfirmedTransaction(txId: string): Promise<StacksTransaction | null> {
    try {
      const response = await this.httpClient.get<StacksTransaction>(
        `/extended/v1/tx/${txId}`
      );
      return response.data;
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get unconfirmed transaction from mempool
   */
  private async getUnconfirmedTransaction(txId: string): Promise<StacksTransaction | null> {
    try {
      const response = await this.httpClient.get<StacksTransaction>(
        `/extended/v1/tx/${txId}/unconfirmed`
      );
      return response.data;
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Map Stacks transaction status to PaymentStatus
   */
  private mapTransactionStatus(
    txStatus: StacksTransaction['tx_status'],
    isUnconfirmed: boolean
  ): PaymentStatus {
    if (isUnconfirmed) {
      return 'pending';
    }

    switch (txStatus) {
      case 'success':
        return 'success';
      case 'pending':
        return 'pending';
      case 'failed':
      case 'abort_by_response':
      case 'abort_by_post_condition':
        return 'failed';
      default:
        return 'pending';
    }
  }

  /**
   * Validate payment against requirements
   */
  private validatePayment(
    transaction: StacksTransaction,
    options: VerificationOptions,
    isUnconfirmed: boolean
  ): { isValid: boolean; error?: string } {
    // Check transaction type
    if (transaction.tx_type !== 'token_transfer' || !transaction.token_transfer) {
      return { isValid: false, error: 'Not a token transfer' };
    }

    // Check transaction status
    if (transaction.tx_status === 'failed' ||
        transaction.tx_status === 'abort_by_response' ||
        transaction.tx_status === 'abort_by_post_condition') {
      return { isValid: false, error: 'Transaction failed' };
    }

    // If we don't accept unconfirmed, reject pending transactions
    if (!options.acceptUnconfirmed && isUnconfirmed) {
      return { isValid: false, error: 'Transaction not yet confirmed' };
    }

    const { recipient_address, amount, memo } = transaction.token_transfer;

    // Validate recipient
    if (recipient_address !== options.expectedRecipient) {
      return {
        isValid: false,
        error: `Wrong recipient. Expected ${options.expectedRecipient}, got ${recipient_address}`,
      };
    }

    // Validate amount
    const amountBigInt = BigInt(amount);
    if (amountBigInt < options.minAmount) {
      return {
        isValid: false,
        error: `Insufficient amount. Expected at least ${options.minAmount}, got ${amountBigInt}`,
      };
    }

    // Validate sender if specified
    if (options.expectedSender && transaction.sender_address !== options.expectedSender) {
      return {
        isValid: false,
        error: `Wrong sender. Expected ${options.expectedSender}, got ${transaction.sender_address}`,
      };
    }

    // Validate memo if specified
    if (options.expectedMemo && memo !== options.expectedMemo) {
      return {
        isValid: false,
        error: `Wrong memo. Expected ${options.expectedMemo}, got ${memo}`,
      };
    }

    // Validate transaction age if specified
    if (options.maxAge && transaction.receipt_time) {
      const now = Math.floor(Date.now() / 1000);
      const age = now - transaction.receipt_time;
      if (age > options.maxAge) {
        return {
          isValid: false,
          error: `Transaction too old. Age: ${age}s, max allowed: ${options.maxAge}s`,
        };
      }
    }

    return { isValid: true };
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
    maxAttempts: number = 20,
    intervalMs: number = 30000
  ): Promise<StacksTransaction | null> {
    for (let i = 0; i < maxAttempts; i++) {
      const tx = await this.getConfirmedTransaction(txId);

      if (tx && tx.tx_status === 'success') {
        return tx;
      }

      if (tx && (tx.tx_status === 'failed' ||
                 tx.tx_status === 'abort_by_response' ||
                 tx.tx_status === 'abort_by_post_condition')) {
        throw new Error(`Transaction failed with status: ${tx.tx_status}`);
      }

      // Wait before next attempt
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    return null;
  }

  /**
   * Get all transactions for an address
   */
  async getAddressTransactions(
    address: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<StacksTransaction[]> {
    try {
      const response = await this.httpClient.get<{ results: StacksTransaction[] }>(
        `/extended/v1/address/${address}/transactions`,
        {
          params: { limit, offset },
        }
      );
      return response.data.results;
    } catch (error) {
      throw new Error(
        `Failed to fetch transactions: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

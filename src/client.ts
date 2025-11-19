/**
 * x402-stacks - Payment Client
 * Handles constructing and broadcasting STX token transfers
 */

import {
  makeSTXTokenTransfer,
  makeContractCall,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  TxBroadcastResult,
  uintCV,
  principalCV,
  someCV,
  noneCV,
  bufferCVFromString,
  getAddressFromPrivateKey,
  TransactionVersion,
} from '@stacks/transactions';
import { StacksMainnet, StacksTestnet, StacksNetwork } from '@stacks/network';
import axios, { AxiosInstance } from 'axios';
import {
  PaymentDetails,
  PaymentResult,
  X402PaymentRequired,
  X402ClientConfig,
  NetworkType,
  TokenType,
} from './types';

/**
 * Payment client for making x402 payments on Stacks
 */
export class X402PaymentClient {
  private network: StacksNetwork;
  private privateKey: string;
  private httpClient: AxiosInstance;

  constructor(config: X402ClientConfig) {
    this.network = this.getNetworkInstance(config.network);
    this.privateKey = config.privateKey;

    this.httpClient = axios.create({
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Get Stacks network instance from network type
   */
  private getNetworkInstance(network: NetworkType): StacksNetwork {
    return network === 'mainnet' ? new StacksMainnet() : new StacksTestnet();
  }

  /**
   * Make a payment based on x402 payment request
   */
  async makePayment(paymentRequest: X402PaymentRequired): Promise<PaymentResult> {
    try {
      const amount = BigInt(paymentRequest.maxAmountRequired);
      const tokenType = paymentRequest.tokenType || 'STX';

      const paymentDetails: PaymentDetails = {
        recipient: paymentRequest.payTo,
        amount,
        senderKey: this.privateKey,
        network: paymentRequest.network,
        memo: paymentRequest.nonce.substring(0, 34), // Max 34 bytes for Stacks memo
        tokenType,
        tokenContract: paymentRequest.tokenContract,
      };

      if (tokenType === 'sBTC') {
        return await this.sendSBTCTransfer(paymentDetails);
      } else {
        return await this.sendSTXTransfer(paymentDetails);
      }
    } catch (error) {
      return {
        txId: '',
        txRaw: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send STX token transfer
   */
  async sendSTXTransfer(details: PaymentDetails): Promise<PaymentResult> {
    try {
      // Determine network
      const network =
        typeof details.network === 'string'
          ? this.getNetworkInstance(details.network)
          : details.network;

      // Build transaction options
      const txOptions = {
        recipient: details.recipient,
        amount: details.amount,
        senderKey: this.privateKey,
        network,
        memo: details.memo || '',
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Allow,
        ...(details.nonce !== undefined && { nonce: details.nonce }),
        ...(details.fee !== undefined && { fee: details.fee }),
      };

      // Create transaction
      const transaction = await makeSTXTokenTransfer(txOptions);

      // Broadcast transaction
      const broadcastResponse: TxBroadcastResult = await broadcastTransaction(
        transaction,
        network
      );

      // Check for errors in broadcast response
      if ('error' in broadcastResponse) {
        return {
          txId: '',
          txRaw: transaction.serialize().toString(),
          success: false,
          error: broadcastResponse.error,
        };
      }

      return {
        txId: broadcastResponse.txid,
        txRaw: transaction.serialize().toString(),
        success: true,
      };
    } catch (error) {
      return {
        txId: '',
        txRaw: '',
        success: false,
        error: error instanceof Error ? error.message : 'Transaction failed',
      };
    }
  }

  /**
   * Send sBTC token transfer (SIP-010 fungible token)
   */
  async sendSBTCTransfer(details: PaymentDetails): Promise<PaymentResult> {
    try {
      // Determine network
      const network =
        typeof details.network === 'string'
          ? this.getNetworkInstance(details.network)
          : details.network;

      // Get sender address from private key
      const senderAddress = getAddressFromPrivateKey(
        details.senderKey,
        network instanceof StacksMainnet ? TransactionVersion.Mainnet : TransactionVersion.Testnet
      );

      // Validate token contract
      if (!details.tokenContract) {
        throw new Error('Token contract required for sBTC transfers');
      }

      const { address: contractAddress, name: contractName } = details.tokenContract;

      // Build function arguments for SIP-010 transfer
      // transfer function signature: (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34)))
      const functionArgs = [
        uintCV(details.amount.toString()),
        principalCV(senderAddress),
        principalCV(details.recipient),
        details.memo ? someCV(bufferCVFromString(details.memo)) : noneCV(),
      ];

      // Build transaction options
      const txOptions = {
        contractAddress,
        contractName,
        functionName: 'transfer',
        functionArgs,
        senderKey: this.privateKey,
        network,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Allow,
        ...(details.nonce !== undefined && { nonce: details.nonce }),
        ...(details.fee !== undefined && { fee: details.fee }),
      };

      // Create transaction
      const transaction = await makeContractCall(txOptions);

      // Broadcast transaction
      const broadcastResponse: TxBroadcastResult = await broadcastTransaction(
        transaction,
        network
      );

      // Check for errors in broadcast response
      if ('error' in broadcastResponse) {
        return {
          txId: '',
          txRaw: transaction.serialize().toString(),
          success: false,
          error: broadcastResponse.error,
        };
      }

      return {
        txId: broadcastResponse.txid,
        txRaw: transaction.serialize().toString(),
        success: true,
      };
    } catch (error) {
      return {
        txId: '',
        txRaw: '',
        success: false,
        error: error instanceof Error ? error.message : 'sBTC transfer failed',
      };
    }
  }

  /**
   * Make an API request with automatic x402 payment handling
   */
  async requestWithPayment<T = any>(
    url: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      data?: any;
      headers?: Record<string, string>;
      maxRetries?: number;
    } = {}
  ): Promise<T> {
    const { method = 'GET', data, headers = {}, maxRetries = 1 } = options;

    let attempt = 0;
    let lastPaymentTxId: string | undefined;

    while (attempt <= maxRetries) {
      try {
        const requestHeaders = { ...headers };

        // Include payment transaction ID if we made a payment
        if (lastPaymentTxId) {
          requestHeaders['X-Payment-TxId'] = lastPaymentTxId;
        }

        const response = await this.httpClient.request({
          url,
          method,
          data,
          headers: requestHeaders,
        });

        return response.data;
      } catch (error: any) {
        // Check if it's a 402 Payment Required response
        if (error.response && error.response.status === 402) {
          const paymentRequest: X402PaymentRequired = error.response.data;

          // Validate payment request
          if (!this.isValidPaymentRequest(paymentRequest)) {
            throw new Error('Invalid x402 payment request from server');
          }

          // Check expiration
          const expiresAt = new Date(paymentRequest.expiresAt);
          if (expiresAt < new Date()) {
            throw new Error('Payment request has expired');
          }

          // Make payment
          const paymentResult = await this.makePayment(paymentRequest);

          if (!paymentResult.success) {
            throw new Error(`Payment failed: ${paymentResult.error}`);
          }

          lastPaymentTxId = paymentResult.txId;
          attempt++;

          // Wait a bit before retrying to allow transaction to propagate
          await this.delay(2000);

          // Continue to next iteration to retry the request
          continue;
        }

        // Re-throw if not a 402 error
        throw error;
      }
    }

    throw new Error('Max retries exceeded for payment request');
  }

  /**
   * Validate payment request structure
   */
  private isValidPaymentRequest(request: any): request is X402PaymentRequired {
    return (
      typeof request === 'object' &&
      typeof request.maxAmountRequired === 'string' &&
      typeof request.resource === 'string' &&
      typeof request.payTo === 'string' &&
      typeof request.network === 'string' &&
      typeof request.nonce === 'string' &&
      typeof request.expiresAt === 'string' &&
      (request.network === 'mainnet' || request.network === 'testnet')
    );
  }

  /**
   * Helper to delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get the network being used
   */
  getNetwork(): StacksNetwork {
    return this.network;
  }
}

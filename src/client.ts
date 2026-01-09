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
  SignedPaymentResult,
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
   * Sign a payment based on x402 payment request (without broadcasting)
   * Returns the signed transaction hex to be sent to the facilitator
   */
  async signPayment(paymentRequest: X402PaymentRequired): Promise<SignedPaymentResult> {
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
        return await this.signSBTCTransfer(paymentDetails);
      } else if (tokenType === 'USDCx') {
        return await this.signUSDCxTransfer(paymentDetails);
      } else {
        return await this.signSTXTransfer(paymentDetails);
      }
    } catch (error) {
      return {
        signedTransaction: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Make a payment based on x402 payment request (broadcasts directly)
   * @deprecated Use signPayment() with facilitator settle endpoint instead
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
      } else if (tokenType === 'USDCx') {
        return await this.sendUSDCxTransfer(paymentDetails);
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
   * Sign STX token transfer (without broadcasting)
   */
  async signSTXTransfer(details: PaymentDetails): Promise<SignedPaymentResult> {
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

      // Build transaction options
      const txOptions = {
        recipient: details.recipient,
        amount: details.amount,
        senderKey: this.privateKey,
        network,
        memo: details.memo || '',
        anchorMode: AnchorMode.Any,
        ...(details.nonce !== undefined && { nonce: details.nonce }),
        ...(details.fee !== undefined && { fee: details.fee }),
        ...(details.sponsored && { sponsored: true, fee: 0n }),
      };

      // Create transaction (signed but not broadcast)
      const transaction = await makeSTXTokenTransfer(txOptions);

      // Return the signed transaction hex
      const serialized = transaction.serialize();
      return {
        signedTransaction: Buffer.from(serialized).toString('hex'),
        success: true,
        senderAddress,
      };
    } catch (error) {
      return {
        signedTransaction: '',
        success: false,
        error: error instanceof Error ? error.message : 'Transaction signing failed',
      };
    }
  }

  /**
   * Sign sBTC token transfer (without broadcasting)
   */
  async signSBTCTransfer(details: PaymentDetails): Promise<SignedPaymentResult> {
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
        ...(details.sponsored && { sponsored: true, fee: 0n }),
      };

      // Create transaction (signed but not broadcast)
      const transaction = await makeContractCall(txOptions);

      // Return the signed transaction hex
      const serialized = transaction.serialize();
      return {
        signedTransaction: Buffer.from(serialized).toString('hex'),
        success: true,
        senderAddress,
      };
    } catch (error) {
      return {
        signedTransaction: '',
        success: false,
        error: error instanceof Error ? error.message : 'sBTC signing failed',
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
        ...(details.nonce !== undefined && { nonce: details.nonce }),
        ...(details.fee !== undefined && { fee: details.fee }),
        ...(details.sponsored && { sponsored: true, fee: 0n }),
      };

      // Create transaction
      const transaction = await makeSTXTokenTransfer(txOptions);

      // Broadcast transaction
      const broadcastResponse: TxBroadcastResult = await broadcastTransaction(
        transaction,
        network
      );

      // Check for errors in broadcast response
      const txRaw = Buffer.from(transaction.serialize()).toString('hex');
      if ('error' in broadcastResponse) {
        return {
          txId: '',
          txRaw,
          success: false,
          error: broadcastResponse.error,
        };
      }

      return {
        txId: broadcastResponse.txid,
        txRaw,
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
        ...(details.sponsored && { sponsored: true, fee: 0n }),
      };

      // Create transaction
      const transaction = await makeContractCall(txOptions);

      // Broadcast transaction
      const broadcastResponse: TxBroadcastResult = await broadcastTransaction(
        transaction,
        network
      );

      // Check for errors in broadcast response
      const txRaw = Buffer.from(transaction.serialize()).toString('hex');
      if ('error' in broadcastResponse) {
        return {
          txId: '',
          txRaw,
          success: false,
          error: broadcastResponse.error,
        };
      }

      return {
        txId: broadcastResponse.txid,
        txRaw,
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
   * Sign USDCx token transfer (without broadcasting)
   * USDCx is Circle's USDC on Stacks via xReserve (SIP-010 fungible token)
   */
  async signUSDCxTransfer(details: PaymentDetails): Promise<SignedPaymentResult> {
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
        throw new Error('Token contract required for USDCx transfers');
      }

      const { address: contractAddress, name: contractName } = details.tokenContract;

      // Build function arguments for SIP-010 transfer
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
        ...(details.sponsored && { sponsored: true, fee: 0n }),
      };

      // Create transaction (signed but not broadcast)
      const transaction = await makeContractCall(txOptions);

      // Return the signed transaction hex
      const serialized = transaction.serialize();
      return {
        signedTransaction: Buffer.from(serialized).toString('hex'),
        success: true,
        senderAddress,
      };
    } catch (error) {
      return {
        signedTransaction: '',
        success: false,
        error: error instanceof Error ? error.message : 'USDCx signing failed',
      };
    }
  }

  /**
   * Send USDCx token transfer (SIP-010 fungible token)
   * USDCx is Circle's USDC on Stacks via xReserve
   */
  async sendUSDCxTransfer(details: PaymentDetails): Promise<PaymentResult> {
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
        throw new Error('Token contract required for USDCx transfers');
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
        ...(details.sponsored && { sponsored: true, fee: 0n }),
      };

      // Create transaction
      const transaction = await makeContractCall(txOptions);

      // Broadcast transaction
      const broadcastResponse: TxBroadcastResult = await broadcastTransaction(
        transaction,
        network
      );

      // Check for errors in broadcast response
      const txRaw = Buffer.from(transaction.serialize()).toString('hex');
      if ('error' in broadcastResponse) {
        return {
          txId: '',
          txRaw,
          success: false,
          error: broadcastResponse.error,
        };
      }

      return {
        txId: broadcastResponse.txid,
        txRaw,
        success: true,
      };
    } catch (error) {
      return {
        txId: '',
        txRaw: '',
        success: false,
        error: error instanceof Error ? error.message : 'USDCx transfer failed',
      };
    }
  }

  /**
   * Make an API request with automatic x402 payment handling
   * Uses the x402 facilitator pattern: client signs, server settles
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
    let lastSignedPayment: string | undefined;
    let lastPaymentRequest: X402PaymentRequired | undefined;

    while (attempt <= maxRetries) {
      try {
        const requestHeaders = { ...headers };

        // Include signed payment if we have one
        if (lastSignedPayment && lastPaymentRequest) {
          requestHeaders['X-PAYMENT'] = lastSignedPayment;
          // Also include payment metadata for the server
          requestHeaders['X-PAYMENT-TOKEN-TYPE'] = lastPaymentRequest.tokenType || 'STX';
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

          // Sign payment (don't broadcast - server will do that via facilitator)
          const signResult = await this.signPayment(paymentRequest);

          if (!signResult.success) {
            throw new Error(`Payment signing failed: ${signResult.error}`);
          }

          lastSignedPayment = signResult.signedTransaction;
          lastPaymentRequest = paymentRequest;
          attempt++;

          // No need to wait - server will broadcast and wait for confirmation
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

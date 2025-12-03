/**
 * x402-stacks - Axios Payment Interceptor
 * Provides automatic x402 payment handling for axios instances
 * Following the x402-axios pattern from the official x402 ecosystem
 */

import { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import {
  makeSTXTokenTransfer,
  makeContractCall,
  AnchorMode,
  PostConditionMode,
  uintCV,
  principalCV,
  someCV,
  noneCV,
  bufferCVFromString,
  getAddressFromPrivateKey,
  TransactionVersion,
} from '@stacks/transactions';
import { StacksMainnet, StacksTestnet, StacksNetwork } from '@stacks/network';
import {
  StacksAccount,
  X402PaymentRequired,
  PaymentResponse,
  NetworkType,
} from './types';

/**
 * Create a Stacks account from a private key
 * Similar to viem's privateKeyToAccount pattern
 */
export function privateKeyToAccount(
  privateKey: string,
  network: NetworkType = 'testnet'
): StacksAccount {
  const transactionVersion = network === 'mainnet'
    ? TransactionVersion.Mainnet
    : TransactionVersion.Testnet;

  const address = getAddressFromPrivateKey(privateKey, transactionVersion);

  return {
    address,
    privateKey,
    network,
  };
}

/**
 * Decode the X-PAYMENT-RESPONSE header from base64 JSON
 */
export function decodeXPaymentResponse(header: string | null | undefined): PaymentResponse | null {
  if (!header) return null;

  try {
    const decoded = Buffer.from(header, 'base64').toString('utf-8');
    return JSON.parse(decoded) as PaymentResponse;
  } catch {
    return null;
  }
}

/**
 * Encode a payment response to base64 JSON (for servers)
 */
export function encodeXPaymentResponse(response: PaymentResponse): string {
  return Buffer.from(JSON.stringify(response)).toString('base64');
}

/**
 * Get Stacks network instance from network type
 */
function getNetworkInstance(network: NetworkType): StacksNetwork {
  return network === 'mainnet' ? new StacksMainnet() : new StacksTestnet();
}

/**
 * Sign a payment transaction based on x402 payment request
 * Returns the signed transaction hex (does not broadcast)
 */
async function signPayment(
  paymentRequest: X402PaymentRequired,
  account: StacksAccount
): Promise<string> {
  const amount = BigInt(paymentRequest.maxAmountRequired);
  const tokenType = paymentRequest.tokenType || 'STX';
  const network = getNetworkInstance(paymentRequest.network);
  const memo = paymentRequest.nonce.substring(0, 34); // Max 34 bytes for Stacks memo

  if (tokenType === 'sBTC') {
    // sBTC transfer (SIP-010 contract call)
    if (!paymentRequest.tokenContract) {
      throw new Error('Token contract required for sBTC payments');
    }

    const { address: contractAddress, name: contractName } = paymentRequest.tokenContract;

    const functionArgs = [
      uintCV(amount.toString()),
      principalCV(account.address),
      principalCV(paymentRequest.payTo),
      memo ? someCV(bufferCVFromString(memo)) : noneCV(),
    ];

    const transaction = await makeContractCall({
      contractAddress,
      contractName,
      functionName: 'transfer',
      functionArgs,
      senderKey: account.privateKey,
      network,
      anchorMode: AnchorMode.Any,
      postConditionMode: PostConditionMode.Allow,
    });

    // Convert Uint8Array to hex string
    const serialized = transaction.serialize();
    return Buffer.from(serialized).toString('hex');
  } else {
    // STX transfer
    const transaction = await makeSTXTokenTransfer({
      recipient: paymentRequest.payTo,
      amount,
      senderKey: account.privateKey,
      network,
      memo,
      anchorMode: AnchorMode.Any,
    });

    // Convert Uint8Array to hex string
    const serialized = transaction.serialize();
    return Buffer.from(serialized).toString('hex');
  }
}

/**
 * Validate that a response body is a valid x402 payment request
 */
function isValidPaymentRequest(data: unknown): data is X402PaymentRequired {
  if (!data || typeof data !== 'object') return false;

  const request = data as Record<string, unknown>;

  return (
    typeof request.maxAmountRequired === 'string' &&
    typeof request.resource === 'string' &&
    typeof request.payTo === 'string' &&
    typeof request.network === 'string' &&
    typeof request.nonce === 'string' &&
    typeof request.expiresAt === 'string' &&
    (request.network === 'mainnet' || request.network === 'testnet')
  );
}

// Track which requests have already had payment attempted
const paymentAttempted = new WeakSet<InternalAxiosRequestConfig>();

/**
 * Wrap an axios instance with automatic x402 payment handling
 * Similar to x402-axios's withPaymentInterceptor
 *
 * @example
 * ```typescript
 * import axios from 'axios';
 * import { withPaymentInterceptor, privateKeyToAccount } from 'x402-stacks';
 *
 * const account = privateKeyToAccount(process.env.PRIVATE_KEY!, 'testnet');
 *
 * const api = withPaymentInterceptor(
 *   axios.create({ baseURL: 'https://api.example.com' }),
 *   account
 * );
 *
 * // Use normally - 402 handling is automatic
 * const response = await api.get('/premium-data');
 * console.log(response.data);
 * ```
 */
export function withPaymentInterceptor(
  axiosInstance: AxiosInstance,
  account: StacksAccount
): AxiosInstance {
  // Response interceptor to handle 402 Payment Required
  axiosInstance.interceptors.response.use(
    // Pass through successful responses
    (response: AxiosResponse) => response,

    // Handle errors (including 402)
    async (error) => {
      const originalRequest = error.config as InternalAxiosRequestConfig;

      // Check if this is a 402 response
      if (error.response?.status !== 402) {
        return Promise.reject(error);
      }

      // Prevent infinite retry loops - only attempt payment once per request
      if (paymentAttempted.has(originalRequest)) {
        return Promise.reject(new Error('Payment already attempted for this request'));
      }

      // Mark this request as having payment attempted
      paymentAttempted.add(originalRequest);

      const paymentRequest = error.response.data;

      // Validate payment request structure
      if (!isValidPaymentRequest(paymentRequest)) {
        return Promise.reject(new Error('Invalid x402 payment request from server'));
      }

      // Check expiration
      const expiresAt = new Date(paymentRequest.expiresAt);
      if (expiresAt < new Date()) {
        return Promise.reject(new Error('Payment request has expired'));
      }

      try {
        // Sign the payment (don't broadcast - server will do that)
        const signedTransaction = await signPayment(paymentRequest, account);

        // Retry the request with the signed payment
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers['X-PAYMENT'] = signedTransaction;
        originalRequest.headers['X-PAYMENT-TOKEN-TYPE'] = paymentRequest.tokenType || 'STX';

        // Make the retry request
        return axiosInstance.request(originalRequest);
      } catch (paymentError) {
        return Promise.reject(
          new Error(`Payment signing failed: ${paymentError instanceof Error ? paymentError.message : 'Unknown error'}`)
        );
      }
    }
  );

  return axiosInstance;
}

/**
 * Create a pre-configured axios instance with payment handling
 * Convenience function that combines axios.create() and withPaymentInterceptor()
 *
 * @example
 * ```typescript
 * import { createPaymentClient, privateKeyToAccount } from 'x402-stacks';
 *
 * const account = privateKeyToAccount(process.env.PRIVATE_KEY!, 'testnet');
 * const api = createPaymentClient(account, { baseURL: 'https://api.example.com' });
 *
 * const response = await api.get('/premium-data');
 * ```
 */
export function createPaymentClient(
  account: StacksAccount,
  config?: Parameters<typeof import('axios').default.create>[0]
): AxiosInstance {
  // Dynamic import to avoid requiring axios at module load time
  const axios = require('axios');
  const instance = axios.create(config);
  return withPaymentInterceptor(instance, account);
}

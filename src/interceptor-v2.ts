/**
 * x402-stacks - Axios Payment Interceptor (Coinbase Compatible)
 * Provides automatic x402 payment handling for axios instances
 */

import { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import {
  makeSTXTokenTransfer,
  makeContractCall,
  makeStandardFungiblePostCondition,
  createAssetInfo,
  FungibleConditionCode,
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
import { StacksAccount, NetworkType, TokenContract } from './types';
import {
  PaymentRequiredV2,
  PaymentPayloadV2,
  PaymentRequirementsV2,
  SettlementResponseV2,
  X402_HEADERS,
  STACKS_NETWORKS,
  NetworkV2,
} from './types-v2';
import { networkFromCAIP2, assetFromV2, createFacilitatorMemo, createFacilitatorNonce } from './utils';

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
 * Decode the payment-response header from base64 JSON
 */
export function decodePaymentResponse(header: string | null | undefined): SettlementResponseV2 | null {
  if (!header) return null;

  try {
    const decoded = Buffer.from(header, 'base64').toString('utf-8');
    return JSON.parse(decoded) as SettlementResponseV2;
  } catch {
    return null;
  }
}

/**
 * Decode the payment-required header from base64 JSON
 */
export function decodePaymentRequired(header: string | null | undefined): PaymentRequiredV2 | null {
  if (!header) return null;

  try {
    const decoded = Buffer.from(header, 'base64').toString('utf-8');
    return JSON.parse(decoded) as PaymentRequiredV2;
  } catch {
    return null;
  }
}

/**
 * Encode a payment payload to base64 JSON
 */
export function encodePaymentPayload(payload: PaymentPayloadV2): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

/**
 * Get Stacks network instance from CAIP-2 network identifier
 */
function getNetworkInstanceFromCAIP2(caip2: string): StacksNetwork {
  const network = networkFromCAIP2(caip2);
  return network === 'mainnet' ? new StacksMainnet() : new StacksTestnet();
}

/**
 * Get token contract from known assets or network defaults
 */
function getTokenContractForAsset(asset: string, network: NetworkType): TokenContract | undefined {
  const { tokenType, tokenContract } = assetFromV2(asset);

  if (tokenContract) {
    return tokenContract;
  }

  // Return default contracts for known tokens
  if (tokenType === 'sBTC') {
    return network === 'mainnet'
      ? { address: 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4', name: 'sbtc-token' }
      : { address: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM', name: 'sbtc-token' };
  }

  if (tokenType === 'USDCx') {
    return network === 'mainnet'
      ? { address: 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE', name: 'usdcx' }
      : { address: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM', name: 'usdcx' };
  }

  return undefined;
}

/** FT asset names (define-fungible-token) of the tokens facilitators sponsor. */
const FT_ASSET_NAMES: Record<string, string> = { 'sbtc-token': 'sbtc-token', usdcx: 'usdcx-token' };

function ftAssetName(contractName: string): string {
  const name = FT_ASSET_NAMES[contractName];
  if (!name) throw new Error(`Sponsored payments are not supported for token contract ${contractName}`);
  return name;
}

/**
 * Sign a payment transaction based on x402 v2 payment requirements
 * Returns the signed transaction hex (does not broadcast)
 */
async function signPaymentV2(
  paymentRequirements: PaymentRequirementsV2,
  account: StacksAccount
): Promise<string> {
  const amount = BigInt(paymentRequirements.amount);
  const { tokenType } = assetFromV2(paymentRequirements.asset);
  const network = getNetworkInstanceFromCAIP2(paymentRequirements.network);
  const v1Network = networkFromCAIP2(paymentRequirements.network);

  const memo = createFacilitatorMemo(createFacilitatorNonce());
  // Facilitator pays the fee: sign as a sponsored tx with zero origin fee.
  const sponsored = typeof paymentRequirements.extra?.feePayer === 'string';
  const sponsorOpts = sponsored ? { sponsored: true, fee: 0n } : {};

  if (tokenType === 'sBTC' || tokenType === 'USDCx') {
    // SIP-010 token transfer
    const tokenContract = getTokenContractForAsset(paymentRequirements.asset, v1Network);

    if (!tokenContract) {
      throw new Error(`Token contract required for ${tokenType} payments`);
    }

    const functionArgs = [
      uintCV(amount.toString()),
      principalCV(account.address),
      principalCV(paymentRequirements.payTo),
      memo ? someCV(bufferCVFromString(memo)) : noneCV(),
    ];

    const transaction = await makeContractCall({
      contractAddress: tokenContract.address,
      contractName: tokenContract.name,
      functionName: 'transfer',
      functionArgs,
      senderKey: account.privateKey,
      network,
      anchorMode: AnchorMode.Any,
      ...sponsorOpts,
      ...(sponsored
        ? {
            // Sponsors pay for aborted calls, so they require Deny mode + the exact transfer.
            postConditionMode: PostConditionMode.Deny,
            postConditions: [
              makeStandardFungiblePostCondition(
                account.address,
                FungibleConditionCode.Equal,
                amount,
                createAssetInfo(tokenContract.address, tokenContract.name, ftAssetName(tokenContract.name)),
              ),
            ],
          }
        : { postConditionMode: PostConditionMode.Allow }),
    });

    const serialized = transaction.serialize();
    return Buffer.from(serialized).toString('hex');
  } else {
    // STX transfer
    const transaction = await makeSTXTokenTransfer({
      recipient: paymentRequirements.payTo,
      amount,
      senderKey: account.privateKey,
      network,
      memo,
      anchorMode: AnchorMode.Any,
      ...sponsorOpts,
    });

    const serialized = transaction.serialize();
    return Buffer.from(serialized).toString('hex');
  }
}

/**
 * Validate that a response body is a valid x402 v2 payment request
 */
function isValidPaymentRequestV2(data: unknown): data is PaymentRequiredV2 {
  if (!data || typeof data !== 'object') return false;

  const request = data as Record<string, unknown>;

  return (
    request.x402Version === 2 &&
    typeof request.resource === 'object' &&
    Array.isArray(request.accepts) &&
    request.accepts.length > 0
  );
}

/**
 * Select the best payment option from available accepts
 * Currently selects the first Stacks-compatible option
 */
function selectPaymentOption(
  accepts: PaymentRequirementsV2[],
  account: StacksAccount
): PaymentRequirementsV2 | null {
  // Find a compatible Stacks payment option
  const compatibleOption = accepts.find((opt) => {
    // Check if network is Stacks
    if (!opt.network.startsWith('stacks:')) {
      return false;
    }

    // Check if network matches account
    const v1Network = networkFromCAIP2(opt.network);
    return v1Network === account.network;
  });

  return compatibleOption || null;
}

function hasRequestHeader(headers: unknown, name: string): boolean {
  if (!headers || typeof headers !== 'object') return false;

  const axiosHeaders = headers as { get?: (headerName: string) => unknown };
  const value = typeof axiosHeaders.get === 'function' ? axiosHeaders.get(name) : undefined;
  if (value !== undefined && value !== null) return true;

  const normalizedName = name.toLowerCase();
  return Object.entries(headers).some(
    ([headerName, headerValue]) => headerName.toLowerCase() === normalizedName && headerValue != null,
  );
}

function paymentFailureAfterRetry(error: any): Error {
  const reason = error.response?.data?.error;
  const failure = new Error(
    typeof reason === 'string' && reason.length > 0
      ? `Payment failed: ${reason}`
      : 'Payment failed: server returned 402 after payment was sent',
  );
  Object.assign(failure, { response: error.response, cause: error });
  return failure;
}

/**
 * Wrap an axios instance with automatic x402 payment handling
 * Compatible with Coinbase x402 protocol
 *
 * @example
 * ```typescript
 * import axios from 'axios';
 * import { wrapAxiosWithPayment, privateKeyToAccount } from 'x402-stacks';
 *
 * const account = privateKeyToAccount(process.env.PRIVATE_KEY!, 'testnet');
 *
 * const api = wrapAxiosWithPayment(
 *   axios.create({ baseURL: 'https://api.example.com' }),
 *   account
 * );
 *
 * // Use normally - 402 handling is automatic
 * const response = await api.get('/premium-data');
 * console.log(response.data);
 * ```
 */
export function wrapAxiosWithPayment(
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

      // The retried Axios config may be cloned, so detect payment from its header.
      if (hasRequestHeader(originalRequest?.headers, X402_HEADERS.PAYMENT_SIGNATURE)) {
        return Promise.reject(paymentFailureAfterRetry(error));
      }

      // Try to get payment requirements from header first, then body
      let paymentRequired: PaymentRequiredV2 | null = null;

      // Check header
      const headerValue = error.response.headers[X402_HEADERS.PAYMENT_REQUIRED];
      if (headerValue) {
        paymentRequired = decodePaymentRequired(headerValue);
      }

      // Fall back to body
      if (!paymentRequired && isValidPaymentRequestV2(error.response.data)) {
        paymentRequired = error.response.data;
      }

      if (!paymentRequired) {
        return Promise.reject(new Error('Invalid x402 v2 payment request from server'));
      }

      // Select a compatible payment option
      const selectedOption = selectPaymentOption(paymentRequired.accepts, account);

      if (!selectedOption) {
        return Promise.reject(
          new Error(
            `No compatible payment option found. Available networks: ${paymentRequired.accepts.map((a) => a.network).join(', ')}`
          )
        );
      }

      try {
        // Sign the payment (don't broadcast - server will do that via facilitator)
        const signedTransaction = await signPaymentV2(selectedOption, account);

        // Create V2 payment payload
        const paymentPayload: PaymentPayloadV2 = {
          x402Version: 2,
          resource: paymentRequired.resource,
          accepted: selectedOption,
          payload: {
            transaction: signedTransaction,
          },
        };

        // Encode payload as base64 for header
        const encodedPayload = encodePaymentPayload(paymentPayload);

        // Retry the request with the payment
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers[X402_HEADERS.PAYMENT_SIGNATURE] = encodedPayload;

        // Make the retry request
        return axiosInstance.request(originalRequest);
      } catch (paymentError) {
        return Promise.reject(
          new Error(
            `Payment signing failed: ${paymentError instanceof Error ? paymentError.message : 'Unknown error'}`
          )
        );
      }
    }
  );

  return axiosInstance;
}

/**
 * Create a pre-configured axios instance with payment handling
 * Convenience function that combines axios.create() and wrapAxiosWithPayment()
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
  return wrapAxiosWithPayment(instance, account);
}

// ===== Backward Compatibility Aliases =====
/** @deprecated Use privateKeyToAccount instead */
export const privateKeyToAccountV2 = privateKeyToAccount;
/** @deprecated Use wrapAxiosWithPayment instead */
export const withPaymentInterceptorV2 = wrapAxiosWithPayment;
/** @deprecated Use createPaymentClient instead */
export const createPaymentClientV2 = createPaymentClient;

/**
 * Extract payment response from successful response headers
 */
export function getPaymentResponseFromHeaders(
  response: AxiosResponse
): SettlementResponseV2 | null {
  const header = response.headers[X402_HEADERS.PAYMENT_RESPONSE];
  return decodePaymentResponse(header);
}

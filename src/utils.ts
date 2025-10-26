/**
 * x402-stacks - Utility Functions
 * Helper functions for working with x402 payments on Stacks
 */

import { makeRandomPrivKey, getPublicKey, publicKeyToAddress, AddressVersion } from '@stacks/transactions';
import { StacksMainnet, StacksTestnet } from '@stacks/network';
import { NetworkType } from './types';

/**
 * Convert microSTX to STX
 */
export function microSTXtoSTX(microSTX: bigint | string): string {
  const amount = typeof microSTX === 'string' ? BigInt(microSTX) : microSTX;
  return (Number(amount) / 1_000_000).toFixed(6);
}

/**
 * Convert STX to microSTX
 */
export function STXtoMicroSTX(stx: number | string): bigint {
  const amount = typeof stx === 'string' ? parseFloat(stx) : stx;
  return BigInt(Math.floor(amount * 1_000_000));
}

/**
 * Generate a random Stacks keypair
 */
export function generateKeypair(network: NetworkType = 'testnet') {
  const privateKey = makeRandomPrivKey();
  const publicKey = getPublicKey(privateKey);

  const addressVersion = network === 'mainnet'
    ? AddressVersion.MainnetSingleSig
    : AddressVersion.TestnetSingleSig;

  const address = publicKeyToAddress(addressVersion, publicKey);

  return {
    privateKey: Buffer.from(privateKey.data).toString('hex'),
    publicKey: Buffer.from(publicKey.data).toString('hex'),
    address,
  };
}

/**
 * Validate Stacks address format
 */
export function isValidStacksAddress(address: string): boolean {
  // Stacks addresses start with SP (mainnet) or ST (testnet) followed by base58 characters
  const mainnetRegex = /^SP[0-9A-Z]{38,41}$/;
  const testnetRegex = /^ST[0-9A-Z]{38,41}$/;

  return mainnetRegex.test(address) || testnetRegex.test(address);
}

/**
 * Check if address is mainnet or testnet
 */
export function getAddressNetwork(address: string): NetworkType | null {
  if (!isValidStacksAddress(address)) {
    return null;
  }

  return address.startsWith('SP') ? 'mainnet' : 'testnet';
}

/**
 * Get API endpoint for network
 */
export function getAPIEndpoint(network: NetworkType): string {
  return network === 'mainnet'
    ? 'https://stacks-node-api.mainnet.stacks.co'
    : 'https://stacks-node-api.testnet.stacks.co';
}

/**
 * Get block explorer URL for transaction
 */
export function getExplorerURL(txId: string, network: NetworkType = 'mainnet'): string {
  const chainParam = network === 'testnet' ? '?chain=testnet' : '';
  return `https://explorer.hiro.so/txid/0x${txId}${chainParam}`;
}

/**
 * Format payment amount for display
 */
export function formatPaymentAmount(
  microSTX: bigint | string,
  options: {
    includeSymbol?: boolean;
    decimals?: number;
  } = {}
): string {
  const { includeSymbol = true, decimals = 6 } = options;

  const stx = microSTXtoSTX(microSTX);
  const amount = parseFloat(stx).toFixed(decimals);

  return includeSymbol ? `${amount} STX` : amount;
}

/**
 * Parse memo field from x402 payment
 */
export function parsePaymentMemo(memo: string): {
  resource?: string;
  nonce?: string;
  custom?: Record<string, string>;
} {
  const result: {
    resource?: string;
    nonce?: string;
    custom?: Record<string, string>;
  } = {};

  if (!memo.startsWith('x402:')) {
    return result;
  }

  // Remove x402: prefix
  const content = memo.substring(5);

  // Split by comma
  const parts = content.split(',');

  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key && value) {
      if (key === 'resource') {
        result.resource = value;
      } else if (key === 'nonce') {
        result.nonce = value;
      } else {
        if (!result.custom) {
          result.custom = {};
        }
        result.custom[key] = value;
      }
    }
  }

  return result;
}

/**
 * Create x402 memo string
 */
export function createPaymentMemo(
  resource: string,
  nonce: string,
  custom?: Record<string, string>
): string {
  let memo = `x402:${resource},nonce=${nonce}`;

  if (custom) {
    for (const [key, value] of Object.entries(custom)) {
      memo += `,${key}=${value}`;
    }
  }

  return memo;
}

/**
 * Calculate estimated fee for transaction
 */
export function estimateFee(
  transactionSize: number = 180,
  feeRate: number = 1
): bigint {
  // Stacks fee calculation: size * rate
  return BigInt(transactionSize * feeRate);
}

/**
 * Wait with exponential backoff
 */
export async function waitWithBackoff(
  attempt: number,
  baseDelayMs: number = 1000,
  maxDelayMs: number = 30000
): Promise<void> {
  const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Retry function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');

      if (attempt < maxAttempts - 1) {
        await waitWithBackoff(attempt, baseDelayMs);
      }
    }
  }

  throw lastError || new Error('Max retry attempts exceeded');
}

/**
 * Validate payment request expiration
 */
export function isPaymentRequestExpired(expiresAt: string): boolean {
  const expirationDate = new Date(expiresAt);
  return expirationDate < new Date();
}

/**
 * Create expiration timestamp
 */
export function createExpirationTimestamp(secondsFromNow: number): string {
  return new Date(Date.now() + secondsFromNow * 1000).toISOString();
}

/**
 * Truncate address for display
 */
export function truncateAddress(address: string, chars: number = 6): string {
  if (address.length <= chars * 2) {
    return address;
  }
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Get network instance from network type
 */
export function getNetworkInstance(network: NetworkType) {
  return network === 'mainnet' ? new StacksMainnet() : new StacksTestnet();
}

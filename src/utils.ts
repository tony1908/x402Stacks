/**
 * x402-stacks - Utility Functions
 * Helper functions for working with x402 payments on Stacks
 */

import { makeRandomPrivKey, getPublicKey, publicKeyToAddress, AddressVersion } from '@stacks/transactions';
import { StacksMainnet, StacksTestnet } from '@stacks/network';
import { NetworkType, TokenType, TokenContract } from './types';

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
 * Convert sats to BTC
 */
export function satsToBTC(sats: bigint | string): string {
  const amount = typeof sats === 'string' ? BigInt(sats) : sats;
  return (Number(amount) / 100_000_000).toFixed(8);
}

/**
 * Convert BTC to sats
 */
export function BTCtoSats(btc: number | string): bigint {
  const amount = typeof btc === 'string' ? parseFloat(btc) : btc;
  return BigInt(Math.floor(amount * 100_000_000));
}

/**
 * Convert USDCx to micro-units (6 decimals, same as USDC)
 */
export function USDCxToMicroUSDCx(usdcx: number | string): bigint {
  const amount = typeof usdcx === 'string' ? parseFloat(usdcx) : usdcx;
  return BigInt(Math.floor(amount * 1_000_000));
}

/**
 * Convert micro-USDCx to USDCx
 */
export function microUSDCxToUSDCx(microUSDCx: bigint | string): string {
  const amount = typeof microUSDCx === 'string' ? BigInt(microUSDCx) : microUSDCx;
  return (Number(amount) / 1_000_000).toFixed(6);
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
  amount: bigint | string,
  options: {
    includeSymbol?: boolean;
    decimals?: number;
    tokenType?: TokenType;
  } = {}
): string {
  const { includeSymbol = true, decimals = 6, tokenType = 'STX' } = options;

  let formattedAmount: string;
  let symbol: string;

  if (tokenType === 'sBTC') {
    const btc = satsToBTC(amount);
    formattedAmount = parseFloat(btc).toFixed(decimals);
    symbol = 'sBTC';
  } else if (tokenType === 'USDCx') {
    const usdcx = microUSDCxToUSDCx(amount);
    formattedAmount = parseFloat(usdcx).toFixed(decimals);
    symbol = 'USDCx';
  } else {
    const stx = microSTXtoSTX(amount);
    formattedAmount = parseFloat(stx).toFixed(decimals);
    symbol = 'STX';
  }

  return includeSymbol ? `${formattedAmount} ${symbol}` : formattedAmount;
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

/**
 * Get default sBTC contract for network
 */
export function getDefaultSBTCContract(network: NetworkType): TokenContract {
  if (network === 'mainnet') {
    // Mainnet sBTC contract (update when mainnet launches)
    return {
      address: 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9',
      name: 'token-sbtc',
    };
  } else {
    // Testnet sBTC contract
    return {
      address: 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT',
      name: 'sbtc-token',
    };
  }
}

/**
 * Get default USDCx contract for network
 * USDCx is Circle's USDC on Stacks via xReserve
 */
export function getDefaultUSDCxContract(network: NetworkType): TokenContract {
  if (network === 'mainnet') {
    // Mainnet USDCx contract
    return {
      address: 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE',
      name: 'usdcx',
    };
  } else {
    // Testnet USDCx contract
    return {
      address: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
      name: 'usdcx',
    };
  }
}

/**
 * Get token symbol for display
 */
export function getTokenSymbol(tokenType: TokenType): string {
  switch (tokenType) {
    case 'sBTC':
      return 'sBTC';
    case 'USDCx':
      return 'USDCx';
    default:
      return 'STX';
  }
}

/**
 * Get token decimals
 */
export function getTokenDecimals(tokenType: TokenType): number {
  switch (tokenType) {
    case 'sBTC':
      return 8; // 1 sBTC = 100,000,000 sats
    case 'USDCx':
      return 6; // 1 USDCx = 1,000,000 micro-USDCx (same as USDC)
    default:
      return 6; // 1 STX = 1,000,000 microSTX
  }
}

/**
 * Get smallest unit name for token
 */
export function getTokenSmallestUnit(tokenType: TokenType): string {
  switch (tokenType) {
    case 'sBTC':
      return 'sats';
    case 'USDCx':
      return 'micro-USDCx';
    default:
      return 'microSTX';
  }
}

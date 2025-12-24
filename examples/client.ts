/**
 * Example: x402-stacks Client Implementation
 * Demonstrates the x402-axios style API for automatic payment handling
 */

import 'dotenv/config';
import axios from 'axios';
import {
  withPaymentInterceptor,
  privateKeyToAccount,
  decodeXPaymentResponse,
  generateKeypair,
  formatPaymentAmount,
  getExplorerURL,
  X402PaymentRequired,
  StacksAccount,
} from '../src';

// Configuration
const NETWORK = (process.env.NETWORK as 'mainnet' | 'testnet') || 'testnet';
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3003';

// Load or generate account
let account: StacksAccount;

if (process.env.CLIENT_PRIVATE_KEY) {
  // Use existing private key from .env
  account = privateKeyToAccount(process.env.CLIENT_PRIVATE_KEY, NETWORK);
  console.log('Using existing wallet from .env:');
  console.log('Address:', account.address);
} else {
  // Generate a new keypair for first-time setup
  const keypair = generateKeypair(NETWORK);

  console.log('\n' + '='.repeat(70));
  console.log('NO PRIVATE KEY FOUND IN .ENV - GENERATED NEW WALLET');
  console.log('='.repeat(70));
  console.log('\nTo reuse this wallet, add these to your .env file:\n');
  console.log(`CLIENT_PRIVATE_KEY=${keypair.privateKey}`);
  console.log(`CLIENT_ADDRESS=${keypair.address}`);
  console.log('\nFund this address with testnet STX:');
  console.log('https://explorer.stacks.co/sandbox/faucet?chain=testnet');
  console.log('\nAddress:', keypair.address);
  console.log('='.repeat(70) + '\n');

  account = privateKeyToAccount(keypair.privateKey, NETWORK);
}

// Create axios instance with automatic payment handling (x402-axios pattern)
const api = withPaymentInterceptor(
  axios.create({
    baseURL: SERVER_URL,
    timeout: 60000, // 60 seconds - settlement can take time
  }),
  account
);

/**
 * Example 1: Simple paid request using interceptor (automatic payment)
 * This is the recommended pattern - just use axios normally
 */
async function example1_AutomaticPayment() {
  console.log('\n--- Example 1: Automatic Payment (x402-axios style) ---');

  try {
    // Just make a normal request - payment is handled automatically!
    const response = await api.get('/api/premium-data');

    console.log('Success! Received data:', response.data);

    // Decode the payment response header
    const paymentResponse = decodeXPaymentResponse(response.headers['x-payment-response']);
    if (paymentResponse) {
      console.log('Payment response:', paymentResponse);
      console.log('Explorer:', getExplorerURL(paymentResponse.txId, NETWORK));
    }
  } catch (error: any) {
    console.error('Error:', error.response?.data?.error || error.message);
  }
}

/**
 * Example 2: Tiered pricing with automatic payment
 */
async function example2_TieredPricing() {
  console.log('\n--- Example 2: Tiered Pricing (automatic payment) ---');

  const dataTypes = ['basic', 'standard', 'premium'];

  for (const type of dataTypes) {
    try {
      console.log(`\nRequesting ${type} data...`);

      const response = await api.get(`/api/market-data?type=${type}`);

      console.log(`Success! ${type} data:`, response.data.marketData);

      const paymentResponse = decodeXPaymentResponse(response.headers['x-payment-response']);
      if (paymentResponse) {
        console.log(`Payment txId: ${paymentResponse.txId}`);
      }
    } catch (error: any) {
      console.error(`Error for ${type}:`, error.response?.data?.error || error.message);
    }
  }
}

/**
 * Example 3: Rate-limited endpoint
 */
async function example3_RateLimiting() {
  console.log('\n--- Example 3: Rate Limiting (10 free, then paid) ---');

  console.log('Making 12 requests (first 10 free, then payment required)...\n');

  for (let i = 1; i <= 12; i++) {
    try {
      const response = await api.get(`/api/search?q=test${i}`);

      const paymentResponse = decodeXPaymentResponse(response.headers['x-payment-response']);
      if (paymentResponse) {
        console.log(`Request ${i}: PAID - txId: ${paymentResponse.txId.slice(0, 20)}...`);
      } else {
        console.log(`Request ${i}: FREE`);
      }
    } catch (error: any) {
      console.error(`Request ${i} error:`, error.response?.data?.error || error.message);
    }
  }
}

/**
 * Example 4: Manual payment flow (for understanding the protocol)
 * Shows what happens under the hood
 */
async function example4_ManualPaymentFlow() {
  console.log('\n--- Example 4: Manual Payment Flow (for learning) ---');

  try {
    // Step 1: Make request without payment interceptor
    const plainAxios = axios.create({ baseURL: SERVER_URL });

    console.log('Step 1: Making request without payment...');
    const response = await plainAxios.get('/api/premium-data').catch(e => e.response);

    if (response.status === 402) {
      const paymentRequest: X402PaymentRequired = response.data;
      console.log('Step 2: Received 402 Payment Required');
      console.log('Payment details:', {
        amount: formatPaymentAmount(paymentRequest.maxAmountRequired),
        payTo: paymentRequest.payTo,
        resource: paymentRequest.resource,
        expiresAt: paymentRequest.expiresAt,
        nonce: paymentRequest.nonce.slice(0, 16) + '...',
      });

      // Step 3: Use interceptor-wrapped client
      console.log('\nStep 3: Using withPaymentInterceptor to handle payment...');
      const paidResponse = await api.get('/api/premium-data');

      console.log('Step 4: Success! Received data:', paidResponse.data);

      const paymentResponse = decodeXPaymentResponse(paidResponse.headers['x-payment-response']);
      if (paymentResponse) {
        console.log('Payment confirmed:', paymentResponse);
        console.log('Explorer:', getExplorerURL(paymentResponse.txId, NETWORK));
      }
    }
  } catch (error: any) {
    console.error('Error:', error.response?.data?.error || error.message);
  }
}

/**
 * Example 5: sBTC payment (automatic)
 */
async function example5_SBTCPayment() {
  console.log('\n--- Example 5: sBTC Payment (automatic) ---');

  try {
    const response = await api.get('/api/bitcoin-data');

    console.log('Success! Received Bitcoin data:', response.data.data);

    const paymentResponse = decodeXPaymentResponse(response.headers['x-payment-response']);
    if (paymentResponse) {
      console.log('sBTC Payment response:', paymentResponse);
      console.log('Explorer:', getExplorerURL(paymentResponse.txId, NETWORK));
    }
  } catch (error: any) {
    console.error('Error:', error.response?.data?.error || error.message);
  }
}

/**
 * Example 6: POST request with payment
 */
async function example6_PostRequest() {
  console.log('\n--- Example 6: POST Request with Payment ---');

  try {
    const response = await api.post('/api/compute', {
      task: 'complex-calculation',
    });

    console.log('Success! Computation result:', response.data.result);

    const paymentResponse = decodeXPaymentResponse(response.headers['x-payment-response']);
    if (paymentResponse) {
      console.log('Payment confirmed in block:', paymentResponse.blockHeight);
    }
  } catch (error: any) {
    console.error('Error:', error.response?.data?.error || error.message);
  }
}

/**
 * Example 7: USDCx payment (automatic)
 * USDCx is Circle's USDC on Stacks via xReserve
 */
async function example7_USDCxPayment() {
  console.log('\n--- Example 7: USDCx Payment (USDC on Stacks) ---');

  try {
    const response = await api.get('/api/stablecoin-data');

    console.log('Success! Received stablecoin data:', response.data.data);

    const paymentResponse = decodeXPaymentResponse(response.headers['x-payment-response']);
    if (paymentResponse) {
      console.log('USDCx Payment response:', paymentResponse);
      console.log('Explorer:', getExplorerURL(paymentResponse.txId, NETWORK));
    }
  } catch (error: any) {
    console.error('Error:', error.response?.data?.error || error.message);
  }
}

// Main execution
async function main() {
  console.log('='.repeat(60));
  console.log('x402-stacks Client Examples (x402-axios style)');
  console.log('='.repeat(60));

  // Check if server is running
  try {
    const healthResponse = await axios.get(`${SERVER_URL}/health`);
    if (healthResponse.status !== 200) {
      throw new Error('Server not responding');
    }
    console.log('Server is running');
  } catch {
    console.error('Server is not running. Please start the server first:');
    console.error('  npm run dev:server');
    return;
  }

  // Run examples - uncomment the ones you want to test
  await example1_AutomaticPayment();
  // await example2_TieredPricing();
  // await example3_RateLimiting();
  // await example4_ManualPaymentFlow();
  // await example5_SBTCPayment();
  // await example6_PostRequest();
  // await example7_USDCxPayment();

  console.log('\n' + '='.repeat(60));
  console.log('Examples completed');
  console.log('='.repeat(60));
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { main };

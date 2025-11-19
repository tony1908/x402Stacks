/**
 * Example: x402-stacks Client Implementation
 * Client for making requests to x402-enabled APIs
 */

import 'dotenv/config';
import { X402PaymentClient, generateKeypair, formatPaymentAmount, getExplorerURL, X402PaymentRequired } from '../src';

// Configuration
const NETWORK = (process.env.NETWORK as 'mainnet' | 'testnet') || 'testnet';
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3003';

// Load private key from environment, or generate a new one
let privateKey: string;
let address: string;

if (process.env.CLIENT_PRIVATE_KEY) {
  // Use existing private key from .env
  privateKey = process.env.CLIENT_PRIVATE_KEY;
  address = process.env.CLIENT_ADDRESS || 'Unknown (add CLIENT_ADDRESS to .env)';
  console.log('Using existing wallet from .env:');
  console.log('address: ', address);
} else {
  // Generate a new keypair for first-time setup
  const keypair = generateKeypair(NETWORK);
  privateKey = keypair.privateKey;
  address = keypair.address;

  console.log('\n' + '='.repeat(70));
  console.log('⚠️  NO PRIVATE KEY FOUND IN .ENV - GENERATED NEW WALLET');
  console.log('='.repeat(70));
  console.log('\n📝 To reuse this wallet, add these to your .env file:\n');
  console.log(`CLIENT_PRIVATE_KEY=${keypair.privateKey}`);
  console.log(`CLIENT_ADDRESS=${keypair.address}`);
  console.log('\n💰 Fund this address with testnet STX:');
  console.log('https://explorer.stacks.co/sandbox/faucet?chain=testnet');
  console.log('\nAddress:', keypair.address);
  console.log('='.repeat(70) + '\n');
}

// Create payment client
const client = new X402PaymentClient({
  network: NETWORK,
  privateKey,
});

/**
 * Example 1: Simple payment request
 */
async function example1_SimplePaidRequest() {
  console.log('\n--- Example 1: Simple Paid Request ---');

  try {
    const data = await client.requestWithPayment(`${SERVER_URL}/api/premium-data`, {
      method: 'GET',
    });

    console.log('Success! Received data:', data);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  }
}

/**
 * Example 2: Tiered pricing request
 */
async function example2_TieredPricing() {
  console.log('\n--- Example 2: Tiered Pricing ---');

  const dataTypes = ['basic', 'standard', 'premium'];

  for (const type of dataTypes) {
    try {
      console.log(`\nRequesting ${type} data...`);

      const data = await client.requestWithPayment(
        `${SERVER_URL}/api/market-data?type=${type}`,
        {
          method: 'GET',
        }
      );

      console.log(`Success! ${type} data:`, data.marketData);
      if (data.payment) {
        console.log(`Payment: ${formatPaymentAmount(data.payment.amount)}`);
      }
    } catch (error) {
      console.error(`Error for ${type}:`, error instanceof Error ? error.message : error);
    }
  }
}

/**
 * Example 3: Rate-limited endpoint
 */
async function example3_RateLimiting() {
  console.log('\n--- Example 3: Rate Limiting ---');

  console.log('Making 12 requests (first 10 free, then payment required)...\n');

  for (let i = 1; i <= 12; i++) {
    try {
      const data = await client.requestWithPayment(
        `${SERVER_URL}/api/search?q=test${i}`,
        {
          method: 'GET',
        }
      );

      if (data.payment) {
        console.log(`Request ${i}: PAID - ${formatPaymentAmount(data.payment.amount)}`);
      } else {
        console.log(`Request ${i}: FREE`);
      }
    } catch (error) {
      console.error(`Request ${i} error:`, error instanceof Error ? error.message : error);
    }
  }
}

/**
 * Example 4: Manual payment flow (without automatic handling)
 */
async function example4_ManualPayment() {
  console.log('\n--- Example 4: Manual Payment Flow ---');

  try {
    // Step 1: Make initial request (will return 402)
    console.log('Step 1: Making initial request...');

    const response = await fetch(`${SERVER_URL}/api/premium-data`);

    if (response.status === 402) {
      const paymentRequest = await response.json() as X402PaymentRequired;
      console.log('Step 2: Received 402 Payment Required');
      console.log('Payment details:', {
        amount: formatPaymentAmount(paymentRequest.maxAmountRequired),
        payTo: paymentRequest.payTo,
        resource: paymentRequest.resource,
        expiresAt: paymentRequest.expiresAt,
      });

      // Step 3: Make payment
      console.log('\nStep 3: Making payment...');
      const paymentResult = await client.makePayment(paymentRequest);

      if (!paymentResult.success) {
        throw new Error(`Payment failed: ${paymentResult.error}`);
      }

      console.log('Payment successful!');
      console.log('Transaction ID:', paymentResult.txId);
      console.log('Explorer:', getExplorerURL(paymentResult.txId, NETWORK));

      // Step 4: Retry request with payment proof
      console.log('\nStep 4: Retrying request with payment proof...');

      const retryResponse = await fetch(`${SERVER_URL}/api/premium-data`, {
        headers: {
          'X-Payment-TxId': paymentResult.txId,
        },
      });

      if (retryResponse.ok) {
        const data = await retryResponse.json();
        console.log('Success! Received data:', data);
      } else {
        console.error('Retry failed:', await retryResponse.text());
      }
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  }
}

/**
 * Example 5: High-value request with confirmation required
 */
async function example5_HighValueRequest() {
  console.log('\n--- Example 5: High-Value Request (Requires Confirmation) ---');

  try {
    const data = await client.requestWithPayment(`${SERVER_URL}/api/compute`, {
      method: 'POST',
      data: {
        task: 'complex-calculation',
      },
    });

    console.log('Success! Computation result:', data.result);
    console.log('Payment confirmed in block:', data.payment.confirmedInBlock);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  }
}

/**
 * Example 6: Manual sBTC payment flow
 */
async function example6_SBTCPayment() {
  console.log('\n--- Example 6: Manual sBTC Payment Flow ---');

  try {
    // Step 1: Make initial request (will return 402)
    console.log('Step 1: Making initial request to sBTC-gated endpoint...');

    const response = await fetch(`${SERVER_URL}/api/bitcoin-data`);

    if (response.status === 402) {
      const paymentRequest = await response.json() as X402PaymentRequired;
      console.log('Step 2: Received 402 Payment Required (sBTC)');
      console.log('Payment details:', {
        amount: formatPaymentAmount(paymentRequest.maxAmountRequired, { tokenType: 'sBTC' }),
        payTo: paymentRequest.payTo,
        resource: paymentRequest.resource,
        tokenType: paymentRequest.tokenType,
        tokenContract: paymentRequest.tokenContract,
        expiresAt: paymentRequest.expiresAt,
      });

      // Step 3: Make sBTC payment
      console.log('\nStep 3: Making sBTC payment...');
      const paymentResult = await client.makePayment(paymentRequest);

      if (!paymentResult.success) {
        throw new Error(`sBTC payment failed: ${paymentResult.error}`);
      }

      console.log('sBTC payment successful!');
      console.log('Transaction ID:', paymentResult.txId);
      console.log('Explorer:', getExplorerURL(paymentResult.txId, NETWORK));

      // Step 4: Retry request with payment proof
      console.log('\nStep 4: Retrying request with sBTC payment proof...');

      const retryResponse = await fetch(`${SERVER_URL}/api/bitcoin-data`, {
        headers: {
          'X-Payment-TxId': paymentResult.txId,
        },
      });

      if (retryResponse.ok) {
        const data: any = await retryResponse.json();
        console.log('Success! Received Bitcoin data:', data.data);
        console.log('Payment info:', {
          txId: data.payment.txId,
          amount: data.payment.amount,
          tokenType: data.payment.tokenType,
          sender: data.payment.sender,
        });
      } else {
        console.error('Retry failed:', await retryResponse.text());
      }
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  }
}

// Main execution
async function main() {
  console.log('='.repeat(60));
  console.log('x402-stacks Client Examples');
  console.log('='.repeat(60));

  // Check if server is running
  try {
    const healthResponse = await fetch(`${SERVER_URL}/health`);
    if (!healthResponse.ok) {
      throw new Error('Server not responding');
    }
    console.log('✓ Server is running');
  } catch (error) {
    console.error('✗ Server is not running. Please start the server first:');
    console.error('  npm run dev:server');
    return;
  }

  // Run examples
  // Uncomment the examples you want to run

  // await example1_SimplePaidRequest();
  // await example2_TieredPricing();
  // await example3_RateLimiting();
  //await example4_ManualPayment();
  // await example5_HighValueRequest();
  await example6_SBTCPayment();

  console.log('\n' + '='.repeat(60));
  console.log('Examples completed');
  console.log('='.repeat(60));
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { main };

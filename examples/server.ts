/**
 * Example: x402-stacks Server Implementation
 * Express.js server with x402 payment-gated endpoints
 */

import 'dotenv/config';
import express, { Request, Response } from 'express';
import {
  x402PaymentRequired,
  tieredPayment,
  paymentRateLimit,
  getPayment,
  STXtoMicroSTX,
} from '../src';

const app = express();
app.use(express.json());

// Server configuration from environment variables
const SERVER_ADDRESS = process.env.SERVER_ADDRESS || 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';
const NETWORK = (process.env.NETWORK as 'mainnet' | 'testnet') || 'testnet';
const PORT = process.env.PORT || 3003;
const FACILITATOR_URL = process.env.FACILITATOR_URL || 'http://localhost:8085';

// Example 1: Simple payment-gated endpoint
app.get(
  '/api/premium-data',
  x402PaymentRequired({
    amount: STXtoMicroSTX(0.001), // 0.1 STX
    address: SERVER_ADDRESS,
    network: NETWORK,
    facilitatorUrl: FACILITATOR_URL,
  }),
  (req: Request, res: Response) => {
    const payment = getPayment(req);

    res.json({
      success: true,
      data: {
        premiumInfo: 'This is premium data',
        timestamp: new Date().toISOString(),
      },
      payment: {
        txId: payment.txId,
        amount: payment.amount.toString(),
        sender: payment.sender,
      },
    });
  }
);

// Example 2: Tiered pricing based on request parameters
app.get(
  '/api/market-data',
  tieredPayment(
    (req: Request) => {
      const dataType = req.query.type as string;

      // Different prices for different data types
      const pricing: Record<string, string> = {
        basic: '0.01',
        standard: '0.05',
        premium: '0.1',
      };

      const stxAmount = pricing[dataType] || pricing.basic;

      return {
        amount: STXtoMicroSTX(stxAmount),
        resource: `/api/market-data?type=${dataType}`,
      };
    },
    {
      address: SERVER_ADDRESS,
      network: NETWORK,
      facilitatorUrl: FACILITATOR_URL,
    }
  ),
  (req: Request, res: Response) => {
    const dataType = req.query.type as string;
    const payment = getPayment(req);

    res.json({
      success: true,
      dataType,
      marketData: {
        // Mock market data
        symbol: 'STX/USD',
        price: 1.23,
        volume: 1000000,
        timestamp: new Date().toISOString(),
      },
      payment: {
        txId: payment.txId,
        amount: payment.amount.toString(),
      },
    });
  }
);

// Example 3: Rate limiting with payment
// First 10 requests per hour are free, then require payment
app.get(
  '/api/search',
  paymentRateLimit({
    freeRequests: 10,
    windowMs: 60 * 60 * 1000, // 1 hour
    paymentConfig: {
      amount: STXtoMicroSTX(0.02),
      address: SERVER_ADDRESS,
      network: NETWORK,
      facilitatorUrl: FACILITATOR_URL,
    },
    keyGenerator: (req) => {
      // Use IP address or custom identifier
      return req.ip || 'unknown';
    },
  }),
  (req: Request, res: Response) => {
    const query = req.query.q as string;
    const payment = getPayment(req);

    res.json({
      success: true,
      query,
      results: [
        { id: 1, title: 'Result 1' },
        { id: 2, title: 'Result 2' },
      ],
      ...(payment && {
        payment: {
          txId: payment.txId,
          amount: payment.amount.toString(),
        },
      }),
    });
  }
);

// Example 4: Custom payment validation
app.post(
  '/api/compute',
  x402PaymentRequired({
    amount: STXtoMicroSTX(0.5),
    address: SERVER_ADDRESS,
    network: NETWORK,
    facilitatorUrl: FACILITATOR_URL,
    paymentValidator: async (payment) => {
      // Custom validation logic
      console.log('Validating payment:', payment.txId);

      // Example: Check if sender is on allowlist
      const allowedSenders = [''];

      // For testing, accept all valid payments
      return payment.isValid && payment.status === 'success';
    },
  }),
  async (req: Request, res: Response) => {
    const { task } = req.body;
    const payment = getPayment(req);

    // Simulate compute-intensive task
    await new Promise(resolve => setTimeout(resolve, 1000));

    res.json({
      success: true,
      result: {
        task,
        output: 'Computation completed',
        computeTime: '1000ms',
      },
      payment: {
        txId: payment.txId,
        confirmedInBlock: payment.blockHeight,
      },
    });
  }
);

// Health check endpoint (no payment required)
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    network: NETWORK,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`x402-stacks server running on port ${PORT}`);
  console.log(`Network: ${NETWORK}`);
  console.log(`Payment address: ${SERVER_ADDRESS}`);
  console.log(`Facilitator URL: ${FACILITATOR_URL}`);
  console.log('\nAvailable endpoints:');
  console.log('  GET  /health - Health check (free)');
  console.log('  GET  /api/premium-data - Premium data (0.1 STX, confirmed)');
  console.log('  GET  /api/market-data?type=basic|standard|premium - Market data (tiered pricing, confirmed)');
  console.log('  GET  /api/search?q=query - Search (10 free/hour, then 0.02 STX, confirmed)');
  console.log('  POST /api/compute - Compute task (0.5 STX, confirmed)');
});

export default app;

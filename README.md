# x402-stacks

TypeScript library for implementing the x402 payment protocol on Stacks blockchain.

x402 enables **machine-native, HTTP-level payments** for APIs, AI agents, and digital services using STX tokens on the Stacks blockchain. Pay for what you use, when you use it - no subscriptions, no API keys, no intermediaries.

## Features

- **HTTP 402 Payment Required** - Native payment protocol using standard HTTP status codes
- **Automatic Payment Handling** - Client automatically pays and retries requests
- **Payment Verification** - Server-side validation of STX token transfers
- **Express.js Middleware** - Drop-in middleware for payment-gated endpoints
- **Flexible Pricing** - Support for fixed, tiered, and dynamic pricing
- **Rate Limiting** - Free tier with payment-based overflow
- **TypeScript** - Full type safety and IntelliSense support
- **Bitcoin-Secured** - Leverages Stacks' Bitcoin anchoring for security

## Installation

```bash
npm install x402-stacks
```

## Quick Start

### Server (Express.js)

```typescript
import express from 'express';
import { x402PaymentRequired, STXtoMicroSTX } from 'x402-stacks';

const app = express();

app.get(
  '/api/premium-data',
  x402PaymentRequired({
    amount: STXtoMicroSTX(0.1), // 0.1 STX
    address: 'SP1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM', // Your Stacks address
    network: 'mainnet',
    acceptUnconfirmed: true,
  }),
  (req, res) => {
    res.json({ data: 'This is premium content' });
  }
);

app.listen(3000);
```

### Client

```typescript
import { X402PaymentClient } from 'x402-stacks';

const client = new X402PaymentClient({
  network: 'mainnet',
  privateKey: 'your-private-key-hex',
});

// Automatically handles 402 responses and makes payments
const data = await client.requestWithPayment('https://api.example.com/premium-data');
console.log(data);
```

## How It Works

### Payment Flow

```
1. Client requests API → Server returns 402 with payment details
2. Client constructs STX transfer using payment details
3. Client broadcasts transaction → receives transaction ID
4. Client retries request with transaction ID in header
5. Server verifies transaction on Stacks blockchain
6. Server validates: recipient, amount, status
7. Access granted if valid
```

### 402 Payment Required Response

When a client requests a paid endpoint without payment, the server responds with HTTP 402:

```json
{
  "maxAmountRequired": "100000",
  "resource": "/api/premium-data",
  "payTo": "SP1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  "network": "mainnet",
  "nonce": "abc123",
  "expiresAt": "2024-01-01T12:00:00Z",
  "memo": "x402:/api/premium-data,nonce=abc123"
}
```

## API Reference

### Client

#### `X402PaymentClient`

```typescript
const client = new X402PaymentClient({
  network: 'mainnet' | 'testnet',
  privateKey: string,
  timeout?: number,
});

// Make request with automatic payment handling
await client.requestWithPayment<T>(url, options?);

// Make manual payment
await client.makePayment(paymentRequest);

// Send STX transfer
await client.sendSTXTransfer(details);
```

### Server

#### `x402PaymentRequired` Middleware

```typescript
x402PaymentRequired({
  amount: string | bigint,           // Amount in microSTX
  address: string,                   // Your Stacks address
  network: 'mainnet' | 'testnet',
  resource?: string,                 // Custom resource identifier
  expirationSeconds?: number,        // Default: 300
  acceptUnconfirmed?: boolean,       // Default: false
  paymentValidator?: (payment) => boolean,
})
```

#### Advanced Middleware

**Tiered Pricing**:
```typescript
tieredPayment(
  (req) => ({
    amount: req.query.premium ? STXtoMicroSTX(1.0) : STXtoMicroSTX(0.1),
    resource: req.path,
  }),
  { address, network }
)
```

**Rate Limiting with Payments**:
```typescript
paymentRateLimit({
  freeRequests: 10,
  windowMs: 60 * 60 * 1000, // 1 hour
  paymentConfig: {
    amount: STXtoMicroSTX(0.01),
    address,
    network,
  },
})
```

**Conditional Payments**:
```typescript
conditionalPayment(
  (req) => req.user?.isPremium !== true,
  { amount, address, network }
)
```

### Payment Verifier

```typescript
import { X402PaymentVerifier } from 'x402-stacks';

const verifier = new X402PaymentVerifier('mainnet');

// Verify payment transaction
const verification = await verifier.verifyPayment(txId, {
  expectedRecipient: 'SP1...',
  minAmount: BigInt(100000),
  acceptUnconfirmed: true,
});

if (verification.isValid) {
  // Grant access
}

// Wait for confirmation
const tx = await verifier.waitForConfirmation(txId, maxAttempts, intervalMs);
```

### Utilities

```typescript
import {
  STXtoMicroSTX,
  microSTXtoSTX,
  generateKeypair,
  isValidStacksAddress,
  formatPaymentAmount,
  getExplorerURL,
  createPaymentMemo,
  parsePaymentMemo,
} from 'x402-stacks';

// Convert amounts
const microSTX = STXtoMicroSTX(1.5);        // 1500000n
const stx = microSTXtoSTX(1500000n);        // "1.500000"

// Generate wallet
const wallet = generateKeypair('testnet');
// { privateKey, publicKey, address }

// Validate address
isValidStacksAddress('SP1...');  // true

// Format for display
formatPaymentAmount(100000n);    // "0.100000 STX"

// Get explorer link
getExplorerURL(txId, 'mainnet');
```

## Examples

### Example 1: Simple Payment Gate

```typescript
// server.ts
app.get(
  '/api/data',
  x402PaymentRequired({
    amount: STXtoMicroSTX(0.05),
    address: SERVER_ADDRESS,
    network: 'mainnet',
  }),
  (req, res) => {
    res.json({ data: 'Premium content' });
  }
);

// client.ts
const data = await client.requestWithPayment('https://api.example.com/data');
```

### Example 2: Usage-Based Pricing

```typescript
app.get(
  '/api/compute',
  tieredPayment(
    (req) => {
      const complexity = parseInt(req.query.complexity as string) || 1;
      const basePrice = 0.01;
      const amount = STXtoMicroSTX(basePrice * complexity);

      return { amount, resource: `/api/compute?complexity=${complexity}` };
    },
    { address: SERVER_ADDRESS, network: 'mainnet' }
  ),
  async (req, res) => {
    const result = await performComputation(req.query.complexity);
    res.json({ result });
  }
);
```

### Example 3: Custom Validation

```typescript
app.post(
  '/api/upload',
  x402PaymentRequired({
    amount: STXtoMicroSTX(0.25),
    address: SERVER_ADDRESS,
    network: 'mainnet',
    acceptUnconfirmed: false, // Require confirmation
    paymentValidator: async (payment) => {
      // Custom validation logic
      const isAllowed = await checkUserAllowlist(payment.sender);
      return isAllowed && payment.amount >= STXtoMicroSTX(0.25);
    },
  }),
  async (req, res) => {
    // Handle file upload
  }
);
```

### Example 4: Manual Payment Flow

```typescript
// Client-side manual control
try {
  const response = await fetch('https://api.example.com/data');

  if (response.status === 402) {
    const paymentRequest = await response.json();

    // Make payment
    const paymentResult = await client.makePayment(paymentRequest);

    // Retry with proof
    const retryResponse = await fetch('https://api.example.com/data', {
      headers: {
        'X-Payment-TxId': paymentResult.txId,
      },
    });

    const data = await retryResponse.json();
  }
} catch (error) {
  console.error('Payment error:', error);
}
```

## Use Cases

### AI Agents
Enable AI agents to autonomously pay for:
- Real-time data feeds ($0.01/query)
- API access ($0.05/request)
- Compute resources ($0.50/minute)
- Storage ($0.001/GB)

### Micropayments
Support pay-per-use business models:
- Content access ($0.10/article)
- Image processing ($0.005/image)
- API calls ($0.02/request)
- Data queries ($0.03/query)

### Dynamic Pricing
Implement flexible pricing:
- Time-based (peak/off-peak)
- Usage-based (complexity, size)
- Tiered (basic/premium)
- Rate-limited (free tier + paid overflow)

## Development

### Build

```bash
npm install
npm run build
```

### Run Examples

```bash
# Terminal 1: Start server
npm run dev:server

# Terminal 2: Fund test wallet and run client
npm run dev:client
```

### Testing

Fund a testnet address from the [Stacks Faucet](https://explorer.stacks.co/sandbox/faucet?chain=testnet).

## Configuration

### Network Selection

```typescript
// Mainnet
const client = new X402PaymentClient({
  network: 'mainnet',
  privateKey: process.env.PRIVATE_KEY,
});

// Testnet (for development)
const client = new X402PaymentClient({
  network: 'testnet',
  privateKey: process.env.TESTNET_PRIVATE_KEY,
});
```

### Security Best Practices

1. **Never commit private keys** - Use environment variables
2. **Require confirmations for high-value transactions** - Set `acceptUnconfirmed: false`
3. **Implement custom validators** - Add business logic validation
4. **Set reasonable expiration times** - Prevent replay attacks
5. **Use HTTPS in production** - Protect payment data in transit

## Why Stacks?

- **Bitcoin Security** - Transactions are anchored to Bitcoin L1
- **Smart Contracts** - Clarity language for advanced payment logic
- **Fast Settlement** - ~10 minute block times (vs 10+ min for Bitcoin)
- **Low Fees** - Micropayment-friendly transaction costs
- **Native Tokens** - STX and SIP-010 fungible tokens

## Comparison

| Feature | x402-stacks | Credit Cards | Subscriptions |
|---------|-------------|--------------|---------------|
| Fees | <$0.01 | $0.30 + 2.9% | Monthly/Annual |
| Settlement | ~10 minutes | 1-3 days | Monthly billing |
| Chargebacks | No | Yes (120 days) | Yes |
| Micropayments | Yes | No (minimum ~$0.50) | No |
| AI-Native | Yes | No | No |
| Global | Yes | Limited | Limited |

## License

MIT

## Resources

- [x402 Protocol Specification](./x402.MD)
- [Stacks Blockchain](https://www.stacks.co/)
- [Stacks.js Documentation](https://docs.hiro.so/stacks.js)
- [Stacks Explorer](https://explorer.stacks.co/)
- [Testnet Faucet](https://explorer.stacks.co/sandbox/faucet?chain=testnet)

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Support

For questions and support:
- Open an issue on GitHub
- Check the [examples](./examples) directory
- Read the [x402 specification](./x402.MD)

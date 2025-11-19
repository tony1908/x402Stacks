# x402-stacks

A TypeScript library for implementing the x402 payment protocol on Stacks blockchain.

x402 enables **automatic HTTP-level payments** for APIs, AI agents, and digital services using STX or sBTC tokens on Stacks. Pay only for what you use, right when you use it. No subscriptions, no API keys, no intermediaries.

## Features

- **HTTP 402 Payment Required** - Native payment protocol using HTTP status codes you already know
- **Multi-Token Support** - Accept payments in STX or sBTC (Bitcoin on Stacks)
- **Automatic Payments** - Client pays automatically and retries requests
- **Payment Verification** - Server-side validation of token transfers
- **Express.js Middleware** - Plug and play, protect your endpoints with payments
- **Flexible Pricing** - Configure fixed prices, tiered, or dynamic pricing
- **Rate Limiting** - Free tier with pay-when-you-exceed option
- **TypeScript** - Fully typed with IntelliSense included
- **Bitcoin Security** - Leverages Stacks' Bitcoin anchoring

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

## How Does It Work?

### The Payment Flow

```
1. Client requests API access → Server responds 402 with payment details
2. Client builds STX transfer with those details
3. Client sends transaction → receives transaction ID
4. Client retries with ID in header
5. Server verifies transaction on Stacks
6. Server validates: recipient, amount, status
7. If everything checks out, access granted
```

### The 402 Payment Required Response

When a client requests a payment endpoint without having paid, the server responds with HTTP 402:

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

// Make request with automatic payment
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

**Tiered pricing**:
```typescript
tieredPayment(
  (req) => ({
    amount: req.query.premium ? STXtoMicroSTX(1.0) : STXtoMicroSTX(0.1),
    resource: req.path,
  }),
  { address, network }
)
```

**Rate limiting with payments**:
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

**Conditional payments**:
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

// Generate a wallet
const wallet = generateKeypair('testnet');
// { privateKey, publicKey, address }

// Validate an address
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
      // Your validation logic
      const isAllowed = await checkUserAllowlist(payment.sender);
      return isAllowed && payment.amount >= STXtoMicroSTX(0.25);
    },
  }),
  async (req, res) => {
    // Handle file upload
  }
);
```

### Example 4: Manual Payment Control

```typescript
// Manual payment control from client
try {
  const response = await fetch('https://api.example.com/data');

  if (response.status === 402) {
    const paymentRequest = await response.json();

    // Make payment
    const paymentResult = await client.makePayment(paymentRequest);

    // Retry with proof of payment
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

## sBTC Support

x402-stacks now supports **sBTC** (Bitcoin on Stacks) for payments in addition to STX! sBTC is a 1:1 Bitcoin-backed asset on Stacks, allowing users to pay with Bitcoin while leveraging Stacks' fast settlement.

### Why sBTC?

- **Bitcoin-backed**: 1:1 peg with Bitcoin
- **Lower volatility**: More stable than STX for pricing
- **Broader appeal**: Tap into Bitcoin holders
- **Same speed**: Fast Stacks settlement (~200ms)

### Using sBTC on Server

```typescript
import { x402PaymentRequired, BTCtoSats, getDefaultSBTCContract } from 'x402-stacks';

app.get(
  '/api/bitcoin-data',
  x402PaymentRequired({
    amount: BTCtoSats(0.00001), // 0.00001 BTC (1000 sats)
    address: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
    network: 'testnet',
    tokenType: 'sBTC',
    tokenContract: getDefaultSBTCContract('testnet'),
  }),
  (req, res) => {
    res.json({ data: 'Premium Bitcoin data' });
  }
);
```

### Using sBTC on Client

The client automatically handles sBTC payments when it receives a 402 response requesting sBTC:

```typescript
import { X402PaymentClient } from 'x402-stacks';

const client = new X402PaymentClient({
  network: 'testnet',
  privateKey: 'your-private-key',
});

// Client automatically detects sBTC requirement and pays in sBTC
const data = await client.requestWithPayment('http://localhost:3003/api/bitcoin-data');
```

### sBTC Contracts

**Testnet**: `ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token`

**Mainnet**: To be configured when sBTC mainnet launches

### Facilitator API Format

The library automatically handles the token type format conversion for the Facilitator API:

**STX Verification** (default):
```json
{
  "tx_id": "0x...",
  "expected_recipient": "ST1...",
  "min_amount": 2500000,
  "network": "testnet"
}
```

**sBTC Verification**:
```json
{
  "tx_id": "0x...",
  "token_type": "SBTC",
  "expected_recipient": "ST1...",
  "min_amount": 100000000,
  "network": "testnet"
}
```

Note: The library uses `'sBTC'` in your code, but automatically converts to `'SBTC'` (uppercase) when communicating with the Facilitator API.

### Default Facilitator

The library uses the following default facilitator for payment verification:

**Default Facilitator URL**: `https://x402-backend-7eby.onrender.com`

This facilitator handles both STX and sBTC payment verification. You can override this by configuring your own facilitator endpoint if needed.

### sBTC Utilities

```typescript
import { BTCtoSats, satsToBTC, formatPaymentAmount } from 'x402-stacks';

// Convert BTC to sats
const sats = BTCtoSats(0.001); // 100000n

// Convert sats to BTC
const btc = satsToBTC(100000n); // "0.00100000"

// Format for display
const formatted = formatPaymentAmount(100000n, { tokenType: 'sBTC' }); // "0.001000 sBTC"
```

### Mixed Token Support

You can run both STX and sBTC endpoints on the same server:

```typescript
// STX endpoint
app.get('/api/stx-data',
  x402PaymentRequired({
    amount: STXtoMicroSTX(0.1),
    address: SERVER_ADDRESS,
    network: 'testnet',
  }),
  handler
);

// sBTC endpoint
app.get('/api/btc-data',
  x402PaymentRequired({
    amount: BTCtoSats(0.00001),
    address: SERVER_ADDRESS,
    network: 'testnet',
    tokenType: 'sBTC',
    tokenContract: getDefaultSBTCContract('testnet'),
  }),
  handler
);
```

## Use Cases

### AI Agents
Let AI agents pay autonomously for:
- Real-time data ($0.01/query)
- API access ($0.05/request)
- Compute ($0.50/minute)
- Storage ($0.001/GB)

### Micropayments
Build pay-as-you-go business models:
- Article access ($0.10/article)
- Image processing ($0.005/image)
- API calls ($0.02/call)
- Data queries ($0.03/query)

### Dynamic Pricing
Implement flexible pricing:
- Time-based (peak/off-peak)
- Usage-based (complexity, size)
- Tiered (basic/premium)
- Free tier with pay-when-exceeded

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

# Terminal 2: Fund your test wallet and run client
npm run dev:client
```

### Testing

Get testnet funds from the [Stacks Faucet](https://explorer.stacks.co/sandbox/faucet?chain=testnet).

## Configuration

### Choosing the Network

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

1. **Never commit private keys to git** - Use environment variables
2. **Require confirmations for large payments** - Set `acceptUnconfirmed: false`
3. **Create your own validators** - Add your business logic
4. **Use reasonable expiration times** - Prevent replay attacks
5. **Always HTTPS in production** - Protect payment data in transit

## Why Stacks?

- **Bitcoin Security** - Transactions anchor to Bitcoin L1
- **Smart Contracts** - Clarity language for advanced payment logic
- **Fast Confirmation** - ~10 minute blocks (vs 10+ min on Bitcoin)
- **Low Fees** - Cost-effective for micropayments
- **Native Tokens** - STX and SIP-010 fungible tokens

## Comparison

| Feature | x402-stacks | Credit Cards | Subscriptions |
|---------|-------------|--------------|---------------|
| Fees | <$0.01 | $0.30 + 2.9% | Monthly/Annual |
| Confirmation | ~10 minutes | 1-3 days | Monthly billing |
| Chargebacks | No | Yes (120 days) | Yes |
| Micropayments | Yes | No (min ~$0.50) | No |
| For AI | Yes | No | No |
| Global | Yes | Limited | Limited |

## License

MIT

## Resources

- [x402 Protocol Specification](./x402.MD)
- [Stacks Blockchain](https://www.stacks.co/)
- [Stacks.js Docs](https://docs.hiro.so/stacks.js)
- [Stacks Explorer](https://explorer.stacks.co/)
- [Testnet Faucet](https://explorer.stacks.co/sandbox/faucet?chain=testnet)

## Contributing

Contributions are welcome! Open an issue or submit a pull request.

## Support

If you have questions or need help:
- Open an issue on GitHub
- Check the [examples](./examples)
- Read the [x402 specification](./x402.MD)

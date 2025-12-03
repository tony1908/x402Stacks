# x402-stacks

A TypeScript library for implementing the x402 payment protocol on Stacks blockchain.

x402 enables **automatic HTTP-level payments** for APIs, AI agents, and digital services using STX or sBTC tokens on Stacks. Pay only for what you use, right when you use it. No subscriptions, no API keys, no intermediaries.

## Features

- **HTTP 402 Payment Required** - Native payment protocol using HTTP status codes you already know
- **Multi-Token Support** - Accept payments in STX or sBTC (Bitcoin on Stacks)
- **Automatic Payments** - Client pays automatically via axios interceptor (x402-axios pattern)
- **Facilitator Pattern** - Client signs, server settles via facilitator for reliable payments
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

### Client (Recommended: axios interceptor pattern)

```typescript
import axios from 'axios';
import { withPaymentInterceptor, privateKeyToAccount } from 'x402-stacks';

// Create account from private key
const account = privateKeyToAccount(process.env.PRIVATE_KEY!, 'testnet');

// Wrap axios with automatic payment handling
const api = withPaymentInterceptor(
  axios.create({ baseURL: 'https://api.example.com' }),
  account
);

// Use normally - 402 payments are handled automatically!
const response = await api.get('/api/premium-data');
console.log(response.data);
```

### Server (Express.js)

```typescript
import express from 'express';
import { x402PaymentRequired, STXtoMicroSTX } from 'x402-stacks';

const app = express();

app.get(
  '/api/premium-data',
  x402PaymentRequired({
    amount: STXtoMicroSTX(0.1), // 0.1 STX
    address: 'SP1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
    network: 'mainnet',
    facilitatorUrl: 'https://x402-facilitator.example.com', // Optional
  }),
  (req, res) => {
    res.json({ data: 'This is premium content' });
  }
);

app.listen(3000);
```

## How Does It Work?

### The x402 Facilitator Pattern

x402-stacks uses the **facilitator pattern** for reliable payments:

```
1. Client requests API → Server responds 402 with payment details
2. Client signs STX/sBTC transaction (does NOT broadcast)
3. Client retries request with signed tx in X-PAYMENT header
4. Server sends signed tx to facilitator /settle endpoint
5. Facilitator broadcasts tx and waits for confirmation
6. Server receives confirmation → grants access
7. Server returns X-PAYMENT-RESPONSE header with tx details
```

This pattern ensures:
- **Atomicity**: Payment and access happen together
- **No double-spending**: Server controls when tx is broadcast
- **Reliable confirmation**: Facilitator handles blockchain polling

### The 402 Payment Required Response

When a client requests a payment endpoint without having paid, the server responds with HTTP 402:

```json
{
  "maxAmountRequired": "100000",
  "resource": "/api/premium-data",
  "payTo": "SP1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  "network": "mainnet",
  "nonce": "abc123def456",
  "expiresAt": "2024-01-01T12:00:00Z",
  "tokenType": "STX"
}
```

## API Reference

### Client

#### `withPaymentInterceptor` (Recommended)

Wraps an axios instance with automatic 402 payment handling:

```typescript
import axios from 'axios';
import { withPaymentInterceptor, privateKeyToAccount } from 'x402-stacks';

const account = privateKeyToAccount('your-private-key', 'testnet');

const api = withPaymentInterceptor(
  axios.create({ baseURL: 'https://api.example.com' }),
  account
);

// All requests automatically handle 402 responses
const data = await api.get('/premium-endpoint');
```

#### `privateKeyToAccount`

Creates a Stacks account from a private key:

```typescript
import { privateKeyToAccount } from 'x402-stacks';

const account = privateKeyToAccount(
  'your-private-key-hex',
  'mainnet' | 'testnet'
);
// Returns: { address, privateKey, network }
```

#### `createPaymentClient`

Convenience function that creates an axios instance with payment handling:

```typescript
import { createPaymentClient, privateKeyToAccount } from 'x402-stacks';

const account = privateKeyToAccount(process.env.PRIVATE_KEY!, 'testnet');
const api = createPaymentClient(account, { baseURL: 'https://api.example.com' });

const response = await api.get('/premium-data');
```

#### `decodeXPaymentResponse`

Decode the X-PAYMENT-RESPONSE header from server responses:

```typescript
import { decodeXPaymentResponse } from 'x402-stacks';

const response = await api.get('/premium-data');
const paymentInfo = decodeXPaymentResponse(response.headers['x-payment-response']);

if (paymentInfo) {
  console.log('Transaction ID:', paymentInfo.txId);
  console.log('Status:', paymentInfo.status);
  console.log('Block height:', paymentInfo.blockHeight);
}
```

#### `X402PaymentClient` (Legacy)

Class-based client for more control:

```typescript
import { X402PaymentClient } from 'x402-stacks';

const client = new X402PaymentClient({
  network: 'mainnet',
  privateKey: 'your-private-key',
});

// Sign a payment (returns signed tx hex)
const signResult = await client.signPayment(paymentRequest);

// Make request with automatic payment
const data = await client.requestWithPayment<T>(url, options?);
```

### Server

#### `x402PaymentRequired` Middleware

```typescript
x402PaymentRequired({
  amount: string | bigint,           // Amount in microSTX or sats
  address: string,                   // Your Stacks address
  network: 'mainnet' | 'testnet',
  facilitatorUrl?: string,           // Facilitator API URL
  resource?: string,                 // Custom resource identifier
  expirationSeconds?: number,        // Default: 300
  tokenType?: 'STX' | 'sBTC',        // Default: 'STX'
  tokenContract?: TokenContract,     // Required for sBTC
  paymentValidator?: (payment) => boolean,
})
```

#### `X402PaymentVerifier`

Server-side payment verification and settlement:

```typescript
import { X402PaymentVerifier } from 'x402-stacks';

const verifier = new X402PaymentVerifier(
  'https://facilitator.example.com',
  'testnet'
);

// Settle a signed transaction (broadcasts via facilitator)
const result = await verifier.settlePayment(signedTxHex, {
  expectedRecipient: 'ST1...',
  minAmount: BigInt(100000),
  tokenType: 'STX',
});

if (result.isValid) {
  console.log('Payment confirmed:', result.txId);
}
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

### Utilities

```typescript
import {
  STXtoMicroSTX,
  microSTXtoSTX,
  BTCtoSats,
  satsToBTC,
  generateKeypair,
  isValidStacksAddress,
  formatPaymentAmount,
  getExplorerURL,
  getDefaultSBTCContract,
} from 'x402-stacks';

// Convert amounts
const microSTX = STXtoMicroSTX(1.5);        // 1500000n
const stx = microSTXtoSTX(1500000n);        // "1.500000"
const sats = BTCtoSats(0.001);              // 100000n

// Generate a wallet
const wallet = generateKeypair('testnet');
// { privateKey, publicKey, address }

// Validate an address
isValidStacksAddress('SP1...');  // true

// Format for display
formatPaymentAmount(100000n);                        // "0.100000 STX"
formatPaymentAmount(100000n, { tokenType: 'sBTC' }); // "0.001000 sBTC"

// Get explorer link
getExplorerURL(txId, 'mainnet');
```

## Examples

### Example 1: Simple Automatic Payment

```typescript
// client.ts
import axios from 'axios';
import { withPaymentInterceptor, privateKeyToAccount, decodeXPaymentResponse } from 'x402-stacks';

const account = privateKeyToAccount(process.env.PRIVATE_KEY!, 'testnet');
const api = withPaymentInterceptor(axios.create({ baseURL: SERVER_URL }), account);

// Just make the request - payment is automatic!
const response = await api.get('/api/premium-data');
console.log('Data:', response.data);

// Check payment details
const paymentResponse = decodeXPaymentResponse(response.headers['x-payment-response']);
if (paymentResponse) {
  console.log('Paid with tx:', paymentResponse.txId);
}
```

### Example 2: Tiered Pricing

```typescript
// server.ts
app.get('/api/market-data',
  tieredPayment(
    (req) => {
      const type = req.query.type as string;
      const prices = { basic: 0.01, standard: 0.05, premium: 0.10 };
      return {
        amount: STXtoMicroSTX(prices[type] || 0.01),
        resource: `/api/market-data?type=${type}`,
      };
    },
    { address: SERVER_ADDRESS, network: 'testnet' }
  ),
  (req, res) => {
    res.json({ marketData: getMarketData(req.query.type) });
  }
);

// client.ts
const basic = await api.get('/api/market-data?type=basic');     // 0.01 STX
const premium = await api.get('/api/market-data?type=premium'); // 0.10 STX
```

### Example 3: Rate Limiting with Payments

```typescript
// First 10 requests free, then payment required
app.get('/api/search',
  paymentRateLimit({
    freeRequests: 10,
    windowMs: 60 * 60 * 1000, // 1 hour
    paymentConfig: {
      amount: STXtoMicroSTX(0.02),
      address: SERVER_ADDRESS,
      network: 'testnet',
    },
  }),
  (req, res) => {
    res.json({ results: search(req.query.q) });
  }
);
```

### Example 4: Manual Payment Flow

```typescript
// For understanding the protocol
import axios from 'axios';
import { X402PaymentClient, X402PaymentRequired } from 'x402-stacks';

const client = new X402PaymentClient({ network: 'testnet', privateKey: PRIVATE_KEY });

// Step 1: Make request without payment
const response = await axios.get(url).catch(e => e.response);

if (response.status === 402) {
  const paymentRequest: X402PaymentRequired = response.data;

  // Step 2: Sign the payment
  const signResult = await client.signPayment(paymentRequest);

  // Step 3: Retry with signed transaction
  const paidResponse = await axios.get(url, {
    headers: {
      'X-PAYMENT': signResult.signedTransaction,
      'X-PAYMENT-TOKEN-TYPE': paymentRequest.tokenType || 'STX',
    },
  });

  console.log('Success:', paidResponse.data);
}
```

## sBTC Support

x402-stacks supports **sBTC** (Bitcoin on Stacks) for payments in addition to STX! sBTC is a 1:1 Bitcoin-backed asset on Stacks, allowing users to pay with Bitcoin while leveraging Stacks' fast settlement.

### Why sBTC?

- **Bitcoin-backed**: 1:1 peg with Bitcoin
- **Lower volatility**: More stable than STX for pricing
- **Broader appeal**: Tap into Bitcoin holders
- **Same speed**: Fast Stacks settlement

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
import axios from 'axios';
import { withPaymentInterceptor, privateKeyToAccount } from 'x402-stacks';

const account = privateKeyToAccount(process.env.PRIVATE_KEY!, 'testnet');
const api = withPaymentInterceptor(axios.create(), account);

// Client automatically detects sBTC requirement and pays in sBTC
const data = await api.get('http://localhost:3003/api/bitcoin-data');
```

### sBTC Contracts

**Testnet**: `ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token`

**Mainnet**: To be configured when sBTC mainnet launches

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

## Facilitator API

The library uses a facilitator service to broadcast and confirm transactions. The facilitator provides:

- `/api/v1/settle` - Broadcast signed transaction and wait for confirmation
- `/api/v1/verify` - Verify an existing transaction

### Default Facilitator

**Default URL**: `https://x402-backend-7eby.onrender.com`

You can run your own facilitator or use a custom one:

```typescript
x402PaymentRequired({
  // ...
  facilitatorUrl: 'https://your-facilitator.example.com',
})
```

### Settle Request Format

```json
{
  "signed_transaction": "0x...",
  "expected_recipient": "ST1...",
  "min_amount": 100000,
  "network": "testnet",
  "token_type": "STX",
  "resource": "/api/premium-data",
  "method": "GET"
}
```

### Settle Response Format

```json
{
  "success": true,
  "tx_id": "0x...",
  "status": "confirmed",
  "sender_address": "ST1...",
  "recipient_address": "ST2...",
  "amount": 100000,
  "block_height": 12345
}
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

### Environment Variables

```bash
# Client
PRIVATE_KEY=your-private-key-hex
NETWORK=testnet

# Server
SERVER_PRIVATE_KEY=your-server-private-key
SERVER_ADDRESS=ST1...
FACILITATOR_URL=https://your-facilitator.example.com
```

### Security Best Practices

1. **Never commit private keys to git** - Use environment variables
2. **Use the facilitator pattern** - Don't let clients broadcast directly
3. **Create your own validators** - Add your business logic
4. **Use reasonable expiration times** - Prevent replay attacks
5. **Always HTTPS in production** - Protect payment data in transit

## Why Stacks?

- **Bitcoin Security** - Transactions anchor to Bitcoin L1
- **Smart Contracts** - Clarity language for advanced payment logic
- **Fast Confirmation** - ~10 minute blocks (vs 10+ min on Bitcoin)
- **Low Fees** - Cost-effective for micropayments
- **Native Tokens** - STX and SIP-010 fungible tokens (sBTC)

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

# x402-stacks

A TypeScript library for implementing the x402 payment protocol on Stacks blockchain.

x402 enables **automatic HTTP-level payments** for APIs, AI agents, and digital services using STX or sBTC tokens on Stacks. Pay only for what you use, right when you use it. No subscriptions, no API keys, no intermediaries.

## Features

- **HTTP 402 Payment Required** - Native payment protocol using HTTP status codes you already know
- **Multi-Token Support** - Accept payments in STX or sBTC (Bitcoin on Stacks)
- **Automatic Payments** - Client pays automatically via axios interceptor
- **Facilitator Pattern** - Client signs, server settles via facilitator for reliable payments
- **Express.js Middleware** - Plug and play, protect your endpoints with payments
- **Flexible Pricing** - Configure fixed prices, tiered, or dynamic pricing
- **Rate Limiting** - Free tier with pay-when-you-exceed option
- **TypeScript** - Fully typed with IntelliSense included
- **Bitcoin Security** - Leverages Stacks' Bitcoin anchoring
- **x402 V2 Compatible** - Follows Coinbase x402 specification with CAIP-2 network identifiers

## Installation

```bash
npm install x402-stacks
```

## Quick Start

### Client (Recommended: axios interceptor pattern)

```typescript
import axios from 'axios';
import { wrapAxiosWithPayment, privateKeyToAccount } from 'x402-stacks';

// Create account from private key
const account = privateKeyToAccount(process.env.PRIVATE_KEY!, 'testnet');

// Wrap axios with automatic payment handling
const api = wrapAxiosWithPayment(
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
import { paymentMiddleware, STXtoMicroSTX } from 'x402-stacks';

const app = express();

app.get(
  '/api/premium-data',
  paymentMiddleware({
    amount: STXtoMicroSTX(0.1), // 0.1 STX
    address: 'SP1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
    network: 'mainnet',
    facilitatorUrl: 'https://x402-facilitator.example.com',
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
3. Client retries request with signed tx in payment-signature header
4. Server sends signed tx to facilitator /settle endpoint
5. Facilitator broadcasts tx and waits for confirmation
6. Server receives confirmation → grants access
7. Server returns payment-response header with tx details
```

This pattern ensures:
- **Atomicity**: Payment and access happen together
- **No double-spending**: Server controls when tx is broadcast
- **Reliable confirmation**: Facilitator handles blockchain polling

### The 402 Payment Required Response

When a client requests a payment endpoint without having paid, the server responds with HTTP 402 and the `payment-required` header containing base64-encoded payment requirements:

```json
{
  "x402Version": 2,
  "paymentRequirements": {
    "scheme": "exact",
    "network": "stacks:2147483648",
    "amount": "100000",
    "asset": "STX",
    "payTo": "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
    "maxTimeoutSeconds": 300
  }
}
```

## x402 V2 Protocol

This library implements the **x402 V2 protocol** which is compatible with the Coinbase x402 specification.

### Key V2 Features

- **CAIP-2 Network Identifiers**: Networks are specified using CAIP-2 format
  - Mainnet: `stacks:1`
  - Testnet: `stacks:2147483648`
- **Base64 Encoded Headers**: Payment data is base64 encoded in HTTP headers
- **Standard Headers**:
  - `payment-required` - Server's payment requirements (402 response)
  - `payment-signature` - Client's signed transaction
  - `payment-response` - Server's settlement confirmation

### V2 Facilitator Endpoints

The V2 facilitator provides these endpoints at the root level:

- `GET /supported` - Returns supported payment kinds
- `POST /verify` - Verify a payment payload
- `POST /settle` - Broadcast and confirm a signed transaction

### V2 Request/Response Format

**Settle Request:**
```json
{
  "x402Version": 2,
  "paymentPayload": {
    "x402Version": 2,
    "payload": {
      "transaction": "0x..."
    },
    "accepted": {
      "scheme": "exact",
      "network": "stacks:2147483648",
      "amount": "100000",
      "asset": "STX",
      "payTo": "ST1..."
    }
  },
  "paymentRequirements": {
    "scheme": "exact",
    "network": "stacks:2147483648",
    "amount": "100000",
    "asset": "STX",
    "payTo": "ST1..."
  }
}
```

**Settle Response:**
```json
{
  "success": true,
  "payer": "ST1...",
  "transaction": "0x...",
  "network": "stacks:2147483648"
}
```

## API Reference

### Client

#### `wrapAxiosWithPayment` (Recommended)

Wraps an axios instance with automatic 402 payment handling:

```typescript
import axios from 'axios';
import { wrapAxiosWithPayment, privateKeyToAccount } from 'x402-stacks';

const account = privateKeyToAccount('your-private-key', 'testnet');

const api = wrapAxiosWithPayment(
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

#### `decodePaymentResponse`

Decode the payment-response header from server responses:

```typescript
import { decodePaymentResponse } from 'x402-stacks';

const response = await api.get('/premium-data');
const paymentInfo = decodePaymentResponse(response.headers['payment-response']);

if (paymentInfo) {
  console.log('Transaction ID:', paymentInfo.transaction);
  console.log('Payer:', paymentInfo.payer);
  console.log('Network:', paymentInfo.network);
}
```

### Server

#### `paymentMiddleware`

Express middleware for requiring payment:

```typescript
paymentMiddleware({
  amount: string | bigint,           // Amount in microSTX or sats
  address: string,                   // Your Stacks address
  network: 'mainnet' | 'testnet',
  facilitatorUrl?: string,           // Facilitator API URL
  resource?: string,                 // Custom resource identifier
  description?: string,              // Human-readable description
  mimeType?: string,                 // Response MIME type
  tokenType?: 'STX' | 'sBTC',        // Default: 'STX'
  tokenContract?: TokenContract,     // Required for sBTC
})
```

#### `getPayment`

Retrieve payment information from a request:

```typescript
import { getPayment } from 'x402-stacks';

app.get('/api/data', paymentMiddleware(config), (req, res) => {
  const payment = getPayment(req);
  if (payment) {
    console.log('Paid by:', payment.payer);
    console.log('Transaction:', payment.transaction);
  }
  res.json({ data: 'Premium content' });
});
```

#### `X402PaymentVerifier`

Server-side payment verification and settlement:

```typescript
import { X402PaymentVerifier, createVerifier } from 'x402-stacks';

// Using the class
const verifier = new X402PaymentVerifier(
  'https://facilitator.example.com',
  'testnet'
);

// Or using the factory function
const verifier = createVerifier('https://facilitator.example.com', 'testnet');

// Settle a signed transaction (broadcasts via facilitator)
const result = await verifier.settle(signedTxHex, {
  recipient: 'ST1...',
  amount: '100000',
  asset: 'STX',
});

if (result.success) {
  console.log('Payment confirmed:', result.transaction);
}
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
  networkToCAIP2,
  caip2ToNetwork,
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

// CAIP-2 network conversion
networkToCAIP2('mainnet');  // "stacks:1"
networkToCAIP2('testnet');  // "stacks:2147483648"
caip2ToNetwork('stacks:1'); // "mainnet"
```

## Examples

### Example 1: Simple Automatic Payment

```typescript
// client.ts
import axios from 'axios';
import { wrapAxiosWithPayment, privateKeyToAccount, decodePaymentResponse } from 'x402-stacks';

const account = privateKeyToAccount(process.env.PRIVATE_KEY!, 'testnet');
const api = wrapAxiosWithPayment(axios.create({ baseURL: SERVER_URL }), account);

// Just make the request - payment is automatic!
const response = await api.get('/api/premium-data');
console.log('Data:', response.data);

// Check payment details
const paymentResponse = decodePaymentResponse(response.headers['payment-response']);
if (paymentResponse) {
  console.log('Paid with tx:', paymentResponse.transaction);
}
```

### Example 2: Server with Payment Middleware

```typescript
// server.ts
import express from 'express';
import { paymentMiddleware, getPayment, STXtoMicroSTX } from 'x402-stacks';

const app = express();

app.get('/api/premium-data',
  paymentMiddleware({
    amount: STXtoMicroSTX(0.1),
    address: process.env.SERVER_ADDRESS!,
    network: 'testnet',
    facilitatorUrl: 'https://x402-backend.example.com',
    description: 'Premium API data access',
  }),
  (req, res) => {
    const payment = getPayment(req);
    console.log('Payment received from:', payment?.payer);
    res.json({ data: 'Premium content', paidBy: payment?.payer });
  }
);

app.listen(3000);
```

### Example 3: Tiered Pricing

```typescript
// server.ts
import { paymentMiddleware, STXtoMicroSTX } from 'x402-stacks';

// Different prices for different tiers
const tierPrices = {
  basic: STXtoMicroSTX(0.01),
  standard: STXtoMicroSTX(0.05),
  premium: STXtoMicroSTX(0.10),
};

app.get('/api/market-data/:tier',
  (req, res, next) => {
    const tier = req.params.tier as keyof typeof tierPrices;
    const amount = tierPrices[tier] || tierPrices.basic;

    paymentMiddleware({
      amount,
      address: SERVER_ADDRESS,
      network: 'testnet',
      description: `${tier} market data access`,
    })(req, res, next);
  },
  (req, res) => {
    res.json({ marketData: getMarketData(req.params.tier) });
  }
);
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
import { paymentMiddleware, BTCtoSats, getDefaultSBTCContract } from 'x402-stacks';

app.get(
  '/api/bitcoin-data',
  paymentMiddleware({
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
import { wrapAxiosWithPayment, privateKeyToAccount } from 'x402-stacks';

const account = privateKeyToAccount(process.env.PRIVATE_KEY!, 'testnet');
const api = wrapAxiosWithPayment(axios.create(), account);

// Client automatically detects sBTC requirement and pays in sBTC
const data = await api.get('http://localhost:3003/api/bitcoin-data');
```

### sBTC Contracts

**Testnet**: `ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token`

**Mainnet**: To be configured when sBTC mainnet launches

## Facilitator API

The library uses a facilitator service to broadcast and confirm transactions.

### V2 Facilitator Endpoints (Recommended)

- `GET /supported` - Returns supported payment kinds and networks
- `POST /verify` - Verify a payment payload before settlement
- `POST /settle` - Broadcast signed transaction and wait for confirmation

### Legacy V1 Endpoints

- `POST /api/v1/settle` - Legacy settlement endpoint
- `POST /api/v1/verify` - Legacy verification endpoint

### Default Facilitator

**Default URL**: `https://x402-backend-7eby.onrender.com`

You can run your own facilitator or use a custom one:

```typescript
paymentMiddleware({
  // ...
  facilitatorUrl: 'https://your-facilitator.example.com',
})
```

### Supported Response

```json
{
  "kinds": [
    { "x402Version": 2, "scheme": "exact", "network": "stacks:1" },
    { "x402Version": 2, "scheme": "exact", "network": "stacks:2147483648" }
  ],
  "extensions": [],
  "signers": {}
}
```

## Migration from V1

If you're upgrading from an older version, here are the key changes:

### Import Changes

```typescript
// Old (V1)
import {
  withPaymentInterceptor,
  x402PaymentRequired,
  X402PaymentVerifier,
  decodeXPaymentResponse,
} from 'x402-stacks';

// New (V2 - default exports)
import {
  wrapAxiosWithPayment,      // was withPaymentInterceptor
  paymentMiddleware,          // was x402PaymentRequired
  X402PaymentVerifier,        // same name
  decodePaymentResponse,      // was decodeXPaymentResponse
} from 'x402-stacks';

// V1 functions still available with V1 suffix
import {
  wrapAxiosWithPaymentV1,
  paymentMiddlewareV1,
  X402PaymentVerifierV1,
} from 'x402-stacks';
```

### Header Changes

| V1 Header | V2 Header |
|-----------|-----------|
| `X-PAYMENT` | `payment-signature` |
| `X-PAYMENT-RESPONSE` | `payment-response` |
| `X-PAYMENT-REQUIRED` | `payment-required` |

### Network Format Changes

| V1 Format | V2 Format (CAIP-2) |
|-----------|-------------------|
| `mainnet` | `stacks:1` |
| `testnet` | `stacks:2147483648` |

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
- [Coinbase x402 Specification](https://github.com/coinbase/x402)
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

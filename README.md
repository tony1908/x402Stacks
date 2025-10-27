# x402-stacks

Una biblioteca TypeScript para implementar el protocolo de pago x402 en Stacks.

x402 hace posible los **pagos automáticos a nivel HTTP** para APIs, agentes de IA y servicios digitales usando tokens STX en Stacks. Paga solo lo que usas, justo cuando lo usas. Sin suscripciones, sin claves API, sin intermediarios.

## Características

- **HTTP 402 Payment Required** - Protocolo de pago nativo usando los códigos de estado HTTP que ya conoces
- **Pagos Automáticos** - El cliente paga solo y reintenta las peticiones
- **Verificación de Pagos** - Validación en el servidor de las transferencias STX
- **Middleware para Express.js** - Instala y listo, protege tus endpoints con pagos
- **Precios Flexibles** - Configura precios fijos, por niveles o dinámicos
- **Rate Limiting** - Plan gratuito con opción de pagar cuando te pasas del límite
- **TypeScript** - Todo tipado con IntelliSense incluido
- **Seguridad de Bitcoin** - Aprovecha el anclaje de Bitcoin de Stacks

## Instalación

```bash
npm install x402-stacks
```

## Empieza rápido

### Servidor (Express.js)

```typescript
import express from 'express';
import { x402PaymentRequired, STXtoMicroSTX } from 'x402-stacks';

const app = express();

app.get(
  '/api/premium-data',
  x402PaymentRequired({
    amount: STXtoMicroSTX(0.1), // 0.1 STX
    address: 'SP1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM', // Tu dirección de Stacks
    network: 'mainnet',
    acceptUnconfirmed: true,
  }),
  (req, res) => {
    res.json({ data: 'Este es contenido premium' });
  }
);

app.listen(3000);
```

### Cliente

```typescript
import { X402PaymentClient } from 'x402-stacks';

const client = new X402PaymentClient({
  network: 'mainnet',
  privateKey: 'tu-clave-privada-hex',
});

// Maneja automáticamente las respuestas 402 y hace los pagos
const data = await client.requestWithPayment('https://api.example.com/premium-data');
console.log(data);
```

## ¿Cómo funciona?

### El flujo de pago

```
1. El cliente pide acceso a la API → El servidor responde 402 con los datos del pago
2. El cliente arma la transferencia STX con esos datos
3. El cliente envía la transacción → recibe un ID de transacción
4. El cliente vuelve a intentar con el ID en el header
5. El servidor verifica la transacción en Stacks
6. El servidor valida: destinatario, monto, estado
7. Si todo está bien, acceso concedido
```

### La respuesta 402 Payment Required

Cuando un cliente pide un endpoint de pago sin haber pagado, el servidor responde con HTTP 402:

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

## Referencia de la API

### Cliente

#### `X402PaymentClient`

```typescript
const client = new X402PaymentClient({
  network: 'mainnet' | 'testnet',
  privateKey: string,
  timeout?: number,
});

// Hace la petición con pago automático
await client.requestWithPayment<T>(url, options?);

// Hace un pago manual
await client.makePayment(paymentRequest);

// Envía una transferencia STX
await client.sendSTXTransfer(details);
```

### Servidor

#### Middleware `x402PaymentRequired`

```typescript
x402PaymentRequired({
  amount: string | bigint,           // Monto en microSTX
  address: string,                   // Tu dirección de Stacks
  network: 'mainnet' | 'testnet',
  resource?: string,                 // Identificador personalizado del recurso
  expirationSeconds?: number,        // Por defecto: 300
  acceptUnconfirmed?: boolean,       // Por defecto: false
  paymentValidator?: (payment) => boolean,
})
```

#### Middleware Avanzado

**Precios por niveles**:
```typescript
tieredPayment(
  (req) => ({
    amount: req.query.premium ? STXtoMicroSTX(1.0) : STXtoMicroSTX(0.1),
    resource: req.path,
  }),
  { address, network }
)
```

**Rate limiting con pagos**:
```typescript
paymentRateLimit({
  freeRequests: 10,
  windowMs: 60 * 60 * 1000, // 1 hora
  paymentConfig: {
    amount: STXtoMicroSTX(0.01),
    address,
    network,
  },
})
```

**Pagos condicionales**:
```typescript
conditionalPayment(
  (req) => req.user?.isPremium !== true,
  { amount, address, network }
)
```

### Verificador de Pagos

```typescript
import { X402PaymentVerifier } from 'x402-stacks';

const verifier = new X402PaymentVerifier('mainnet');

// Verifica la transacción de pago
const verification = await verifier.verifyPayment(txId, {
  expectedRecipient: 'SP1...',
  minAmount: BigInt(100000),
  acceptUnconfirmed: true,
});

if (verification.isValid) {
  // Dale acceso
}

// Espera la confirmación
const tx = await verifier.waitForConfirmation(txId, maxAttempts, intervalMs);
```

### Utilidades

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

// Convierte montos
const microSTX = STXtoMicroSTX(1.5);        // 1500000n
const stx = microSTXtoSTX(1500000n);        // "1.500000"

// Genera una wallet
const wallet = generateKeypair('testnet');
// { privateKey, publicKey, address }

// Valida una dirección
isValidStacksAddress('SP1...');  // true

// Formatea para mostrar
formatPaymentAmount(100000n);    // "0.100000 STX"

// Obtén el link del explorador
getExplorerURL(txId, 'mainnet');
```

## Ejemplos

### Ejemplo 1: Una puerta de pago simple

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
    res.json({ data: 'Contenido premium' });
  }
);

// client.ts
const data = await client.requestWithPayment('https://api.example.com/data');
```

### Ejemplo 2: Precios según el uso

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

### Ejemplo 3: Validación personalizada

```typescript
app.post(
  '/api/upload',
  x402PaymentRequired({
    amount: STXtoMicroSTX(0.25),
    address: SERVER_ADDRESS,
    network: 'mainnet',
    acceptUnconfirmed: false, // Exige confirmación
    paymentValidator: async (payment) => {
      // Tu lógica de validación
      const isAllowed = await checkUserAllowlist(payment.sender);
      return isAllowed && payment.amount >= STXtoMicroSTX(0.25);
    },
  }),
  async (req, res) => {
    // Maneja la subida del archivo
  }
);
```

### Ejemplo 4: Control manual del pago

```typescript
// Control manual desde el cliente
try {
  const response = await fetch('https://api.example.com/data');

  if (response.status === 402) {
    const paymentRequest = await response.json();

    // Hace el pago
    const paymentResult = await client.makePayment(paymentRequest);

    // Vuelve a intentar con el comprobante
    const retryResponse = await fetch('https://api.example.com/data', {
      headers: {
        'X-Payment-TxId': paymentResult.txId,
      },
    });

    const data = await retryResponse.json();
  }
} catch (error) {
  console.error('Error en el pago:', error);
}
```

## Casos de uso

### Agentes de IA
Deja que los agentes de IA paguen de forma autónoma por:
- Datos en tiempo real ($0.01/consulta)
- Acceso a APIs ($0.05/petición)
- Cómputo ($0.50/minuto)
- Almacenamiento ($0.001/GB)

### Micropagos
Monta modelos de negocio donde pagas por lo que usas:
- Acceso a artículos ($0.10/artículo)
- Procesamiento de imágenes ($0.005/imagen)
- Llamadas a API ($0.02/llamada)
- Consultas de datos ($0.03/consulta)

### Precios dinámicos
Implementa precios flexibles:
- Por horario (pico/valle)
- Por uso (complejidad, tamaño)
- Por niveles (básico/premium)
- Con límite gratis + pago cuando te pasas

## Desarrollo

### Build

```bash
npm install
npm run build
```

### Corre los ejemplos

```bash
# Terminal 1: Arranca el servidor
npm run dev:server

# Terminal 2: Fondea tu wallet de prueba y corre el cliente
npm run dev:client
```

### Testing

Consigue fondos testnet en el [Faucet de Stacks](https://explorer.stacks.co/sandbox/faucet?chain=testnet).

## Configuración

### Elegir la red

```typescript
// Mainnet
const client = new X402PaymentClient({
  network: 'mainnet',
  privateKey: process.env.PRIVATE_KEY,
});

// Testnet (para desarrollo)
const client = new X402PaymentClient({
  network: 'testnet',
  privateKey: process.env.TESTNET_PRIVATE_KEY,
});
```

### Buenas prácticas de seguridad

1. **Nunca subas claves privadas a git** - Usa variables de entorno
2. **Exige confirmaciones para pagos grandes** - Pon `acceptUnconfirmed: false`
3. **Crea tus propios validadores** - Añade la lógica de tu negocio
4. **Usa tiempos de expiración razonables** - Evita ataques de replay
5. **HTTPS en producción siempre** - Protege los datos de pago en tránsito

## ¿Por qué Stacks?

- **Seguridad de Bitcoin** - Las transacciones se anclan a Bitcoin L1
- **Smart Contracts** - Lenguaje Clarity para lógica de pago avanzada
- **Confirmación rápida** - Bloques de ~10 minutos (vs 10+ min en Bitcoin)
- **Fees bajos** - Costo amigable para micropagos
- **Tokens nativos** - STX y tokens fungibles SIP-010

## Comparativa

| Característica | x402-stacks | Tarjetas de crédito | Suscripciones |
|----------------|-------------|---------------------|---------------|
| Fees | <$0.01 | $0.30 + 2.9% | Mensual/Anual |
| Confirmación | ~10 minutos | 1-3 días | Cobro mensual |
| Chargebacks | No | Sí (120 días) | Sí |
| Micropagos | Sí | No (mínimo ~$0.50) | No |
| Para IA | Sí | No | No |
| Global | Sí | Limitado | Limitado |

## Licencia

MIT

## Recursos

- [Especificación del protocolo x402](./x402.MD)
- [Stacks Blockchain](https://www.stacks.co/)
- [Docs de Stacks.js](https://docs.hiro.so/stacks.js)
- [Explorador de Stacks](https://explorer.stacks.co/)
- [Faucet Testnet](https://explorer.stacks.co/sandbox/faucet?chain=testnet)

## Contribuye

¡Las contribuciones son bienvenidas! Abre un issue o manda un pull request.

## Soporte

Si tienes dudas o necesitas ayuda:
- Abre un issue en GitHub
- Revisa los [ejemplos](./examples)
- Lee la [especificación x402](./x402.MD)

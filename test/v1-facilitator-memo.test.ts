import type { AxiosInstance } from 'axios';
import { paymentMiddlewareV1, wrapAxiosWithPaymentV1, X402PaymentClient } from '../src';

const mockMakeSTXTokenTransfer = jest.fn();

jest.mock('@stacks/transactions', () => ({
  makeSTXTokenTransfer: (opts: any) => mockMakeSTXTokenTransfer(opts),
  makeContractCall: jest.fn(),
  broadcastTransaction: jest.fn(),
  AnchorMode: { Any: 3 },
  PostConditionMode: { Allow: 1 },
  TxBroadcastResult: {},
  uintCV: (value: string) => value,
  principalCV: (value: string) => value,
  someCV: (value: any) => ({ type: 'some', value }),
  noneCV: () => ({ type: 'none' }),
  bufferCVFromString: (value: string) => value,
  getAddressFromPrivateKey: () => 'ST2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7',
  TransactionVersion: { Mainnet: 0, Testnet: 1 },
}));

jest.mock('@stacks/network', () => ({
  StacksMainnet: class { url = 'https://stacks-node-api.mainnet.stacks.co'; },
  StacksTestnet: class { url = 'https://stacks-node-api.testnet.stacks.co'; },
}));

function createV1AxiosHarness() {
  let rejected!: (error: any) => Promise<any>;

  const instance = {
    interceptors: {
      response: {
        use: (_fulfilled: unknown, onRejected: typeof rejected) => {
          rejected = onRejected;
          return 0;
        },
      },
    },
    request: jest.fn().mockResolvedValue({ status: 200, data: { ok: true } }),
  } as unknown as AxiosInstance & { request: jest.Mock };

  wrapAxiosWithPaymentV1(instance, {
    address: 'ST2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7',
    privateKey: '1'.repeat(64),
    network: 'testnet',
  });

  return { rejected };
}

describe('legacy V1 memo flow', () => {
  beforeEach(() => {
    mockMakeSTXTokenTransfer.mockResolvedValue({ serialize: () => Uint8Array.from([0xaa, 0xbb]) });
  });

  it('returns a 32-character hex nonce in V1 402 responses', async () => {
    const middleware = paymentMiddlewareV1({
      amount: 1000n,
      address: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
      network: 'testnet',
    });

    const req = { headers: {}, query: {}, body: {}, path: '/premium', method: 'GET' } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), setHeader: jest.fn() } as any;

    await middleware(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      nonce: expect.stringMatching(/^[0-9a-f]{32}$/),
    }));
  });

  it('keeps the V1 axios-interceptor memo as the raw nonce', async () => {
    const { rejected } = createV1AxiosHarness();

    await rejected({
      config: { headers: {} },
      response: {
        status: 402,
        data: {
          maxAmountRequired: '1000',
          resource: '/premium',
          payTo: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
          network: 'testnet',
          nonce: '0123456789abcdef0123456789abcdef',
          expiresAt: new Date(Date.now() + 300000).toISOString(),
        },
      },
    });

    expect(mockMakeSTXTokenTransfer).toHaveBeenCalledWith(expect.objectContaining({
      memo: '0123456789abcdef0123456789abcdef',
    }));
  });

  it('truncates long V1 client nonces without adding an x402 prefix', async () => {
    const client = new X402PaymentClient({
      privateKey: '1'.repeat(64),
      network: 'testnet',
    });

    const longNonce = '0123456789abcdef0123456789abcdefzz';

    await client.signPayment({
      maxAmountRequired: '1000',
      resource: '/premium',
      payTo: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
      network: 'testnet',
      nonce: longNonce,
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    });

    expect(mockMakeSTXTokenTransfer).toHaveBeenCalledWith(expect.objectContaining({
      memo: longNonce.substring(0, 34),
    }));
  });
});

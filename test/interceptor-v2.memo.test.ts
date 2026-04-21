jest.mock('@stacks/network', () => ({
  StacksMainnet: class { url = 'https://stacks-node-api.mainnet.stacks.co'; },
  StacksTestnet: class { url = 'https://stacks-node-api.testnet.stacks.co'; },
}));

import type { AxiosInstance } from 'axios';
import { wrapAxiosWithPayment, X402_HEADERS } from '../src';

const mockMakeSTXTokenTransfer = jest.fn();
const mockMakeContractCall = jest.fn();
const mockBufferCVFromString = jest.fn((value: string) => value);
const mockSomeCV = jest.fn((value: unknown) => ({ type: 'some', value }));

jest.mock('@stacks/transactions', () => ({
  makeSTXTokenTransfer: (opts: any) => mockMakeSTXTokenTransfer(opts),
  makeContractCall: (opts: any) => mockMakeContractCall(opts),
  AnchorMode: { Any: 3 },
  PostConditionMode: { Allow: 1 },
  uintCV: (value: string) => value,
  principalCV: (value: string) => value,
  someCV: (value: any) => mockSomeCV(value),
  noneCV: () => ({ type: 'none' }),
  bufferCVFromString: (value: string) => mockBufferCVFromString(value),
  getAddressFromPrivateKey: () => 'ST2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7',
  TransactionVersion: { Mainnet: 0, Testnet: 1 },
}));

function createAxiosHarness() {
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

  wrapAxiosWithPayment(instance, {
    address: 'ST2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7',
    privateKey: '1'.repeat(64),
    network: 'testnet',
  });

  return { instance, rejected };
}

describe('wrapAxiosWithPayment facilitator memo', () => {
  beforeEach(() => {
    mockMakeSTXTokenTransfer.mockResolvedValue({ serialize: () => Uint8Array.from([0xde, 0xad]) });
    mockMakeContractCall.mockResolvedValue({ serialize: () => Uint8Array.from([0xca, 0xfe]) });
  });

  it('signs STX retries with an x402-prefixed memo', async () => {
    const { rejected } = createAxiosHarness();

    const paymentRequired = {
      x402Version: 2,
      resource: { url: 'https://api.example.com/premium' },
      accepts: [{
        scheme: 'exact',
        network: 'stacks:2147483648',
        amount: '1000',
        asset: 'STX',
        payTo: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        maxTimeoutSeconds: 300,
      }],
    };

    await rejected({
      config: { headers: {} },
      response: {
        status: 402,
        headers: {
          [X402_HEADERS.PAYMENT_REQUIRED]: Buffer.from(JSON.stringify(paymentRequired)).toString('base64'),
        },
        data: null,
      },
    });

    expect(mockMakeSTXTokenTransfer).toHaveBeenCalledWith(expect.objectContaining({
      memo: expect.stringMatching(/^x402:[A-Za-z0-9_-]{24}$/),
    }));
  });

  it('passes the same memo pattern into SIP-010 contract calls', async () => {
    const { rejected } = createAxiosHarness();

    const paymentRequired = {
      x402Version: 2,
      resource: { url: 'https://api.example.com/premium' },
      accepts: [{
        scheme: 'exact',
        network: 'stacks:2147483648',
        amount: '1000',
        asset: 'SBTC',
        payTo: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        maxTimeoutSeconds: 300,
      }],
    };

    await rejected({
      config: { headers: {} },
      response: {
        status: 402,
        headers: {
          [X402_HEADERS.PAYMENT_REQUIRED]: Buffer.from(JSON.stringify(paymentRequired)).toString('base64'),
        },
        data: null,
      },
    });

    expect(mockBufferCVFromString).toHaveBeenCalledWith(expect.stringMatching(/^x402:[A-Za-z0-9_-]{24}$/));
    expect(mockSomeCV).toHaveBeenCalled();
  });
});

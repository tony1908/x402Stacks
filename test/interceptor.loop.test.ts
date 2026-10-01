jest.mock('@stacks/network', () => ({
  StacksMainnet: class {},
  StacksTestnet: class {},
}));

import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { wrapAxiosWithPaymentV1 } from '../src/interceptor';

const mockMakeSTXTokenTransfer = jest.fn();

jest.mock('@stacks/transactions', () => ({
  makeSTXTokenTransfer: (...args: unknown[]) => mockMakeSTXTokenTransfer(...args),
  makeContractCall: jest.fn(),
  AnchorMode: { Any: 3 },
  PostConditionMode: { Allow: 1 },
  uintCV: (value: string) => value,
  principalCV: (value: string) => value,
  someCV: (value: unknown) => value,
  noneCV: () => null,
  bufferCVFromString: (value: string) => value,
  getAddressFromPrivateKey: () => 'ST2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7',
  TransactionVersion: { Mainnet: 0, Testnet: 1 },
}));

describe('V1 payment retry loop guard', () => {
  beforeEach(() => {
    mockMakeSTXTokenTransfer.mockResolvedValue({ serialize: () => Uint8Array.from([1, 2, 3]) });
  });

  it('signs only once and surfaces the server reason when the paid retry gets another 402', async () => {
    let calls = 0;
    const paymentRequired = {
      maxAmountRequired: '1000',
      resource: 'https://api.example.com/premium',
      payTo: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
      network: 'testnet',
      nonce: 'nonce-123',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const instance = axios.create({
      adapter: async (config) => {
        calls += 1;
        if (calls > 10) throw new Error('adapter call cap exceeded');
        const response: AxiosResponse = {
          data: calls === 1 ? paymentRequired : { ...paymentRequired, error: 'transaction_failed' },
          status: 402,
          statusText: 'Payment Required',
          headers: {},
          config: config as InternalAxiosRequestConfig,
        };
        throw new AxiosError('Request failed with status code 402', AxiosError.ERR_BAD_REQUEST, config, undefined, response);
      },
    });
    wrapAxiosWithPaymentV1(instance, {
      address: 'ST2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7',
      privateKey: '1'.repeat(64),
      network: 'testnet',
    });

    await expect(instance.get('/premium')).rejects.toMatchObject({
      message: expect.stringContaining('transaction_failed'),
      response: expect.objectContaining({
        status: 402,
        data: expect.objectContaining({ error: 'transaction_failed' }),
      }),
    });
    expect(calls).toBe(2);
    expect(mockMakeSTXTokenTransfer).toHaveBeenCalledTimes(1);
  });
});

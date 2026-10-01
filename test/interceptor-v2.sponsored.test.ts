jest.mock('@stacks/network', () => ({
  StacksMainnet: class {},
  StacksTestnet: class {},
}));

import type { AxiosInstance } from 'axios';
import { wrapAxiosWithPayment, X402_HEADERS } from '../src';

const mockMakeSTXTokenTransfer = jest.fn();
const mockMakeContractCall = jest.fn();
const mockFtPostCondition = jest.fn((...args: unknown[]) => ({ ft: args }));
const mockAssetInfo = jest.fn((...args: unknown[]) => ({ asset: args }));

jest.mock('@stacks/transactions', () => ({
  makeSTXTokenTransfer: (opts: any) => mockMakeSTXTokenTransfer(opts),
  makeContractCall: (opts: any) => mockMakeContractCall(opts),
  makeStandardFungiblePostCondition: (...a: unknown[]) => mockFtPostCondition(...a),
  createAssetInfo: (...a: unknown[]) => mockAssetInfo(...a),
  FungibleConditionCode: { Equal: 1 },
  AnchorMode: { Any: 3 },
  PostConditionMode: { Allow: 1, Deny: 2 },
  uintCV: (v: string) => v,
  principalCV: (v: string) => v,
  someCV: (v: unknown) => v,
  noneCV: () => null,
  bufferCVFromString: (v: string) => v,
  getAddressFromPrivateKey: () => 'ST2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7',
  TransactionVersion: { Mainnet: 0, Testnet: 1 },
}));

const PAYER = 'ST2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7';
const FEE_PAYER = 'ST3Q4FQGJDBGQJRDV0FDQGT8A1V4HXTJYH8JJJJDS';

async function pay(accept: Record<string, unknown>) {
  let rejected!: (error: any) => Promise<any>;
  const instance = {
    interceptors: { response: { use: (_: unknown, r: typeof rejected) => ((rejected = r), 0) } },
    request: jest.fn().mockResolvedValue({ status: 200 }),
  } as unknown as AxiosInstance;
  wrapAxiosWithPayment(instance, { address: PAYER, privateKey: '1'.repeat(64), network: 'testnet' });
  const paymentRequired = {
    x402Version: 2,
    resource: { url: 'https://api.example.com/premium' },
    accepts: [{ scheme: 'exact', network: 'stacks:2147483648', amount: '1000', payTo: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM', maxTimeoutSeconds: 60, ...accept }],
  };
  await rejected({
    config: { headers: {} },
    response: {
      status: 402,
      headers: { [X402_HEADERS.PAYMENT_REQUIRED]: Buffer.from(JSON.stringify(paymentRequired)).toString('base64') },
      data: null,
    },
  });
}

describe('sponsored payments', () => {
  beforeEach(() => {
    mockMakeSTXTokenTransfer.mockResolvedValue({ serialize: () => Uint8Array.from([1]) });
    mockMakeContractCall.mockResolvedValue({ serialize: () => Uint8Array.from([2]) });
  });

  it('signs a sponsored zero-fee STX transfer when extra.feePayer is present', async () => {
    await pay({ asset: 'STX', extra: { feePayer: FEE_PAYER } });
    expect(mockMakeSTXTokenTransfer).toHaveBeenCalledWith(expect.objectContaining({ sponsored: true, fee: 0n }));
  });

  it('signs a sponsored sBTC transfer in Deny mode with an exact post-condition', async () => {
    await pay({ asset: 'SBTC', extra: { feePayer: FEE_PAYER } });
    expect(mockMakeContractCall).toHaveBeenCalledWith(
      expect.objectContaining({ sponsored: true, fee: 0n, postConditionMode: 2, postConditions: [expect.anything()] }),
    );
    expect(mockAssetInfo).toHaveBeenCalledWith('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM', 'sbtc-token', 'sbtc-token');
    expect(mockFtPostCondition).toHaveBeenCalledWith(PAYER, 1, 1000n, expect.anything());
  });

  it('keeps standard signing without a feePayer', async () => {
    await pay({ asset: 'STX' });
    expect(mockMakeSTXTokenTransfer.mock.calls[0][0].sponsored).toBeUndefined();
  });
});

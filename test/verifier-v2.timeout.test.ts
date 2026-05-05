const mockAxiosCreate = jest.fn((_config: unknown) => ({
  post: jest.fn(),
  get: jest.fn(),
}));

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: (config: unknown) => mockAxiosCreate(config),
    isAxiosError: jest.fn(() => false),
  },
  isAxiosError: jest.fn(() => false),
}));

import { X402PaymentVerifier } from '../src/verifier-v2';

describe('X402PaymentVerifier V2 timeout', () => {
  beforeEach(() => {
    mockAxiosCreate.mockClear();
  });

  it('waits up to 50 seconds for facilitator responses', () => {
    new X402PaymentVerifier('https://facilitator.example.com');

    expect(mockAxiosCreate).toHaveBeenCalledWith(expect.objectContaining({
      timeout: 50000,
    }));
  });
});

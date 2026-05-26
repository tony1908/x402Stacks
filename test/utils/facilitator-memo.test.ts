import {
  createFacilitatorMemo,
  createFacilitatorNonce,
  isFacilitatorMemo,
  parsePaymentMemo,
} from '../../src/utils';

describe('facilitator memo helpers', () => {
  it('creates a 24-character base64url nonce', () => {
    const nonce = createFacilitatorNonce(() => Buffer.alloc(18, 1));

    expect(nonce).toHaveLength(24);
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{24}$/);
  });

  it('creates an x402 memo that fits the Stacks memo limit', () => {
    const memo = createFacilitatorMemo('Ab3Kx9mPqR2sT5vW8yZ1aB3K');

    expect(memo).toBe('x402:Ab3Kx9mPqR2sT5vW8yZ1aB3K');
    expect(Buffer.byteLength(memo, 'utf8')).toBeLessThanOrEqual(34);
  });

  it('normalizes legacy nonces into the facilitator memo format', () => {
    const legacyNonce = '0123456789abcdef0123456789abcdef';
    const memo = createFacilitatorMemo(legacyNonce);

    expect(memo).toMatch(/^x402:[A-Za-z0-9_-]{24}$/);
    expect(createFacilitatorMemo(legacyNonce)).toBe(memo);
  });

  it('parses the facilitator nonce from the compact memo format', () => {
    expect(parsePaymentMemo('x402:Ab3Kx9mPqR2sT5vW8yZ1aB3K')).toEqual({
      nonce: 'Ab3Kx9mPqR2sT5vW8yZ1aB3K',
    });
  });

  it('rejects malformed compact facilitator memos', () => {
    expect(parsePaymentMemo('x402:not-a-valid-nonce')).toEqual({});
  });

  it('preserves parsing for legacy createPaymentMemo output', () => {
    expect(parsePaymentMemo('x402:/premium,nonce=Ab3Kx9mPqR2sT5vW8yZ1aB3K')).toEqual({
      resource: '/premium',
      nonce: 'Ab3Kx9mPqR2sT5vW8yZ1aB3K',
    });
  });

  it('recognizes facilitator memos by prefix', () => {
    expect(isFacilitatorMemo('x402:Ab3Kx9mPqR2sT5vW8yZ1aB3K')).toBe(true);
    expect(isFacilitatorMemo('x402:/premium,nonce=Ab3Kx9mPqR2sT5vW8yZ1aB3K')).toBe(false);
    expect(isFacilitatorMemo('nonce=abc123')).toBe(false);
  });
});

import { getDefaultSBTCContract } from '../../src/utils';

it('uses the live testnet sBTC contract', () => {
  expect(getDefaultSBTCContract('testnet')).toEqual({
    address: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
    name: 'sbtc-token',
  });
});

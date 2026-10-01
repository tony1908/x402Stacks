# Changelog

All notable changes to this project are documented here.

## [2.1.0] - 2026-10-01

### Added

- Sponsored payments: when V2 payment requirements include `extra.feePayer`, the client signs a sponsored transaction with zero origin fee. Sponsored SIP-010 transfers use Deny mode and an exact post-condition. Sponsored SIP-010 support is limited to sBTC and USDCx.

### Fixed

- **SECURITY (critical):** `wrapAxiosWithPayment` (V2) and the V1 interceptor could re-sign and pay again indefinitely if a paid retry received another 402. Axios clones request configs, so the `WeakSet` guard did not match the retried config. This was observed on mainnet as a double charge. The interceptors now detect the payment header on the request and reject with the server's error reason.
- Replaced the nonexistent testnet sBTC contract `ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT` with `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sbtc-token`.

## Earlier versions

See git history.

/**
 * x402-stacks - Express Middleware (Coinbase Compatible)
 * Middleware for handling x402 payment requirements in Express.js applications
 */

import { Request, Response, NextFunction } from 'express';
import { X402PaymentVerifier } from './verifier-v2';
import {
  NetworkV2,
  PaymentRequirementsV2,
  PaymentRequiredV2,
  PaymentPayloadV2,
  SettlementResponseV2,
  ResourceInfo,
  X402_HEADERS,
  X402_ERROR_CODES,
} from './types-v2';
import { networkToCAIP2, assetToV2 } from './utils';
import { NetworkType, TokenType, TokenContract, VerifiedPayment } from './types';

/**
 * Configuration for x402 payment middleware
 */
export interface PaymentMiddlewareConfig {
  /** Payment scheme (default: "exact") */
  scheme?: string;

  /** Network in CAIP-2 format or V1 format (will be converted) */
  network: NetworkV2 | NetworkType;

  /** Required payment amount in atomic units (microSTX, satoshis, etc.) */
  amount: string | bigint;

  /** Asset identifier ("STX", "SBTC", "USDCX", or contract identifier) */
  asset?: string;

  /** Token type for V1 compatibility (converted to asset) */
  tokenType?: TokenType;

  /** Token contract for V1 compatibility */
  tokenContract?: TokenContract;

  /** Recipient address */
  payTo: string;

  /** Maximum time allowed for payment completion (default: 300) */
  maxTimeoutSeconds?: number;

  /** Facilitator API URL */
  facilitatorUrl?: string;

  /** Resource description */
  description?: string;

  /** Resource MIME type */
  mimeType?: string;

  /** Custom payment validator */
  paymentValidator?: (payment: SettlementResponseV2) => boolean | Promise<boolean>;

  /** Additional scheme-specific data */
  extra?: Record<string, unknown>;
}

/**
 * Express middleware for x402 payment requirements
 * Compatible with Coinbase x402 protocol
 */
export function paymentMiddleware(config: PaymentMiddlewareConfig) {
  const facilitatorUrl = config.facilitatorUrl || 'http://localhost:8085';
  const verifier = new X402PaymentVerifier(facilitatorUrl);

  // Normalize network to CAIP-2 format
  const network: NetworkV2 = config.network.includes(':')
    ? (config.network as NetworkV2)
    : networkToCAIP2(config.network as NetworkType);

  // Normalize asset
  const asset = config.asset || assetToV2(config.tokenType || 'STX', config.tokenContract);

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check for payment in payment-signature header (V2 format, base64 encoded)
      const paymentSignatureHeader = req.headers[X402_HEADERS.PAYMENT_SIGNATURE] as string;

      // If no payment provided, return 402 Payment Required
      if (!paymentSignatureHeader) {
        return sendPaymentRequired(req, res, config, network, asset);
      }

      // Decode the payment payload from base64
      let paymentPayload: PaymentPayloadV2;
      try {
        const decoded = Buffer.from(paymentSignatureHeader, 'base64').toString('utf-8');
        paymentPayload = JSON.parse(decoded);
      } catch (e) {
        return res.status(400).json({
          error: X402_ERROR_CODES.INVALID_PAYLOAD,
          message: 'Invalid payment-signature header: failed to decode',
        });
      }

      // Validate x402 version
      if (paymentPayload.x402Version !== 2) {
        return res.status(400).json({
          error: X402_ERROR_CODES.INVALID_X402_VERSION,
          message: 'Only x402 v2 is supported',
        });
      }

      // Build payment requirements
      const paymentRequirements: PaymentRequirementsV2 = {
        scheme: config.scheme || 'exact',
        network,
        amount: config.amount.toString(),
        asset,
        payTo: config.payTo,
        maxTimeoutSeconds: config.maxTimeoutSeconds || 300,
        extra: config.extra,
      };

      // Settle the payment via facilitator
      const settlementResult = await verifier.settle(paymentPayload, { paymentRequirements });

      // Check if settlement was successful
      if (!settlementResult.success) {
        // Return 402 with error info
        const paymentRequired = createPaymentRequiredResponse(req, config, network, asset);

        // Encode payment required response for header
        const paymentRequiredHeader = Buffer.from(JSON.stringify(paymentRequired)).toString('base64');
        res.setHeader(X402_HEADERS.PAYMENT_REQUIRED, paymentRequiredHeader);

        return res.status(402).json({
          error: settlementResult.errorReason || X402_ERROR_CODES.UNEXPECTED_SETTLE_ERROR,
          payer: settlementResult.payer,
          transaction: settlementResult.transaction,
        });
      }

      // Custom validator if provided
      if (config.paymentValidator) {
        const customValid = await config.paymentValidator(settlementResult);
        if (!customValid) {
          return res.status(402).json({
            error: 'custom_validation_failed',
            message: 'Custom validation rejected the payment',
          });
        }
      }

      // Payment is valid, attach payment info to request
      (req as any).payment = settlementResult;
      (req as any).paymentV2 = settlementResult;

      // Add payment-response header with settlement info (base64 encoded)
      const paymentResponse = {
        success: settlementResult.success,
        payer: settlementResult.payer,
        transaction: settlementResult.transaction,
        network: settlementResult.network,
      };
      res.setHeader(
        X402_HEADERS.PAYMENT_RESPONSE,
        Buffer.from(JSON.stringify(paymentResponse)).toString('base64')
      );

      next();
    } catch (error) {
      console.error('x402 v2 middleware error:', error);
      return res.status(500).json({
        error: X402_ERROR_CODES.UNEXPECTED_SETTLE_ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

/**
 * Create payment required response object
 */
function createPaymentRequiredResponse(
  req: Request,
  config: PaymentMiddlewareConfig,
  network: NetworkV2,
  asset: string
): PaymentRequiredV2 {
  const resource: ResourceInfo = {
    url: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
    description: config.description,
    mimeType: config.mimeType,
  };

  const paymentRequirements: PaymentRequirementsV2 = {
    scheme: config.scheme || 'exact',
    network,
    amount: config.amount.toString(),
    asset,
    payTo: config.payTo,
    maxTimeoutSeconds: config.maxTimeoutSeconds || 300,
    extra: config.extra,
  };

  return {
    x402Version: 2,
    resource,
    accepts: [paymentRequirements],
  };
}

/**
 * Send 402 Payment Required response
 */
function sendPaymentRequired(
  req: Request,
  res: Response,
  config: PaymentMiddlewareConfig,
  network: NetworkV2,
  asset: string
): void {
  const paymentRequired = createPaymentRequiredResponse(req, config, network, asset);

  // Set payment-required header (base64 encoded)
  const paymentRequiredHeader = Buffer.from(JSON.stringify(paymentRequired)).toString('base64');
  res.setHeader(X402_HEADERS.PAYMENT_REQUIRED, paymentRequiredHeader);

  // Return JSON body as well for easier client consumption
  res.status(402).json(paymentRequired);
}

/**
 * Utility to get payment info from request
 */
export function getPayment(req: Request): SettlementResponseV2 | undefined {
  return (req as any).payment || (req as any).paymentV2;
}

/**
 * Create a simple payment gate that requires payment before proceeding
 */
export function createPaymentGate(config: PaymentMiddlewareConfig) {
  return paymentMiddleware(config);
}

/**
 * Conditional payment middleware - only require payment if condition is met
 */
export function conditionalPayment(
  condition: (req: Request) => boolean | Promise<boolean>,
  config: PaymentMiddlewareConfig
) {
  const middleware = paymentMiddleware(config);

  return async (req: Request, res: Response, next: NextFunction) => {
    const shouldRequirePayment = await condition(req);

    if (shouldRequirePayment) {
      return middleware(req, res, next);
    }

    next();
  };
}

/**
 * Tiered payment middleware - different amounts based on request
 */
export function tieredPayment(
  getTier: (req: Request) => { amount: string | bigint; description?: string } | Promise<{ amount: string | bigint; description?: string }>,
  baseConfig: Omit<PaymentMiddlewareConfig, 'amount' | 'description'>
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const tier = await getTier(req);

    const config: PaymentMiddlewareConfig = {
      ...baseConfig,
      amount: tier.amount,
      description: tier.description,
    };

    const middleware = paymentMiddleware(config);
    return middleware(req, res, next);
  };
}

/**
 * Rate limiting with payment - require payment after free tier
 */
export function paymentRateLimit(config: {
  freeRequests: number;
  windowMs: number;
  paymentConfig: PaymentMiddlewareConfig;
  keyGenerator?: (req: Request) => string;
}) {
  const requestCounts = new Map<string, { count: number; resetAt: number }>();
  const middleware = paymentMiddleware(config.paymentConfig);

  return async (req: Request, res: Response, next: NextFunction) => {
    const key = config.keyGenerator ? config.keyGenerator(req) : req.ip || 'unknown';
    const now = Date.now();

    let record = requestCounts.get(key);

    // Reset if window expired
    if (record && record.resetAt < now) {
      record = undefined;
    }

    // Initialize record if needed
    if (!record) {
      record = {
        count: 0,
        resetAt: now + config.windowMs,
      };
      requestCounts.set(key, record);
    }

    // Check if over free tier
    if (record.count >= config.freeRequests) {
      return middleware(req, res, next);
    }

    // Increment count and continue
    record.count++;
    next();
  };
}

/**
 * Parse payment-required header from a 402 response
 */
export function parsePaymentRequiredHeader(header: string): PaymentRequiredV2 | null {
  try {
    const decoded = Buffer.from(header, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Parse payment-response header from a successful response
 */
export function parsePaymentResponseHeader(header: string): SettlementResponseV2 | null {
  try {
    const decoded = Buffer.from(header, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

// ===== Backward Compatibility Aliases =====
/** @deprecated Use PaymentMiddlewareConfig instead */
export type X402MiddlewareConfigV2 = PaymentMiddlewareConfig;
/** @deprecated Use paymentMiddleware instead */
export const x402PaymentRequiredV2 = paymentMiddleware;
/** @deprecated Use getPayment instead */
export const getPaymentV2 = getPayment;
/** @deprecated Use createPaymentGate instead */
export const createPaymentGateV2 = createPaymentGate;
/** @deprecated Use conditionalPayment instead */
export const conditionalPaymentV2 = conditionalPayment;
/** @deprecated Use tieredPayment instead */
export const tieredPaymentV2 = tieredPayment;
/** @deprecated Use paymentRateLimit instead */
export const paymentRateLimitV2 = paymentRateLimit;

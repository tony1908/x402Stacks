/**
 * x402-stacks - Express Middleware
 * Middleware for handling x402 payment requirements in Express.js applications
 */

import { Request, Response, NextFunction } from 'express';
import { X402PaymentVerifier } from './verifier';
import {
  X402MiddlewareConfig,
  X402PaymentRequired,
  VerificationOptions,
} from './types';
import { randomBytes } from 'crypto';

/**
 * Express middleware for x402 payment requirements
 */
export function x402PaymentRequired(config: X402MiddlewareConfig) {
  const verifier = new X402PaymentVerifier(config.network);

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check for payment transaction ID in headers or query
      const paymentTxId =
        req.headers['x-payment-txid'] as string ||
        req.query.paymentTxId as string ||
        req.body?.paymentTxId;

      // If no payment provided, return 402 Payment Required
      if (!paymentTxId) {
        return sendPaymentRequired(req, res, config);
      }

      // Verify the payment
      const verificationOptions: VerificationOptions = {
        expectedRecipient: config.address,
        minAmount: BigInt(config.amount),
        acceptUnconfirmed: config.acceptUnconfirmed || false,
      };

      const verification = await verifier.verifyPayment(
        paymentTxId,
        verificationOptions
      );

      // Check if payment is valid
      if (!verification.isValid) {
        return res.status(402).json({
          error: 'Invalid payment',
          details: verification.validationError,
          paymentStatus: verification.status,
        });
      }

      // Check payment status
      if (verification.status === 'pending' && !config.acceptUnconfirmed) {
        return res.status(402).json({
          error: 'Payment not yet confirmed',
          details: 'Please wait for transaction confirmation',
          paymentStatus: 'pending',
        });
      }

      if (verification.status === 'failed') {
        return res.status(402).json({
          error: 'Payment failed',
          details: 'Transaction failed on blockchain',
          paymentStatus: 'failed',
        });
      }

      // Custom validator if provided
      if (config.paymentValidator) {
        const customValid = await config.paymentValidator(verification);
        if (!customValid) {
          return res.status(402).json({
            error: 'Payment validation failed',
            details: 'Custom validation rejected the payment',
          });
        }
      }

      // Payment is valid, attach payment info to request and continue
      (req as any).payment = verification;
      next();
    } catch (error) {
      console.error('x402 middleware error:', error);
      return res.status(500).json({
        error: 'Payment verification error',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

/**
 * Send 402 Payment Required response
 */
function sendPaymentRequired(
  req: Request,
  res: Response,
  config: X402MiddlewareConfig
): void {
  const expirationSeconds = config.expirationSeconds || 300; // 5 minutes default
  const expiresAt = new Date(Date.now() + expirationSeconds * 1000).toISOString();

  const nonce = config.nonceGenerator
    ? config.nonceGenerator()
    : randomBytes(16).toString('hex');

  const resource = config.resource || req.path;

  const paymentRequest: X402PaymentRequired = {
    maxAmountRequired: config.amount.toString(),
    resource,
    payTo: config.address,
    network: config.network,
    nonce,
    expiresAt,
  };

  res.status(402).json(paymentRequest);
}

/**
 * Utility middleware to extract payment info from request
 */
export function getPayment(req: Request) {
  return (req as any).payment;
}

/**
 * Create a simple payment gate that requires payment before proceeding
 */
export function createPaymentGate(config: X402MiddlewareConfig) {
  return x402PaymentRequired(config);
}

/**
 * Conditional payment middleware - only require payment if condition is met
 */
export function conditionalPayment(
  condition: (req: Request) => boolean | Promise<boolean>,
  config: X402MiddlewareConfig
) {
  const paymentMiddleware = x402PaymentRequired(config);

  return async (req: Request, res: Response, next: NextFunction) => {
    const shouldRequirePayment = await condition(req);

    if (shouldRequirePayment) {
      return paymentMiddleware(req, res, next);
    }

    next();
  };
}

/**
 * Tiered payment middleware - different amounts based on request
 */
export function tieredPayment(
  getTier: (req: Request) => { amount: string | bigint; resource?: string } | Promise<{ amount: string | bigint; resource?: string }>,
  baseConfig: Omit<X402MiddlewareConfig, 'amount' | 'resource'>
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const tier = await getTier(req);

    const config: X402MiddlewareConfig = {
      ...baseConfig,
      amount: tier.amount,
      resource: tier.resource,
    };

    const middleware = x402PaymentRequired(config);
    return middleware(req, res, next);
  };
}

/**
 * Rate limiting with payment - require payment after free tier
 */
export function paymentRateLimit(config: {
  freeRequests: number;
  windowMs: number;
  paymentConfig: X402MiddlewareConfig;
  keyGenerator?: (req: Request) => string;
}) {
  const requestCounts = new Map<string, { count: number; resetAt: number }>();

  const paymentMiddleware = x402PaymentRequired(config.paymentConfig);

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
      return paymentMiddleware(req, res, next);
    }

    // Increment count and continue
    record.count++;
    next();
  };
}

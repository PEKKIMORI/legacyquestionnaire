import type { NextApiRequest, NextApiResponse } from 'next';
import { securityHeaders, rateLimiter } from '../utils/security';
import { securityConfig } from '../utils/config';

export interface SecureApiRequest extends NextApiRequest {
  clientIP: string;
  isRateLimited: boolean;
}

// Security middleware for API routes
export function withSecurity(
  handler: (req: SecureApiRequest, res: NextApiResponse) => Promise<void> | void,
  options: {
    methods?: string[];
    rateLimit?: { maxAttempts: number; windowMs: number };
    requireAuth?: boolean;
  } = {}
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const secureReq = req as SecureApiRequest;
    
    try {
      // Set security headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
      
      // CORS headers
      const origin = req.headers.origin;
      if (origin && securityConfig.allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      }
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      
      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        return res.status(200).end();
      }
        // Method validation
      if (options.methods && !options.methods.includes(req.method ?? '')) {
        return res.status(405).json({ error: 'Method not allowed' });
      }
      
      // Get client IP
      secureReq.clientIP = securityHeaders.getClientIP(req);
      
      // Rate limiting
      const rateLimit = options.rateLimit ?? securityConfig.rateLimits.api;
      const rateLimitKey = `api-${secureReq.clientIP}-${req.url}`;
      
      if (rateLimiter.isRateLimited(rateLimitKey, rateLimit.maxAttempts, rateLimit.windowMs)) {
        secureReq.isRateLimited = true;
        return res.status(429).json({ 
          error: 'Too many requests', 
          retryAfter: Math.ceil(rateLimit.windowMs / 1000) 
        });
      }
      
      secureReq.isRateLimited = false;
        // Content-Type validation for POST/PUT requests
      if (['POST', 'PUT', 'PATCH'].includes(req.method ?? '')) {
        const contentType = req.headers['content-type'];
        if (!contentType || !contentType.includes('application/json')) {
          return res.status(400).json({ error: 'Invalid content type' });
        }
      }
      
      // Request size validation (max 1MB)
      const contentLength = req.headers['content-length'];
      if (contentLength && parseInt(contentLength) > 1024 * 1024) {
        return res.status(413).json({ error: 'Request too large' });
      }
      
      // Call the actual handler
      await handler(secureReq, res);
      
    } catch (error) {
      console.error('API Security middleware error:', error);
        // Don't expose internal errors in production
      const isDevelopment = process.env.NODE_ENV === 'development';
      const errorMessage = isDevelopment 
        ? `Internal server error: ${String(error)}` 
        : 'Internal server error';
      
      return res.status(500).json({ error: errorMessage });
    }
  };
}

// CSRF protection middleware
export function withCSRFProtection(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void> | void
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {    // Only check CSRF for state-changing methods
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method ?? '')) {
      const origin = req.headers.origin;
      const referer = req.headers.referer;      // Verify origin or referer matches allowed domains  
      const isValidOrigin = origin && securityConfig.allowedOrigins.includes(origin);
      
      let isValidReferer = false;
      if (referer) {
        isValidReferer = securityConfig.allowedOrigins.some(allowed => 
          referer.startsWith(allowed)
        );
      }
      
      if (!isValidOrigin && !isValidReferer) {
        return res.status(403).json({ error: 'Invalid origin or referer' });
      }
    }
    
    return handler(req, res);
  };
}

// Authentication middleware
export function withAuth(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void> | void
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    // Check for authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }
    
    // In a real implementation, you would verify the token here
    // For Firebase, you would use admin.auth().verifyIdToken()
    
    return handler(req, res);
  };
}

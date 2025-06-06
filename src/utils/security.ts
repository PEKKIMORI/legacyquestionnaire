import DOMPurify from 'dompurify';
import validator from 'validator';

// Input sanitization utilities
export const sanitizeInput = {
  // Sanitize HTML input to prevent XSS
  html(input: string): string {
    if (typeof window !== 'undefined') {
      return DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    }
    // Server-side fallback - remove all HTML tags
    return input.replace(/<[^>]*>/g, '');
  },

  // Sanitize text input
  text(input: string): string {
    return validator.escape(input.trim());
  },

  // Sanitize email
  email(input: string): string {
    const sanitized = validator.normalizeEmail(input.trim().toLowerCase()) || '';
    return validator.isEmail(sanitized) ? sanitized : '';
  },

  // Sanitize numeric input
  number(input: string): number | null {
    const sanitized = input.replace(/[^0-9.-]/g, '');
    const num = parseFloat(sanitized);
    return isNaN(num) ? null : num;
  }
};

// Input validation utilities
export const validateInput = {
  // Validate email format
  email(email: string): boolean {
    return validator.isEmail(email) && email.length <= 254;
  },

  // Validate text length and content
  text(text: string, minLength = 1, maxLength = 1000): boolean {
    return validator.isLength(text.trim(), { min: minLength, max: maxLength });
  },

  // Validate required field
  required(value: string): boolean {
    return validator.isLength(value.trim(), { min: 1 });
  },

  // Validate question ID format
  questionId(id: string): boolean {
    return validator.isAlphanumeric(id) && validator.isLength(id, { min: 1, max: 50 });
  },

  // Validate URL format
  url(url: string): boolean {
    return validator.isURL(url, {
      protocols: ['http', 'https'],
      require_protocol: true
    });
  }
};

// Rate limiting utilities
export const rateLimiter = {
  attempts: new Map<string, { count: number; resetTime: number }>(),

  // Check if IP/user is rate limited
  isRateLimited(identifier: string, maxAttempts = 5, windowMs = 15 * 60 * 1000): boolean {
    const now = Date.now();
    const attempts = this.attempts.get(identifier);

    if (!attempts || now > attempts.resetTime) {
      this.attempts.set(identifier, { count: 1, resetTime: now + windowMs });
      return false;
    }

    if (attempts.count >= maxAttempts) {
      return true;
    }

    attempts.count++;
    return false;
  },

  // Reset rate limit for identifier
  reset(identifier: string): void {
    this.attempts.delete(identifier);
  }
};

// Security headers utilities
export const securityHeaders = {
  // Get client IP address from request
  getClientIP(req: unknown): string {
    const request = req as Record<string, unknown>;
    const headers = request.headers as Record<string, string | string[]> | undefined;
    const connection = request.connection as { remoteAddress?: string } | undefined;
    const socket = request.socket as { remoteAddress?: string } | undefined;
    
    const forwardedFor = headers?.['x-forwarded-for'];
    const realIp = headers?.['x-real-ip'];
    
    if (typeof forwardedFor === 'string') {
      return forwardedFor.split(',')[0] ?? 'unknown';
    }
    if (Array.isArray(forwardedFor) && forwardedFor[0]) {
      return forwardedFor[0];
    }
    if (typeof realIp === 'string') {
      return realIp;
    }
    if (connection?.remoteAddress) {
      return connection.remoteAddress;
    }
    if (socket?.remoteAddress) {
      return socket.remoteAddress;
    }
    return 'unknown';
  },

  // Validate request origin
  validateOrigin(origin: string, allowedOrigins: string[]): boolean {
    if (!origin) return false;
    return allowedOrigins.includes(origin);
  }
};

// Password security utilities
export const passwordSecurity = {
  // Validate password strength
  validateStrength(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
};

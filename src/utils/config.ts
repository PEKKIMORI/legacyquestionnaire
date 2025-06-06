import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

// Security configuration
export const securityConfig = {  // Allowed origins for CORS
  
  // Rate limiting configuration
  rateLimits: {
    auth: { maxAttempts: 5, windowMs: 15 * 60 * 1000 }, // 5 attempts per 15 minutes
    validation: { maxAttempts: 60, windowMs: 60 * 1000 }, // 60 requests per minute
    questions: { maxAttempts: 30, windowMs: 60 * 1000 }, // 30 submissions per minute
    api: { maxAttempts: 100, windowMs: 60 * 1000 }, // 100 API calls per minute
  },
  
  // Content Security Policy
  csp: {
    defaultSrc: ["'self'"],
    scriptSrc: [
      "'self'",
      "'unsafe-inline'", // Required for Next.js
      "'unsafe-eval'", // Required for development
      "https://accounts.google.com",
      "https://apis.google.com",
    ],
    styleSrc: [
      "'self'",
      "'unsafe-inline'", // Required for styled-components and CSS-in-JS
      "https://fonts.googleapis.com",
    ],
    fontSrc: [
      "'self'",
      "https://fonts.gstatic.com",
    ],
    imgSrc: [
      "'self'",
      "data:",
      "https:",
    ],
    connectSrc: [
      "'self'",
      "https://*.googleapis.com",
      "https://*.firebaseio.com",
      "https://*.firebase.com",
    ],
    frameSrc: [
      "https://accounts.google.com",
    ],
  },
  
  // Input validation limits
  validation: {
    email: { maxLength: 254 },
    password: { minLength: 8, maxLength: 128 },
    textInput: { maxLength: 5000 },
    questionId: { maxLength: 50 },
  },
  
};


// Firebase configuration with validation
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

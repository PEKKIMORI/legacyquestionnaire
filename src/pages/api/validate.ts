import type { NextApiRequest, NextApiResponse } from 'next';
import { sanitizeInput, validateInput } from '../../utils/security';
import { withSecurity, withCSRFProtection } from '../../middleware/security';

interface ValidationRequest {
  email?: string;
  password?: string;
  questionId?: string;
  userInput?: string;
}

interface ValidationResponse {
  valid: boolean;
  errors: string[];
  sanitized?: Partial<ValidationRequest>;
}

async function validateHandler(
  req: NextApiRequest,
  res: NextApiResponse<ValidationResponse>
) {  try {
    const requestBody = req.body as ValidationRequest;
    const { email, password, questionId, userInput } = requestBody;
    const errors: string[] = [];
    const sanitized: Partial<ValidationRequest> = {};

    // Validate and sanitize email
    if (email !== undefined) {
      const sanitizedEmail = sanitizeInput.email(email);
      const isValidEmail = validateInput.email(sanitizedEmail);
      const isMinervaEmail = /@(minerva\.edu|uni\.minerva\.edu)$/i.test(sanitizedEmail);
      
      if (!isValidEmail) {
        errors.push('Invalid email format');
      } else if (!isMinervaEmail) {
        errors.push('Only Minerva University email addresses are allowed');
      } else {
        sanitized.email = sanitizedEmail;
      }
    }

    // Validate and sanitize password
    if (password !== undefined) {
      const sanitizedPassword = sanitizeInput.text(password);
      
      if (!validateInput.required(sanitizedPassword)) {
        errors.push('Password is required');
      } else if (sanitizedPassword.length < 8) {
        errors.push('Password must be at least 8 characters long');
      } else {
        sanitized.password = sanitizedPassword;
      }
    }

    // Validate and sanitize question ID
    if (questionId !== undefined) {
      const sanitizedQuestionId = sanitizeInput.text(questionId);
      
      if (!validateInput.questionId(sanitizedQuestionId)) {
        errors.push('Invalid question ID format');
      } else {
        sanitized.questionId = sanitizedQuestionId;
      }
    }

    // Validate and sanitize user input (for questionnaire responses)
    if (userInput !== undefined) {
      const sanitizedUserInput = sanitizeInput.html(userInput);
      
      if (!validateInput.text(sanitizedUserInput, 0, 5000)) {
        errors.push('User input exceeds maximum length (5000 characters)');
      } else {
        sanitized.userInput = sanitizedUserInput;
      }
    }

    return res.status(200).json({
      valid: errors.length === 0,
      errors,
      sanitized: errors.length === 0 ? sanitized : undefined
    });

  } catch (error) {
    console.error('Validation API error:', error);
    return res.status(500).json({ 
      valid: false, 
      errors: ['Internal server error'] 
    });
  }
}

export default withSecurity(
  withCSRFProtection(validateHandler),
  {
    methods: ['POST'],
    rateLimit: { maxAttempts: 60, windowMs: 60 * 1000 } // 60 requests per minute
  }
);

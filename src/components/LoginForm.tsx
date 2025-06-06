// LoginForm.tsx
import React, { useState, useRef } from "react";
import { useRouter } from "next/router";
import { motion } from "framer-motion";
import app from "../../firebase";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../../firebase";
import { sanitizeInput, validateInput, rateLimiter, passwordSecurity } from "../utils/security";

const LoginForm: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);  const [emailError, setEmailError] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const [authError, setAuthError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const firebaseAuth = getAuth(app);
  const formRef = useRef<HTMLFormElement>(null);

  const validateEmail = (email: string) => {
    const sanitizedEmail = sanitizeInput.email(email);
    return /@(minerva\.edu|uni\.minerva\.edu)$/i.test(sanitizedEmail) && validateInput.email(sanitizedEmail);
  };

  const handlePasswordChange = (value: string) => {
    const sanitizedPassword = sanitizeInput.text(value);
    setPassword(sanitizedPassword);
    
    if (isRegister && sanitizedPassword) {
      const validation = passwordSecurity.validateStrength(sanitizedPassword);
      setPasswordErrors(validation.errors);
    } else {
      setPasswordErrors([]);
    }
  };
  const handleGoogleSignIn = async () => {
    try {
      setAuthError("");
      setIsLoading(true);
      
      // Check rate limiting
      const clientId = `google-${Date.now()}`;
      if (rateLimiter.isRateLimited(clientId, 3, 5 * 60 * 1000)) {
        setAuthError("Too many sign-in attempts. Please try again later.");
        setIsLoading(false);
        return;
      }
      
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      // Check if the email domain is allowed
      if (user.email && validateEmail(user.email)) {
        await router.push("/questions/1");
      } else {
        // Sign out the user if email domain is not allowed
        await auth.signOut();
        setAuthError("Only Minerva University email addresses are allowed.");
      }    } catch (error: unknown) {
      console.error("Google sign-in error:", error);
      let errorMessage = "Failed to sign in with Google. Please try again.";
      
      // Provide more specific error messages without exposing sensitive details
      if (error && typeof error === 'object' && 'code' in error) {
        const firebaseError = error as { code: string };
        if (firebaseError.code === 'auth/popup-blocked') {
          errorMessage = "Popup was blocked. Please allow popups and try again.";
        } else if (firebaseError.code === 'auth/popup-closed-by-user') {
          errorMessage = "Sign-in was cancelled. Please try again.";
        } else if (firebaseError.code === 'auth/network-request-failed') {
          errorMessage = "Network error. Please check your connection and try again.";
        }
      }
      
      setAuthError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Sanitize inputs
    const sanitizedEmail = sanitizeInput.email(email);
    const sanitizedPassword = sanitizeInput.text(password);
    
    // Validate inputs
    const isEmailValid = validateEmail(sanitizedEmail);
    const isPasswordValid = validateInput.required(sanitizedPassword);
    
    setEmailError(!isEmailValid);
    setAuthError("");
    
    // Check for validation errors
    if (!isEmailValid || !isPasswordValid) {
      setAuthError("Please use a valid Minerva email address and fill in the password field.");
      return;
    }
    
    // Check password strength for registration
    if (isRegister) {
      const passwordValidation = passwordSecurity.validateStrength(sanitizedPassword);
      if (!passwordValidation.isValid) {
        setPasswordErrors(passwordValidation.errors);
        return;
      }
    }
    
    // Rate limiting check
    const clientId = `auth-${sanitizedEmail}`;
    if (rateLimiter.isRateLimited(clientId, 5, 15 * 60 * 1000)) {
      setAuthError("Too many authentication attempts. Please try again in 15 minutes.");
      return;
    }
      setIsLoading(true);
    
    try {
      const authAction = isRegister
        ? createUserWithEmailAndPassword(firebaseAuth, sanitizedEmail, sanitizedPassword)
        : signInWithEmailAndPassword(firebaseAuth, sanitizedEmail, sanitizedPassword);
  
      await authAction;
      
      // Reset rate limiting on successful auth
      rateLimiter.reset(clientId);
      
      // Navigate on successful signup/login
      await router.push("/questions/1");
      console.log("Authentication and navigation successful");
        } catch (error: unknown) {
      console.error("Authentication failed:", error);
      
      let errorMessage = "Authentication failed. Please try again.";
      
      // Provide user-friendly error messages without exposing sensitive details
      if (error && typeof error === 'object' && 'code' in error) {
        const firebaseError = error as { code: string };
        if (firebaseError.code === 'auth/user-not-found' || firebaseError.code === 'auth/wrong-password') {
          errorMessage = "Invalid email or password.";
        } else if (firebaseError.code === 'auth/email-already-in-use') {
          errorMessage = "An account with this email already exists. Try signing in instead.";
        } else if (firebaseError.code === 'auth/weak-password') {
          errorMessage = "Password is too weak. Please choose a stronger password.";
        } else if (firebaseError.code === 'auth/too-many-requests') {
          errorMessage = "Too many failed attempts. Please try again later.";
        } else if (firebaseError.code === 'auth/network-request-failed') {
          errorMessage = "Network error. Please check your connection and try again.";
        }
      }
      
      setAuthError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleRegister = () => {
    setIsRegister(!isRegister);
  };
  return (
    <motion.form
      ref={formRef}
      onSubmit={handleSubmit}
      className="w-full flex flex-col space-y-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.1 }}
    >
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.1 }}
      >
        <input
          type="email"
          placeholder="Enter your Minerva email"
          required
          autoComplete="email"
          maxLength={254}
          className={`w-full rounded-xl border-2 bg-gray-50 p-4 text-gray-800 outline-none focus:bg-white ${
            emailError 
              ? "border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-100" 
              : "border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          }`}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isLoading}
        />
        {emailError && (
          <motion.p
            animate={{ opacity: 1, y: 0 }}
            className="mt-2 text-sm text-red-600"
          >
            Please use a valid Minerva email address
          </motion.p>
        )}
      </motion.div>      <motion.input
        type="password"
        placeholder="Enter your password"
        required
        autoComplete={isRegister ? "new-password" : "current-password"}
        minLength={isRegister ? 8 : 1}
        maxLength={128}
        className={`w-full rounded-xl border-2 bg-gray-50 p-4 text-gray-800 outline-none focus:bg-white focus:ring-4 ${
          passwordErrors.length > 0
            ? "border-red-400 focus:border-red-500 focus:ring-red-100"
            : "border-gray-200 focus:border-blue-500 focus:ring-blue-100"
        }`}
        value={password}
        onChange={(e) => handlePasswordChange(e.target.value)}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.1 }}
        disabled={isLoading}
      />
      
      {/* Password strength indicators for registration */}
      {isRegister && passwordErrors.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mt-2 space-y-1"
        >
          {passwordErrors.map((error, index) => (
            <p key={index} className="text-xs text-red-600">
              • {error}
            </p>
          ))}
        </motion.div>
      )}      <motion.button
        type="submit"
        disabled={isLoading || (isRegister && passwordErrors.length > 0)}
        className={`w-full rounded-xl px-6 py-4 text-white font-semibold shadow-lg focus:ring-4 focus:ring-blue-200 ${
          isLoading || (isRegister && passwordErrors.length > 0)
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 hover:shadow-xl"
        }`}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.1 }}
        whileHover={isLoading ? {} : { scale: 1.02 }}
        whileTap={isLoading ? {} : { scale: 0.98 }}
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
            </svg>
            Processing...
          </span>
        ) : (
          isRegister ? "Create Account" : "Sign In"
        )}
      </motion.button>

      {/* Divider */}
      <motion.div 
        className="flex items-center my-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex-grow border-t border-gray-300"></div>
        <span className="flex-shrink mx-4 text-gray-500 text-sm">or</span>
        <div className="flex-grow border-t border-gray-300"></div>
      </motion.div>      {/* Google Sign-In Button */}
      <motion.button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={isLoading}
        className={`w-full rounded-xl border-2 px-6 py-4 font-semibold shadow-lg focus:ring-4 focus:ring-gray-200 flex items-center justify-center gap-3 ${
          isLoading
            ? "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed"
            : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:shadow-xl"
        }`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        whileHover={isLoading ? {} : { scale: 1.02 }}
        whileTap={isLoading ? {} : { scale: 0.98 }}
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Continue with Google
      </motion.button>

      {/* Error Message */}
      {authError && (
        <motion.p
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 text-sm text-red-600 text-center"
        >
          {authError}
        </motion.p>
      )}

      <motion.button
        type="button"
        onClick={toggleRegister}
        className="text-sm text-gray-600 hover:text-blue-600 underline underline-offset-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.1 }}
        whileHover={{ scale: 1.05 }}
      >
        {isRegister
          ? "Already have an account? Sign in"
          : "Don't have an account? Create one"}
      </motion.button>
    </motion.form>
  );
};

export default LoginForm;
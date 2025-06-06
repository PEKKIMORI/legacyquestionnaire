// LoginForm.tsx
import React, { useState } from "react";
import { useRouter } from "next/router";
import { motion } from "framer-motion";
import app from "../../firebase";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider} from "firebase/auth";
import { auth, googleProvider } from "../../firebase";

const LoginForm: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const [authError, setAuthError] = useState("");
  const router = useRouter();
  const firebaseAuth = getAuth(app);
  const validateEmail = (email: string) => {
    return /@(minerva\.edu|uni\.minerva\.edu)$/i.test(email);
  };

  const handleGoogleSignIn = async () => {
    try {
      setAuthError("");
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      // Check if the email domain is allowed
      if (user.email && validateEmail(user.email)) {
        await router.push("/questions/1");
      } else {
        // Sign out the user if email domain is not allowed
        await auth.signOut();
        setAuthError("Only Minerva University email addresses are allowed.");
      }
    } catch (error: any) {
      console.error("Google sign-in error:", error);
      setAuthError("Failed to sign in with Google. Please try again.");
    }
  };
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setEmailError(!validateEmail(email)); // Set email error state based on validation
    setAuthError("");
    if (email && password && validateEmail(email)) {
      const authAction = isRegister
        ? createUserWithEmailAndPassword(firebaseAuth, email, password)
        : signInWithEmailAndPassword(firebaseAuth, email, password);
  
      authAction
        .then(() => {
          // Navigate on successful signup/login
          return router.push("/questions/1");
        })
        .then(() => {
          console.log("Navigation successful");
        })
        .catch((error) => {
          console.error("Failed to authenticate or navigate:", error);
          alert("Authentication failed. Please try again.");
        });
    } else {
      alert("Please use a Minerva email address and fill in the password field.");
    }
  };

  const toggleRegister = () => {
    setIsRegister(!isRegister);
  };

  return (
    <motion.form
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
          className={`w-full rounded-xl border-2 bg-gray-50 p-4 text-gray-800 outline-none focus:bg-white ${
            emailError 
              ? "border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-100" 
              : "border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          }`}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {emailError && (
          <motion.p
            animate={{ opacity: 1, y: 0 }}
            className="mt-2 text-sm text-red-600"
          >
            Please use a valid Minerva email address
          </motion.p>
        )}
      </motion.div>

      <motion.input
        type="password"
        placeholder="Enter your password"
        required
        className="w-full rounded-xl border-2 border-gray-200 bg-gray-50 p-4 text-gray-800 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.1 }}
      />      <motion.button
        type="submit"
        className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 px-6 py-4 text-white font-semibold shadow-lg hover:from-blue-600 hover:to-purple-700 hover:shadow-xl focus:ring-4 focus:ring-blue-200"
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.1 }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        {isRegister ? "Create Account" : "Sign In"}
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
      </motion.div>

      {/* Google Sign-In Button */}
      <motion.button
        type="button"
        onClick={handleGoogleSignIn}
        className="w-full rounded-xl border-2 border-gray-200 bg-white px-6 py-4 text-gray-700 font-semibold shadow-lg hover:bg-gray-50 hover:shadow-xl focus:ring-4 focus:ring-gray-200 flex items-center justify-center gap-3"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
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
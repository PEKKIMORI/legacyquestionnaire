// LoginForm.tsx
import React, { useState } from "react";
import { useRouter } from "next/router";
import { motion } from "framer-motion";
import app from "../../firebase";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword} from "firebase/auth";

const LoginForm: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const router = useRouter();
  const auth = getAuth(app);

  const validateEmail = (email: string) => {
    return /@(minerva\.edu|uni\.minerva\.edu)$/i.test(email);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setEmailError(!validateEmail(email)); // Set email error state based on validation
    if (email && password && validateEmail(email)) {
      const authAction = isRegister
        ? createUserWithEmailAndPassword(auth, email, password)
        : signInWithEmailAndPassword(auth, email, password);
  
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
      />

      <motion.button
        type="submit"
        className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 px-6 py-4 text-white font-semibold shadow-lg hover:from-blue-600 hover:to-purple-700 hover:shadow-xl focus:ring-4 focus:ring-blue-200"
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.1 }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        {isRegister ? "Create Account" : "Sign In"}
      </motion.button>

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
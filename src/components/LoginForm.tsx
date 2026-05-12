// LoginForm.tsx
import React, { useState } from "react";
import { useRouter } from "next/router";
import { motion } from "framer-motion";
import { signInWithPopup, type User } from "firebase/auth";
import { auth, googleProvider, db } from "../../firebase";
import { sanitizeInput, validateInput, rateLimiter } from "../utils/security";
import { animationVariants, interactions } from "~/utils/animationUtils";
import { collection, query, where, getDocs, addDoc } from "firebase/firestore";
import DemographicsPopup from "./DemographicsPopup";

const LoginForm: React.FC = () => {
  const [authError, setAuthError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showDemographics, setShowDemographics] = useState(false);
  const [demographicsLoading, setDemographicsLoading] = useState(false);
  const [demographicsError, setDemographicsError] = useState("");
  const [pendingUser, setPendingUser] = useState<User | null>(null); // Store user for demographics flow
  const router = useRouter();

  const validateEmail = (email: string) => {
    const sanitizedEmail = sanitizeInput.email(email);
    return (
      /@(minerva\.edu|uni\.minerva\.edu)$/i.test(sanitizedEmail) &&
      validateInput.email(sanitizedEmail)
    );
  };

  // Check if response document exists for user
  const checkResponseExists = async (uid: string): Promise<boolean> => {
    try {
      const responsesCollection = collection(db, "responses");
      const q = query(responsesCollection, where("userId", "==", uid));
      const querySnapshot = await getDocs(q);
      return !querySnapshot.empty;
    } catch (error) {
      // Log and treat as not existing (fail-safe)
      console.error("Error checking response existence:", error);
      return false;
    }
  };

  // Create response document with demographics
  const createResponseWithDemographics = async (
    user: User,
    demographics: { name: string; cohort: string; gender: string; country: string; age: string },
  ) => {
    try {
      // Double-check for existing response to avoid duplicates
      const exists = await checkResponseExists(user.uid);
      if (exists) return; // Do not create again

      const newResponseData = {
        userId: user.uid,
        userEmail: sanitizeInput.email(user.email ?? ""),
        userName: sanitizeInput.text(demographics.name),
        cohort: sanitizeInput.text(demographics.cohort),
        startedAt: new Date(),
        lastUpdated: new Date(),
        demographics: {
          gender: sanitizeInput.text(demographics.gender),
          country: sanitizeInput.text(demographics.country),
          age: sanitizeInput.text(demographics.age),
        },
      };
      await addDoc(collection(db, "responses"), newResponseData);
    } catch (error) {
      throw error;
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
        const exists = await checkResponseExists(user.uid);
        if (exists) {
          // Already filled demographics, go to questionnaire
          await router.push("/questions/1");
        } else {
          // Show demographics popup
          setPendingUser(user);
          setShowDemographics(true);
        }
      } else {
        // Sign out the user if email domain is not allowed
        await auth.signOut();
        setAuthError("Only Minerva University email addresses are allowed.");
      }
    } catch (error: unknown) {
      console.error("Google sign-in error:", error);
      let errorMessage = "Failed to sign in with Google. Please try again.";

      // Provide more specific error messages without exposing sensitive details
      if (error && typeof error === "object" && "code" in error) {
        const firebaseError = error as { code: string };
        if (firebaseError.code === "auth/popup-blocked") {
          errorMessage =
            "Popup was blocked. Please allow popups and try again.";
        } else if (firebaseError.code === "auth/popup-closed-by-user") {
          errorMessage = "Sign-in was cancelled. Please try again.";
        } else if (firebaseError.code === "auth/network-request-failed") {
          errorMessage =
            "Network error. Please check your connection and try again.";
        }
      }

      setAuthError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemographicsSubmit = async (data: {
    name: string;
    cohort: string;
    gender: string;
    country: string;
    age: string;
  }) => {
    setDemographicsLoading(true);
    setDemographicsError("");
    try {
      if (!pendingUser) {
        setDemographicsError("User not found. Please sign in again.");
        setShowDemographics(false);
        return;
      }
      await createResponseWithDemographics(pendingUser, data);
      setShowDemographics(false);
      await router.push("/questions/1");
    } catch (error) {
      console.error("Error saving demographics:", error);
      setDemographicsError("Failed to save demographics. Please try again.");
    } finally {
      setDemographicsLoading(false);
    }
  };

  return (
    <motion.div
      className="flex w-full flex-col space-y-4"
      {...animationVariants.fadeIn}
    >
      {/* Google Sign-In Button */}
      <motion.button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={isLoading}
        className={`flex w-full items-center justify-center gap-3 rounded-xl border-2 px-6 py-4 font-semibold shadow-lg focus:ring-4 focus:ring-gray-200 ${
          isLoading
            ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
            : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:shadow-xl"
        }`}
        {...animationVariants.slideUp}
        whileHover={isLoading ? {} : interactions.hover}
        whileTap={isLoading ? {} : interactions.tap}
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Signing in...
          </span>
        ) : (
          <>
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </>
        )}
      </motion.button>

      {/* Error Message */}
      {authError && (
        <motion.p
          {...animationVariants.slideUp}
          className="mt-2 text-center text-sm text-red-600"
        >
          {authError}
        </motion.p>
      )}
      {/* Demographics Popup */}
      {showDemographics && (
        <DemographicsPopup
          onSubmit={handleDemographicsSubmit}
          loading={demographicsLoading}
          error={demographicsError}
        />
      )}
    </motion.div>
  );
};

export default LoginForm;

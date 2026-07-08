import React, { useState } from "react";
import Image from "next/image";
import LoginForm from "./LoginForm";
import { motion } from "framer-motion";
import { useRouter } from "next/router";
import {
  animationVariants,
  withDelay,
  interactions,
} from "~/utils/animationUtils";

const MainSection: React.FC = () => {
  const [heartClicks, setHeartClicks] = useState(0);
  const router = useRouter();

  const handleHeartClick = () => {
    const newCount = heartClicks + 1;
    setHeartClicks(newCount);
    if (newCount === 10) {
      void router.push("/secret");
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-white via-gray-50 to-white p-6">
      <motion.div
        {...animationVariants.fadeIn}
        className="flex w-full max-w-6xl flex-col items-center gap-12 lg:flex-row"
      >
        <motion.div
          {...withDelay(animationVariants.slideLeft, 0.1)}
          className="flex-shrink-0"
        >
          <Image
            src="/minerva.svg"
            alt="Minerva Logo"
            width={280}
            height={280}
            className="drop-shadow-2xl"
          />
        </motion.div>

        <motion.div
          {...withDelay(animationVariants.slideRight, 0.2)}
          className="flex max-w-lg flex-col items-center"
        >
          <motion.div
            className="w-full rounded-3xl border border-gray-200 bg-white/90 p-10 shadow-2xl backdrop-blur-lg"
            {...withDelay(animationVariants.slideUp, 0.3)}
          >
            <motion.h1
              className="mb-6 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 bg-clip-text text-center text-4xl font-bold leading-tight text-transparent"
              {...withDelay(animationVariants.slideUp, 0.4)}
            >
              My Minerva Vibe Check ✔️
            </motion.h1>

            <motion.p
              className="mb-8 text-center text-lg leading-relaxed text-gray-600"
              {...withDelay(animationVariants.slideUp, 0.5)}
            >
              Discover your unique Minerva vibe and get ready for an amazing
              Foundation Week experience!
            </motion.p>

            <motion.div {...withDelay(animationVariants.slideUp, 0.6)}>
              <LoginForm />
            </motion.div>

            <motion.button
              className="mt-8 w-full rounded-xl bg-gradient-to-r from-gray-600 to-gray-700 px-6 py-3 font-semibold text-white shadow-lg hover:from-gray-700 hover:to-gray-800 hover:shadow-xl"
              {...withDelay(animationVariants.slideUp, 0)}
              whileHover={interactions.hover}
              whileTap={interactions.tap}
              onClick={async () => {
                // Only activate the flag after visiting the secret page
                if (
                  typeof window !== "undefined" &&
                  window.localStorage.getItem("minervaSecretUnlocked") ===
                    "activated"
                ) {
                  // Prompt for password
                  const password = window.prompt(
                    "Enter the secret password to continue:",
                  );
                  if (password === "tenofheartsintheTL") {
                    // Redirect to another secret page
                    window.location.href = "/super-secret";
                  } else {
                    // Reset the flag if cancelled or wrong password
                    window.localStorage.setItem(
                      "minervaSecretUnlocked",
                      "false",
                    );
                    if (password !== null) {
                      window.alert("Incorrect password. Try again!");
                    }
                  }
                } else {
                  window.location.href = "mailto:legacies@minerva.edu";
                }
              }}
            >
              Contact Us
            </motion.button>
          </motion.div>
        </motion.div>

        {/* Handwritten signature message - positioned to mirror the logo */}
        <motion.div
          {...withDelay(animationVariants.fadeIn, 1)}
          className="hidden flex-shrink-0 items-center justify-center lg:flex"
          style={{ width: "280px", height: "280px" }}
        >
          <div
            className="rotate-[-5deg] transform text-center text-lg leading-relaxed text-gray-500"
            style={{
              fontFamily: 'var(--font-kalam), "Comic Sans MS", cursive',
            }}
          >
            <div className="mb-2">made with</div>
            <div
              className="mb-2 cursor-pointer select-none text-2xl"
              onClick={handleHeartClick}
              title={
                "M23 Jacob, Haitham & Eric\nM25 Seoyoung & Matvii\nM27 Boss & Karolina\nM28 Rafael & Noku"
              }
            >
              ❤️
            </div>
            <div className="mb-1">for Minerva University</div>
            <div className="text-sm italic">- Vibe Check Crew</div>
          </div>
        </motion.div>
      </motion.div>
    </main>
  );
};

export default MainSection;

import React from "react";
import Image from "next/image";
import LoginForm from "./LoginForm";
import { motion } from "framer-motion";

const MainSection: React.FC = () => {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-white via-gray-50 to-white p-6">
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="flex flex-col lg:flex-row items-center gap-12 w-full max-w-6xl"
      >
        <motion.div
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8 }}
          className="flex-shrink-0"
        >
          <motion.div
            transition={{ duration: 0.3 }}
          >
            <Image
              src="/minerva.svg"
              alt="Minerva Logo"
              width={280}
              height={280}
              className="drop-shadow-2xl"
            />
          </motion.div>
        </motion.div>

        <motion.div
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8 }}
          className="flex flex-col items-center max-w-lg"
        >
          <motion.div 
            className="w-full rounded-3xl border border-gray-200 bg-white/90 backdrop-blur-lg p-10 shadow-2xl"
            transition={{ duration: 0.3 }}
          >
            <motion.h1 
              className="text-center mb-6 text-4xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 bg-clip-text text-transparent leading-tight"
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.1 }}
            >
              Welcome to the Minerva Identity Survey
            </motion.h1>
            
            <motion.p 
              className="text-center mb-8 text-lg text-gray-600 leading-relaxed"
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.1 }}
            >
              Discover your unique Minerva vibe and get ready for an amazing Foundation Week experience!
            </motion.p>
            
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.1 }}
            >
              <LoginForm />
            </motion.div>
            
            <motion.button 
              className="w-full mt-8 rounded-xl bg-gradient-to-r from-gray-600 to-gray-700 px-6 py-3 text-white font-semibold shadow-lg hover:from-gray-700 hover:to-gray-800 hover:shadow-xl"
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.1 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Contact Us
            </motion.button>
          </motion.div>
        </motion.div>
      </motion.div>
    </main>
  );
};

export default MainSection;

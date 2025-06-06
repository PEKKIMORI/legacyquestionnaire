import React from 'react';
import { motion } from 'framer-motion';

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
}

const PageTransition: React.FC<PageTransitionProps> = ({ children, className = "" }) => {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}      transition={{
        duration: 0.3,
        ease: [0.4, 0, 0.2, 1], // Custom easing curve for smooth transitions
      }}
    >
      {children}
    </motion.div>
  );
};

export default PageTransition;

import { type AppType } from "next/dist/shared/lib/utils";
import { useRouter } from "next/router";
import { AnimatePresence, motion } from "framer-motion";
import "~/styles/globals.css";
import Head from "next/head";
import {Open_Sans} from "@next/font/google";

const opensans = Open_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

const pageVariants = {
  initial: {
    opacity: 0,
    y: 20,
    scale: 0.98,
  },
  enter: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: [0.4, 0, 0.2, 1],
    },
  },
  exit: {
    opacity: 0,
    y: -20,
    scale: 0.98,
    transition: {
      duration: 0.3,
      ease: [0.4, 0, 0.2, 1],
    },
  },
};

const MyApp: AppType = ({ Component, pageProps }) => {
  const router = useRouter();

  return (
    <main className={opensans.className}>
      <Head>
        <title>Minerva Identity</title>
        <meta name="description" content="Your Minerva Identity" />
        <link rel="icon" href="/minerva.svg" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      
      <AnimatePresence 
        mode="wait" 
        onExitComplete={() => {
          // Smooth scroll to top on page change
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      >
        <motion.div
          key={router.route}
          variants={pageVariants}
          initial="initial"
          animate="enter"
          exit="exit"
          className="min-h-screen"
        >
          <Component {...pageProps} />
        </motion.div>
      </AnimatePresence>
    </main>
  )
};

export default MyApp;

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { db } from "./../../firebase";
import { collection, query, where, getDocs, updateDoc, doc } from "firebase/firestore";
import { auth } from "./../../firebase";
import { animationVariants, withDelay } from "~/utils/animationUtils";

const FinalPage: React.FC = () => {
  const [vibe, setVibe] = useState<string>("evaluating...");
  useEffect(() => {
    const evaluateResponses = async () => {
      const user = auth.currentUser;

      if (!user) {
        console.log("User not logged in");
        setVibe("User not logged in.");
        return;
      }

      try {
        const responsesCollection = collection(db, "responses");
        const q = query(responsesCollection, where("userId", "==", user.uid));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          console.log("No responses document found for the user.");
          setVibe("No response found.");
        } else {
          const responseDoc = querySnapshot.docs.find((doc) => doc.exists());
          if (responseDoc) {
            const data = responseDoc.data();

            const tally: Record<string, number> = {};
              // Count answers from the new structure
            Object.keys(data).forEach((key) => {
              if (key.startsWith('q') && data[key] && typeof data[key] === 'object' && 'answer' in data[key]) {
                const questionData = data[key] as { answer: string };
                const answer = questionData.answer;
                if (typeof answer === "string") {
                  tally[answer] = (tally[answer] ?? 0) + 1;
                }
              }
            });

            console.log("Tally results:", tally);

            // Determine the highest category
            const entries = Object.entries(tally);
            if (entries.length === 0) {
              setVibe("No valid responses found.");
              return;
            }
            
            const highestCategory = entries.reduce(
              (a, b) => (a[1] > b[1] ? a : b)
            )[0];            const minervaVibes: Record<string, string[]> = {
              Civic: ["Stewardship", "Altruism", "Community"],
              Legion: ["Camaraderie", "Valor", "Solidarity"],
              Liberty: ["Autonomy", "Empowerment", "Liberation"],
              North: ["Vision", "Foresight", "Aspiration"],
              Tower: ["Courage", "Perspective", "Resilience"],
              Lands: ["Heritage", "Immersion", "Diversity"],
              Ocean: ["Voyage", "Depth", "Exploration"],
              Plaza: ["Inclusivity", "Exchange", "Openness"],
              Reserve: ["Discernment", "Essence", "Prudence"],
              Vista: ["Reflection", "Narrative", "Evolution"],
              Pier: ["Conviction", "Launch", "Promise"],
              Cable: ["Bonds", "Interdependence", "Network"],
              Chronicle: ["Veracity", "Documentation", "Accountability"],
              Pyramid: ["Identity", "Introspection", "Foundation"],
              Union: ["Alliance", "Commitment", "Loyalty"],
              Field: ["Cultivation", "Synergy", "Growth"],
              Gate: ["Progression", "Threshold", "Ambition"],
              Labyrinth: ["Journey", "Discovery", "Persistence"],
              Laurel: ["Innovation", "Inquiry", "Curiosity"],
              Mason: ["Craftsmanship", "Collaboration", "Education"],
              Circuit: ["Cycles", "Interconnectedness", "Flow"],
              Eureka: ["Breakthrough", "Revelation", "Ingenuity"],
              Hunter: ["Pursuit", "Instinct", "Tenacity"],
              Mission: ["Purpose", "Vocation", "Calling"],
              Octagon: ["Equilibrium", "Harmony", "Balance"],
            };            // Set the vibe based on the highestCategory, ensure fallback if not found
            const pool = minervaVibes[highestCategory] ?? ["unique"];
            const selectedVibe = pool[Math.floor(Math.random() * pool.length)] ?? "unique";
            setVibe(selectedVibe);

            // Save the results back to Firestore.
            // displayCategory is the naive top-1 (shown to user immediately).
            // affinityVector stores the full tally for batch allocation on allocation day.
            // allocatedLegacy will be written later by the admin batch allocation API.
            try {
              await updateDoc(doc(db, "responses", responseDoc.id), {
                results: {
                  displayCategory: highestCategory,
                  minervaVibe: selectedVibe,
                  affinityVector: tally,
                  calculatedAt: new Date()
                },
                completedAt: new Date(),
                isCompleted: true,
                lastUpdated: new Date()
              });
              console.log("Results saved to Firestore");
            } catch (updateError) {
              console.error("Error saving results:", updateError);
            }
          } else {
            console.log("No responses document found for the user.");
            setVibe("No response found.");
          }
        }
      } catch (error) {
        console.error("Error getting document:", error);
        setVibe("Error retrieving responses.");
      }
    };

    void evaluateResponses();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-blue-50 to-purple-50 flex items-center justify-center p-6">
      <motion.div
        {...animationVariants.scaleSpring}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="max-w-2xl w-full text-center"
      >
        <motion.div
          className="bg-white/90 backdrop-blur-lg rounded-3xl p-12 shadow-2xl border border-gray-100"
        >
          {/* Celebration Icon */}
          <motion.div
            {...withDelay(animationVariants.scaleSpring, 0.3)}
            transition={{ duration: 0.5, type: "spring", bounce: 0.5 }}
            className="mb-8"
          >
            <div className="w-24 h-24 mx-auto bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg">
              <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
            </div>
          </motion.div>

          <motion.h1 
            className="text-5xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 bg-clip-text text-transparent mb-4 leading-tight"
            {...withDelay(animationVariants.slideUp, 0.4)}
          >
            Your Minerva Vibe is...
          </motion.h1>

          <motion.div
            {...withDelay(animationVariants.slideUp, 0.8)}
            className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl mb-8 p-8 border border-blue-100"
          >           
            <motion.div
              {...withDelay(animationVariants.scaleSpring, 1)}
              className="inline-block"
            >
              {vibe === "evaluating..." ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  <span className="text-xl font-medium text-gray-600">Evaluating...</span>
                </div>
              ) : (
                <span className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent px-6 py-3 rounded-xl border-2 border-blue-200 bg-white shadow-md">
                  {vibe}
                </span>
              )}
            </motion.div>
          </motion.div>
          
          <motion.p 
            className="text-xl text-gray-600 leading-relaxed"
            {...withDelay(animationVariants.slideUp, 0.6)}
          >
            Get ready for an amazing Foundation Week experience!
          </motion.p>

          <motion.div
            {...withDelay(animationVariants.fadeIn, 1.2)}
            className="mt-8"
          >
            <p className="text-gray-600 text-sm">
              Try finding other Minervans with similar vibes! 👀
            </p>
          </motion.div>

          {/* Floating particles animation */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {Array.from({ length: 6 }, (_, i) => (
              <motion.div
                key={i}
                className="absolute w-2 h-2 bg-blue-400 rounded-full opacity-20"
                animate={{
                  y: [0, -100, 0],
                  x: [0, Math.random() * 100 - 50, 0],
                  opacity: [0, 1, 0],
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  delay: i * 0.5,
                  ease: "easeInOut",
                }}
                style={{
                  left: `${Math.random() * 100}%`,
                  top: '100%',
                }}
              />
            ))}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default FinalPage;

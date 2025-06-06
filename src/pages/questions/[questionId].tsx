import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { db } from "./../../../firebase";
import { doc, collection, updateDoc, addDoc, getDoc, setDoc } from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "./../../../firebase";
import Papa from "papaparse";
import { useMemo } from "react";
import { motion } from "framer-motion";
import ProgressBar from "../../components/ProgressBar";


// Helper to fetch and parse CSV
const useQuestionsFromCSV = () => {
  const [questions, setQuestions] = useState<any[]>([]);
  useEffect(() => {
    fetch("/legacy_questions.csv")
      .then((res) => res.text())
      .then((csv) => {
        const parsed = Papa.parse(csv, { header: true });
        
        // Define ILO order to ensure consistent sequencing
        const iloOrder = ['CR', 'IR', 'PR', 'SW', 'IE'];
        
        // Group by ILO
        const grouped: Record<string, any[]> = {};
        parsed.data.forEach((row: any) => {
          if (row.ILO && row.Question) { // Ensure valid row
            if (!grouped[row.ILO]) grouped[row.ILO] = [];
            (grouped[row.ILO] ?? []).push(row);
          }
        });
        
        // Take 5 random questions from each ILO
        const selected: any[] = [];
        iloOrder.forEach((ilo) => {
          const arr = grouped[ilo] ?? [];
          if (arr.length > 0) {
            // Shuffle questions within this ILO
            for (let i = arr.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            // Take up to 5 questions from this ILO
            const questionsFromThisILO = arr.slice(0, Math.min(5, arr.length));
            selected.push(...questionsFromThisILO);
            console.log(`Selected ${questionsFromThisILO.length} questions from ILO: ${ilo}`);
          }
        });
        
        // Randomize the order of all selected questions
        for (let i = selected.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [selected[i], selected[j]] = [selected[j], selected[i]];
        }
        
        console.log(`Total questions selected: ${selected.length}`);
        console.log('Randomized question sequence by ILO:', selected.map(q => q.ILO));
        setQuestions(selected);
      })
      .catch((error) => {
        console.error("Error loading questions:", error);
      });
  }, []);
  return questions;
};

const QuestionPage: React.FC = () => {
  const router = useRouter();
  const { questionId } = router.query;
  const questions = useQuestionsFromCSV();
  const [selectedOption, setSelectedOption] = useState<string>("");
  const [currentQuestion, setCurrentQuestion] = useState<number>(1);
  const [responseId, setResponseId] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Monitor auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (questionId) {
      const parsedQuestionId = parseInt(questionId as string);
      if (!isNaN(parsedQuestionId)) {
        setCurrentQuestion(parsedQuestionId);
      }
    }
  }, [questionId]);

  useEffect(() => {
    if (questionId) {
      const parsedQuestionId = parseInt(questionId as string, 10);
      if (!isNaN(parsedQuestionId)) {
        setCurrentQuestion(parsedQuestionId);
        setSelectedOption("");
        // Smooth scroll to main content when question changes
        setTimeout(() => {
          const mainContent = document.querySelector('main');
          if (mainContent) {
            mainContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 100);
      }
    }
  }, [questionId]);

  const question = questions[currentQuestion - 1] ?? null;

  // Show loading while auth state is being determined
  if (authLoading) {
    return <div>Loading...</div>;
  }

  // Redirect to login if not authenticated
  if (!user) {
    void router.push('/');
    return <div>Redirecting to login...</div>;
  }

  if (!question) {
    return <div>Loading questions...</div>;
  }

  const handleOptionChange = (value: string) => {
    setSelectedOption(value);
  };

  const goToNextQuestion = async () => {
    if (!user) {
      alert("You must be signed in to submit your answers.");
      return;
    }

    // Smooth scroll to top before navigation
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Create a unique question identifier
    const questionKey = `q${currentQuestion}_${question.ILO}`;
    
    const responseData = {
      [questionKey]: {
        answer: selectedOption,
        question: question.Question,
        questionIndex: currentQuestion,
        ilo: question.ILO,
        timestamp: new Date()
      }
    };

    try {
      if (!responseId) {
        // Create new response document on first question
        const newResponseData = {
          userId: user.uid,
          userEmail: user.email,
          startedAt: new Date(),
          lastUpdated: new Date(),
          totalQuestions: questions.length,
          ...responseData
        };
        
        const docRef = await addDoc(collection(db, "responses"), newResponseData);
        setResponseId(docRef.id);
        console.log("Created new response document:", docRef.id);
      } else {
        // Update existing response document
        const updateData = {
          ...responseData,
          lastUpdated: new Date()
        };
        
        await updateDoc(doc(db, "responses", responseId), updateData);
        console.log("Updated response document:", responseId);
      }

      // Small delay to ensure smooth scroll completes before navigation
      setTimeout(() => {
        // Navigate to next question or final page
        const nextQuestionId = currentQuestion + 1;
        if (nextQuestionId <= questions.length) {
          void router.push(`/questions/${nextQuestionId}`);
        } else {
          // Mark as completed when going to final page
          if (responseId) {
            void updateDoc(doc(db, "responses", responseId), {
              completedAt: new Date(),
              isCompleted: true
            });
          }
          void router.push("/Final");
        }
      }, 300);
    } catch (error) {
      console.error("Error saving response:", error);
      alert("Failed to save response. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-white">
      <ProgressBar current={currentQuestion} total={questions.length} />
      <main className="container mx-auto flex min-h-screen flex-col items-center justify-center p-6 pt-32">
        <motion.div
          key={currentQuestion}
          className="w-full max-w-2xl"
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -30, scale: 0.95 }}
          transition={{ duration: 0.1, ease: "easeOut" }}
        >
          <motion.div 
            className="relative rounded-2xl bg-white p-8 shadow-xl border border-gray-100 backdrop-blur-sm"
            transition={{ duration: 0.2 }}
          >
            {/* ILO Section Indicator */}
            <motion.div 
              className="mb-6 flex items-center justify-between"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">
                  Question {currentQuestion} of {questions.length}
                </span>
              </div>
            </motion.div>

            <motion.h2 
              className="mb-6 text-3xl font-bold text-gray-900 leading-tight"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              {question.Question}
            </motion.h2>

            <motion.form
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.1 }}
            >
              <div className="space-y-3">
                {["A","B","C","D","E"].map((opt, index) => (
                  <motion.label
                    key={opt}
                    className={`group relative block cursor-pointer rounded-xl border-2 p-6 ${
                      selectedOption === question[`Group_${opt}`]
                        ? "border-blue-500 bg-blue-50 shadow-md"
                        : "border-gray-200 bg-white"
                    }`}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2 }}
                    whileHover={{ 
                      scale: 1.02,
                      borderColor: selectedOption === question[`Group_${opt}`] ? "#3b82f6" : "#9ca3af",
                      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
                      transition: { duration: 0.05 }
                    }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="flex items-center">
                      <input
                        type="radio"
                        name={`question${currentQuestion}`}
                        value={question[`Group_${opt}`]}
                        checked={selectedOption === question[`Group_${opt}`]}
                        onChange={() => handleOptionChange(question[`Group_${opt}`])}
                        className="h-5 w-5 text-blue-600 border-gray-300 focus:ring-0 focus:outline-none mr-4 flex-shrink-0"
                      />
                      <span className="text-lg text-gray-800 leading-relaxed group-hover:text-gray-900">
                        {question[`Option_${opt}`]}
                      </span>
                    </div>
                    {selectedOption === question[`Group_${opt}`]}
                  </motion.label>
                ))}
              </div>
            </motion.form>

            <motion.div
              className="mt-8 flex justify-end"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <motion.button
                onClick={goToNextQuestion}
                disabled={!selectedOption}
                className={`flex items-center space-x-2 rounded-xl px-8 py-4 font-semibold text-white shadow-lg transition-all duration-150 ${
                  selectedOption 
                    ? "bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 hover:shadow-xl" 
                    : "bg-gray-300 cursor-not-allowed"
                }`}
                whileHover={selectedOption ? { scale: 1.05 } : {}}
                whileTap={selectedOption ? { scale: 0.95 } : {}}
                animate={selectedOption ? { 
                  boxShadow: "0 10px 25px rgba(59, 130, 246, 0.3)" 
                } : {}}
              >
                <span>
                  {currentQuestion === questions.length ? "Complete Survey" : "Next Question"}
                </span>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </motion.button>
            </motion.div>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
};

export default QuestionPage;

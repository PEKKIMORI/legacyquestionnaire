import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { db } from "./../../../firebase";
import { doc, collection, updateDoc, addDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./../../../firebase";
import Papa from "papaparse";
import { motion } from "framer-motion";
import ProgressBar from "../../components/ProgressBar";
import { sanitizeInput, validateInput, rateLimiter } from "../../utils/security";

interface QuestionData {
  ILO: string;
  Question: string;
  Group_A?: string;
  Group_B?: string;
  Group_C?: string;
  Group_D?: string;
  Group_E?: string;
  Option_A?: string;
  Option_B?: string;
  Option_C?: string;
  Option_D?: string;
  Option_E?: string;
}

type GroupedQuestions = Record<string, QuestionData[]>;

// Helper to fetch and parse CSV
const useQuestionsFromCSV = () => {
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  useEffect(() => {
    fetch("/legacy_questions.csv")
      .then((res) => res.text())
      .then((csv) => {        const parsed = Papa.parse(csv, { header: true });
          // Define ILO order to ensure consistent sequencing
        const iloOrder = ['CR', 'IC', 'PD', 'SW', 'IE'];
        
        // Group by ILO
        const grouped: GroupedQuestions = {};
        parsed.data.forEach((row: unknown) => {
          const questionRow = row as QuestionData;
          if (questionRow.ILO && questionRow.Question) { // Ensure valid row
            if (!grouped[questionRow.ILO]) grouped[questionRow.ILO] = [];
            grouped[questionRow.ILO]?.push(questionRow);
          }
        });
          // Take 5 random questions from each ILO
        const selected: QuestionData[] = [];
        iloOrder.forEach((ilo) => {
          const arr = grouped[ilo] ?? [];
          if (arr.length > 0) {
            // Shuffle questions within this ILO using Fisher-Yates algorithm
            const shuffledArr = [...arr];
            for (let i = shuffledArr.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              const temp = shuffledArr[i];
              if (temp && shuffledArr[j]) {
                shuffledArr[i] = shuffledArr[j];
                shuffledArr[j] = temp;
              }
            }
            // Take up to 5 questions from this ILO
            const questionsFromThisILO = shuffledArr.slice(0, Math.min(5, shuffledArr.length));
            selected.push(...questionsFromThisILO);
            console.log(`Selected ${questionsFromThisILO.length} questions from ILO: ${ilo}`);
          }
        });
        
        // Randomize the order of all selected questions
        const finalQuestions = [...selected];
        for (let i = finalQuestions.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const temp = finalQuestions[i];
          if (temp && finalQuestions[j]) {
            finalQuestions[i] = finalQuestions[j];
            finalQuestions[j] = temp;
          }
        }        
        console.log(`Total questions selected: ${finalQuestions.length}`);
        console.log('Randomized question sequence by ILO:', finalQuestions.map(q => q.ILO));
        setQuestions(finalQuestions);
      })
      .catch((error) => {
        console.error("Error loading questions:", error);
      });
  }, []);  return questions;
};

// Helper functions to safely access question properties
const getGroupValue = (question: QuestionData, option: string): string => {
  const key = `Group_${option}` as keyof QuestionData;
  return question[key] ?? '';
};

const getOptionValue = (question: QuestionData, option: string): string => {
  const key = `Option_${option}` as keyof QuestionData;
  return question[key] ?? '';
};

const QuestionPage: React.FC = () => {
  const router = useRouter();
  const { questionId } = router.query;
  const questions = useQuestionsFromCSV();  const [selectedOption, setSelectedOption] = useState<string>("");
  const [currentQuestion, setCurrentQuestion] = useState<number>(1);
  const [responseId, setResponseId] = useState<string | null>(null);  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string>("");

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
      const sanitizedQuestionId = sanitizeInput.text(questionId as string);
      const parsedQuestionId = parseInt(sanitizedQuestionId);
      
      if (!validateInput.questionId(sanitizedQuestionId) || isNaN(parsedQuestionId) || parsedQuestionId < 1) {
        // Invalid question ID, redirect to first question
        void router.replace('/questions/1');
        return;
      }
      
      setCurrentQuestion(parsedQuestionId);
    }
  }, [questionId, router]);

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
    const sanitizedValue = sanitizeInput.text(value);
    
    if (!validateInput.text(sanitizedValue, 1, 500)) {
      setValidationError("Please select a valid option");
      return;
    }
    
    setValidationError("");
    setSelectedOption(sanitizedValue);
  };
  const goToNextQuestion = async () => {
    if (!user) {
      setValidationError("You must be signed in to submit your answers.");
      return;
    }

    if (!selectedOption.trim()) {
      setValidationError("Please select an answer before continuing.");
      return;
    }

    // Rate limiting check
    const userId = user.uid;
    if (rateLimiter.isRateLimited(`question-${userId}`, 30, 60 * 1000)) {
      setValidationError("You're submitting answers too quickly. Please wait a moment.");
      return;
    }

    setIsSubmitting(true);
    setValidationError("");

    // Smooth scroll to top before navigation
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Create a unique question identifier with sanitized data
    const sanitizedQuestionIndex = sanitizeInput.number(currentQuestion.toString());
    const sanitizedILO = sanitizeInput.text(question.ILO || '');
    const sanitizedAnswer = sanitizeInput.text(selectedOption);
    const sanitizedQuestion = sanitizeInput.text(question.Question || '');
    
    if (!sanitizedQuestionIndex || !sanitizedILO || !sanitizedAnswer || !sanitizedQuestion) {
      setValidationError("Invalid data detected. Please try again.");
      setIsSubmitting(false);
      return;
    }

    const questionKey = `q${sanitizedQuestionIndex}_${sanitizedILO}`;
    
    const responseData = {
      [questionKey]: {
        answer: sanitizedAnswer,
        question: sanitizedQuestion,
        questionIndex: sanitizedQuestionIndex,
        ilo: sanitizedILO,
        timestamp: new Date()
      }
    };

    try {
      if (!responseId) {
        // Create new response document on first question
        const newResponseData = {
          userId: user.uid,
          userEmail: sanitizeInput.email(user.email ?? ''),
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
      setValidationError("Failed to save response. Please try again.");
    } finally {
      setIsSubmitting(false);
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
              <div className="space-y-3">                {["A","B","C","D","E"].map((opt, _index) => (
                  <motion.label
                    key={opt}
                    className={`group relative block cursor-pointer rounded-xl border-2 p-6 ${
                      selectedOption === getGroupValue(question, opt)
                        ? "border-blue-500 bg-blue-50 shadow-md"
                        : "border-gray-200 bg-white"
                    }`}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2 }}
                    whileHover={{ 
                      scale: 1.02,
                      borderColor: selectedOption === getGroupValue(question, opt) ? "#3b82f6" : "#9ca3af",
                      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
                      transition: { duration: 0.05 }
                    }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="flex items-center">
                      <input
                        type="radio"
                        name={`question${currentQuestion}`}
                        value={getGroupValue(question, opt)}
                        checked={selectedOption === getGroupValue(question, opt)}
                        onChange={() => handleOptionChange(getGroupValue(question, opt))}
                        className="h-5 w-5 text-blue-600 border-gray-300 focus:ring-0 focus:outline-none mr-4 flex-shrink-0"
                      />
                      <span className="text-lg text-gray-800 leading-relaxed group-hover:text-gray-900">
                        {getOptionValue(question, opt)}
                      </span>
                    </div>
                    {selectedOption === getGroupValue(question, opt)}
                  </motion.label>
                ))}
              </div>
            </motion.form>

            <motion.div
              className="mt-8 flex justify-end"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >              <motion.button
                onClick={goToNextQuestion}
                disabled={!selectedOption || isSubmitting}
                className={`flex items-center space-x-2 rounded-xl px-8 py-4 font-semibold text-white shadow-lg transition-all duration-150 ${
                  selectedOption && !isSubmitting
                    ? "bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 hover:shadow-xl" 
                    : "bg-gray-300 cursor-not-allowed"
                }`}
                whileHover={selectedOption && !isSubmitting ? { scale: 1.05 } : {}}
                whileTap={selectedOption && !isSubmitting ? { scale: 0.95 } : {}}
                animate={selectedOption && !isSubmitting ? { 
                  boxShadow: "0 10px 25px rgba(59, 130, 246, 0.3)" 
                } : {}}
              >
                <span>
                  {isSubmitting ? "Saving..." : currentQuestion === questions.length ? "Complete Survey" : "Next Question"}
                </span>
                {!isSubmitting && (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </motion.button>
            </motion.div>
            
            {/* Error Message */}
            {validationError && (
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 text-sm text-red-600 text-center"
              >
                {validationError}
              </motion.p>
            )}
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
};

export default QuestionPage;

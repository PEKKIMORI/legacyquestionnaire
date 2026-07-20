import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { motion } from "framer-motion";
import { auth, db } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import type { User } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { animationVariants, interactions } from "~/utils/animationUtils";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SortableItem } from "~/components/SortableItem";
import { useLegacies, getLegacyGroups, type Legacy } from "~/utils/legacies";
import ProgressBar from "~/components/ProgressBar";

// Extend Window interface to include lastPointerY
declare global {
  interface Window {
    lastPointerY?: number;
  }
}

// Helper to detect if device is mobile
function isMobileDevice() {
  if (typeof window === "undefined") return false;
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    )
  );
}

const SortingPage: React.FC = () => {
  const router = useRouter();
  const { responseId } = router.query;
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0);
  const legacies = useLegacies();
  const [legacyGroups, setLegacyGroups] = useState<Legacy[][]>([]);
  const [items, setItems] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const autoScrollInterval = useRef<NodeJS.Timeout | null>(null);
  const resumedRef = useRef(false);

  // Returning users resume at their first unfinished group instead of
  // restarting from group 0 (their earlier rankings are already saved).
  useEffect(() => {
    const resume = async () => {
      if (resumedRef.current) return;
      if (!user || !responseId || legacyGroups.length === 0) return;
      resumedRef.current = true;
      try {
        const snapshot = await getDoc(
          doc(db, "responses", responseId as string),
        );
        if (!snapshot.exists()) return;
        const data = snapshot.data() as Record<string, unknown>;
        let firstUnfinished = 0;
        while (
          firstUnfinished < legacyGroups.length &&
          data[`sorting_group_${firstUnfinished}`] !== undefined
        ) {
          firstUnfinished++;
        }
        const target = Math.min(firstUnfinished, legacyGroups.length - 1);
        if (target > 0) setCurrentGroupIndex(target);
      } catch (error) {
        console.error("Error resuming sorting progress:", error);
      }
    };
    void resume();
  }, [user, responseId, legacyGroups]);

  useEffect(() => {
    if (legacies.length > 0) {
      const groups = getLegacyGroups(legacies);
      setLegacyGroups(groups);
      const currentGroup = groups[currentGroupIndex];
      if (currentGroup) {
        setItems(currentGroup.map((legacy) => legacy.name));
      }
    }
  }, [legacies, currentGroupIndex]);

  // Cleanup drag state on component unmount
  useEffect(() => {
    return () => {
      document.body.classList.remove("dragging");
      document.body.style.overflow = "";
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String((event.active as { id: string }).id));
    setIsDragging(true);
    // Prevent body scroll on desktop only
    if (!isMobileDevice()) {
      document.body.classList.add("dragging");
      document.body.style.overflow = "hidden";
    }
    // Start auto-scroll interval
    if (autoScrollInterval.current) clearInterval(autoScrollInterval.current);
    autoScrollInterval.current = setInterval(() => {
      const vh = window.innerHeight;
      const pointerY = window.lastPointerY;
      if (pointerY !== undefined) {
        if (pointerY > vh - 80) {
          window.scrollBy({ top: 20, behavior: "smooth" });
        } else if (pointerY < 80) {
          window.scrollBy({ top: -20, behavior: "smooth" });
        }
      }
    }, 50);
  };

  // Listen to pointermove to track pointer Y position
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      window.lastPointerY = e.clientY;
    };
    window.addEventListener("pointermove", handler);
    return () => {
      window.removeEventListener("pointermove", handler);
      delete window.lastPointerY;
    };
  }, []);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && (active as { id: string }).id !== (over as { id: string }).id) {
      setItems((currentItems) => {
        const oldIndex = currentItems.indexOf(
          String((active as { id: string }).id),
        );
        const newIndex = currentItems.indexOf(
          String((over as { id: string }).id),
        );
        return arrayMove(currentItems, oldIndex, newIndex);
      });
    }

    setActiveId(null);
    setIsDragging(false);
    // Restore body scroll after drag (desktop only)
    if (!isMobileDevice()) {
      document.body.classList.remove("dragging");
      document.body.style.overflow = "";
    }
    // Stop auto-scroll
    if (autoScrollInterval.current) {
      clearInterval(autoScrollInterval.current);
      autoScrollInterval.current = null;
    }
  };

  // Monitor auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Show loading while auth state is being determined
  if (authLoading) {
    return <div>Loading...</div>;
  }

  // Redirect to login if not authenticated
  if (!user) {
    void router.push("/");
    return <div>Redirecting to login...</div>;
  }

  const handleNext = async () => {
    if (!user || !responseId) {
      console.error("User or responseId not available");
      return;
    }

    setIsSubmitting(true);

    const groupKey = `sorting_group_${currentGroupIndex}`;
    const sortedData = {
      order: items,
      timestamp: new Date(),
    };

    try {
      await updateDoc(doc(db, "responses", responseId as string), {
        [groupKey]: sortedData,
        lastUpdated: new Date(),
      });

      if (currentGroupIndex < legacyGroups.length - 1) {
        const nextGroupIndex = currentGroupIndex + 1;
        const nextGroup = legacyGroups[nextGroupIndex];
        if (nextGroup) {
          setItems(nextGroup.map((legacy) => legacy.name));
        }
        setCurrentGroupIndex(nextGroupIndex);
      } else {
        await updateDoc(doc(db, "responses", responseId as string), {
          sortingCompleted: true,
          sortingCompletedAt: new Date(),
        });
        void router.push("/Final");
      }
    } catch (error) {
      console.error("Error saving sorted data:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getProgressMessage = () => {
    const progress = (currentGroupIndex + 1) / legacyGroups.length;
    if (progress < 0.25) {
      return "It's the last set!";
    }
    if (progress < 0.5) {
      return "Making good progress!";
    }
    if (progress < 0.75) {
      return "You're doing great!";
    }
    return "You're almost there!";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <ProgressBar
        current={currentGroupIndex + 1}
        total={legacyGroups.length}
        isCompleted={
          currentGroupIndex === legacyGroups.length - 1 && isSubmitting
        }
      />
      <main className="container mx-auto flex min-h-screen flex-col items-center justify-center p-6 pt-32">
        <motion.div
          className="w-full max-w-2xl"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <motion.div
            className="rounded-xl bg-white p-8 shadow-xl"
            {...animationVariants.fadeIn}
          >
            <motion.div
              className="mb-6 text-center"
              {...animationVariants.slideUp}
            >
              <h1 className="mb-2 text-3xl font-bold text-gray-900">
                Sort Your Mottos!
              </h1>

              <p className="bg-gradient-to-r from-red-500 via-blue-400 to-purple-500 bg-clip-text font-bold text-transparent">
                {getProgressMessage()}
              </p>
              <p className="mt-2 text-gray-600">
                <span className="hidden sm:inline">Drag and drop</span>
                <span className="sm:hidden">Touch and drag</span> to rank the
                following statements from most important to least important.
              </p>
              <p className="mt-1 text-sm text-gray-500">
                <span className="sm:hidden">
                  Tip: Press and hold each item, then drag to reorder
                </span>
                <span className="hidden sm:inline">
                  Use the drag handles on the right to reorder items
                </span>
              </p>
            </motion.div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={items}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {items.map((id, index) => (
                    <SortableItem key={id} id={id}>
                      <motion.div
                        layoutId={id}
                        className={`sortable-item group relative block cursor-grab rounded-xl border-2 border-gray-200 bg-white p-6 shadow-sm transition-all duration-200 active:cursor-grabbing active:border-blue-500 active:bg-blue-50 ${
                          isDragging && activeId === id
                            ? "scale-105 opacity-50"
                            : ""
                        }`}
                        whileHover={interactions.cardHover}
                        whileTap={interactions.tap}
                        style={{
                          touchAction: "none",
                          userSelect: "none",
                          WebkitUserSelect: "none",
                          MozUserSelect: "none",
                          msUserSelect: "none",
                        }}
                      >
                        <div className="flex items-center">
                          <span className="mr-4 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-lg font-bold text-gray-500 transition-colors group-active:bg-blue-100 group-active:text-blue-600">
                            {index + 1}
                          </span>
                          <span className="flex-grow text-left text-lg leading-relaxed text-gray-800 group-hover:text-gray-900">
                            {legacyGroups[currentGroupIndex]?.find(
                              (legacy) => legacy.name === id,
                            )?.text ?? ""}
                          </span>
                          <div className="ml-4 flex-shrink-0 opacity-40 transition-opacity group-hover:opacity-60">
                            <svg
                              className="h-6 w-6 text-gray-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 8h16M4 16h16"
                              />
                            </svg>
                          </div>
                        </div>
                      </motion.div>
                    </SortableItem>
                  ))}
                </div>
              </SortableContext>
              <DragOverlay>
                {activeId ? (
                  <motion.div
                    layoutId={activeId}
                    className="group relative block scale-105 transform cursor-grabbing rounded-xl border-2 border-blue-500 bg-blue-50 p-6 text-center shadow-xl"
                    style={{
                      touchAction: "none",
                      userSelect: "none",
                      WebkitUserSelect: "none",
                      MozUserSelect: "none",
                      msUserSelect: "none",
                      zIndex: 1000,
                    }}
                  >
                    <div className="flex items-center">
                      <span className="mr-4 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-lg font-bold text-blue-600">
                        {activeId ? items.indexOf(activeId) + 1 : 0}
                      </span>
                      <span className="flex-grow text-lg leading-relaxed text-gray-800 group-hover:text-gray-900">
                        {legacyGroups[currentGroupIndex]?.find(
                          (legacy) => legacy.name === activeId,
                        )?.text ?? ""}
                      </span>
                      <div className="ml-4 flex-shrink-0 opacity-60">
                        <svg
                          className="h-6 w-6 text-blue-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 8h16M4 16h16"
                          />
                        </svg>
                      </div>
                    </div>
                  </motion.div>
                ) : null}
              </DragOverlay>
            </DndContext>

            <div className="mt-8 flex justify-end">
              <motion.button
                onClick={handleNext}
                disabled={isSubmitting}
                className={`flex items-center space-x-2 rounded-xl px-8 py-4 font-semibold text-white shadow-lg transition-all duration-150 ${
                  !isSubmitting
                    ? "bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 hover:shadow-xl"
                    : "cursor-not-allowed bg-gray-300"
                }`}
                whileHover={!isSubmitting ? interactions.buttonHover : {}}
                whileTap={!isSubmitting ? interactions.tap : {}}
              >
                <span>
                  {isSubmitting
                    ? "Saving..."
                    : currentGroupIndex < legacyGroups.length - 1
                      ? "Next Group"
                      : "Submit Rankings"}
                </span>
                {!isSubmitting && (
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                )}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
};

export default SortingPage;

'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Star, Sparkles, RefreshCw, Send, Lightbulb, Loader2, CheckCircle2, User } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import Confetti from 'react-confetti'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const useAutoResizeTextArea = (value: string) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = ref.current.scrollHeight + 'px';
    }
  }, [value]);

  return ref;
};

const AutoResizeTextArea = ({ value, onChange, readOnly = false, className = '', ...props }: {
  value: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  readOnly?: boolean;
  className?: string;
  [key: string]: any;
}) => {
  const textareaRef = useAutoResizeTextArea(value);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={onChange}
      readOnly={readOnly}
      className={`w-full resize-none overflow-hidden ${className}`}
      {...props}
    />
  );
};

interface Persona {
  name: string;
  role: string;
  background: string;
  core_expertise: string[];
  cognitive_approach: string;
  values_and_motivations: string;
  communication_style: string;
  notable_trait: string;
  rationale: string;
}

interface QuestionImproverResponse {
  improved_question: string;
  final_answer: string;
  summary: string;
  rationale: string;
}

const reasoningStages = [
  { name: "Initial Analysis", description: "Analyzing the original question and identifying key themes and concepts." },
  { name: "Persona Insights", description: "Gathering unique perspectives from each selected persona." },
  { name: "Critical Evaluation", description: "Critically examining and challenging the initial insights." },
  { name: "Synthesis", description: "Combining and integrating the diverse perspectives and critiques." },
  { name: "Refinement", description: "Polishing and enhancing the synthesized ideas." },
  { name: "Final Convergence", description: "Arriving at a collective agreement on the improved question." },
  { name: "Output Generation", description: "Formulating the final refined question and supporting insights." }
]

const BrainAnimation = () => (
  <svg className="w-24 h-24" viewBox="0 0 100 100">
    <motion.path
      d="M50 10 C 20 10, 10 30, 10 50 C 10 70, 20 90, 50 90 C 80 90, 90 70, 90 50 C 90 30, 80 10, 50 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="4"
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 2, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
    />
    <motion.circle
      cx="50"
      cy="50"
      r="5"
      fill="currentColor"
      initial={{ scale: 0 }}
      animate={{ scale: [0, 1.5, 0] }}
      transition={{ duration: 2, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
    />
  </svg>
)

const convertMarkdownToBold = (text: string | undefined | null) => {
  if (!text) return null;  // Return null if text is undefined or null
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
};

export default function QuestionImprover() {
  // Define all state variables
  const [question, setQuestion] = useState('')
  const [isLoadingPersonas, setIsLoadingPersonas] = useState(false)
  const [isProcessingQuestion, setIsProcessingQuestion] = useState(false)
  const [currentStage, setCurrentStage] = useState(0)
  const [currentStageProgress, setCurrentStageProgress] = useState(0)
  const [animationComplete, setAnimationComplete] = useState(false)
  const [refinedQuestion, setRefinedQuestion] = useState("")
  const [refinementRationale, setRefinementRationale] = useState("")
  const [bestAnswer, setBestAnswer] = useState("")
  const [conversationJourney, setConversationJourney] = useState("")
  const [harmonyPrinciple, setHarmonyPrinciple] = useState("")
  const [individualAnswers, setIndividualAnswers] = useState<string | null>(null)
  const [feedbackRating, setFeedbackRating] = useState(0)
  const [feedbackComment, setFeedbackComment] = useState('')
  const [showResults, setShowResults] = useState(false)
  const [newDimensions, setNewDimensions] = useState<string | null>(null)
  const [showNewDimensions, setShowNewDimensions] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPersonas, setSelectedPersonas] = useState<Persona[]>([])
  const [showPersonas, setShowPersonas] = useState(false)
  const [showInsights, setShowInsights] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [iterationCount, setIterationCount] = useState(0)
  const [personasReady, setPersonasReady] = useState(false);
  const [processComplete, setProcessComplete] = useState(false);

  const memoizedSelectedPersonas = useMemo(() => selectedPersonas, [selectedPersonas]);

  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isProcessingQuestion) {
      const interval = setInterval(() => {
        setCurrentStageProgress(prev => {
          if (prev >= 1) {
            setCurrentStage(currentStage => {
              if (currentStage >= reasoningStages.length - 2) {
                // Stop at the second-to-last stage (Output Generation)
                clearInterval(interval);
                return reasoningStages.length - 1;
              }
              return currentStage + 1;
            });
            return 0;
          }
          return prev + 0.1;
        });
      }, 500);
      return () => clearInterval(interval);
    }
  }, [isProcessingQuestion]);

  useEffect(() => {
    if (showResults && resultsRef.current) {
      resultsRef.current.focus();
    }
  }, [showResults]);

  const handleSubmit = useCallback(async () => {
    if (question.trim()) {
      setIsLoadingPersonas(true);
      setIsProcessingQuestion(false);
      setCurrentStage(0);
      setCurrentStageProgress(0);
      setAnimationComplete(false);
      setShowResults(false);
      setShowPersonas(false);
      setShowInsights(false);
      setError(null);
      setPersonasReady(false);
      setProcessComplete(false);
  
      try {
        // Persona selection request
        const personaResponse = await fetch('http://localhost:8000/select-personas', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text: question }),
        });
  
        if (!personaResponse.ok) {
          throw new Error(`HTTP error! status: ${personaResponse.status}`);
        }
  
        const personaData = await personaResponse.json();
        setSelectedPersonas(personaData.personas);
        setIsLoadingPersonas(false);
        setPersonasReady(true);
        setShowPersonas(true);
  
        // Start processing the question
        setIsProcessingQuestion(true);
  
        // Question improvement request
        const improvementResponse = await fetch('http://localhost:8000/improve-question', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text: question, personas: personaData.personas }),
        });
  
        if (!improvementResponse.ok) {
          throw new Error(`HTTP error! status: ${improvementResponse.status}`);
        }
  
        const improvementData: QuestionImproverResponse = await improvementResponse.json();
      
        // Ensure we're at the Output Generation stage
        setCurrentStage(reasoningStages.length - 1);
        setCurrentStageProgress(0);

        // Short delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        setRefinedQuestion(improvementData.improved_question);
        setRefinementRationale(improvementData.rationale);
        setBestAnswer(improvementData.final_answer);
        setConversationJourney(improvementData.summary);
        setHarmonyPrinciple(improvementData.harmony_principle);
        setIndividualAnswers(improvementData.individual_answers || '');
        setNewDimensions(improvementData.new_dimensions);
        
        // Complete the Output Generation stage
        setCurrentStageProgress(1);

        setIsProcessingQuestion(false);
        setAnimationComplete(true);
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 7000);
        setIterationCount(prev => prev + 1);

        setShowResults(true);
        setShowInsights(true);
        setProcessComplete(true);
      } catch (error) {
        console.error('Error:', error);
        setError(`An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setIsLoadingPersonas(false);
        setIsProcessingQuestion(false);
        setShowPersonas(false);
        setPersonasReady(false);
        setProcessComplete(false);
      }
    }
  }, [question]);

  const handleIterate = useCallback(() => {
    setQuestion(refinedQuestion)
    setShowPersonas(false)
    setShowInsights(false)
    handleSubmit()
  }, [refinedQuestion, handleSubmit]);

  const handleExplore = useCallback(() => {
    setShowNewDimensions(true);
  }, []);

  const handleFeedbackSubmit = useCallback(() => {
    console.log(`Feedback submitted: Rating: ${feedbackRating}, Comment: ${feedbackComment}`)
    setFeedbackRating(0)
    setFeedbackComment('')
  }, [feedbackRating, feedbackComment]);

  const PersonaCard = React.memo(({ persona }: { persona: Persona }) => {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 space-y-2 cursor-pointer">
              <div className="flex items-center space-x-2">
                <User className="w-6 h-6 text-amber-500" />
                <h3 className="text-lg font-semibold text-amber-700 dark:text-amber-300">{persona.role}</h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {persona.rationale ? persona.rationale : 'No rationale provided'}
              </p>
            </div>
          </TooltipTrigger>
          <TooltipContent className="w-80 p-4">
            <div className="space-y-2">
              <h4 className="font-bold text-lg">{persona.name}</h4>
              <p><span className="font-semibold">Role:</span> {persona.role}</p>
              <p><span className="font-semibold">Background:</span> {persona.background}</p>
              <p><span className="font-semibold">Core Expertise:</span> {persona.core_expertise.join(', ')}</p>
              <p><span className="font-semibold">Cognitive Approach:</span> {persona.cognitive_approach}</p>
              <p><span className="font-semibold">Values and Motivations:</span> {persona.values_and_motivations}</p>
              <p><span className="font-semibold">Communication Style:</span> {persona.communication_style}</p>
              <p><span className="font-semibold">Notable Trait:</span> {persona.notable_trait}</p>
              <p><span className="font-semibold">Rationale:</span> {persona.rationale || 'No rationale provided'}</p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  });

  const SelectedPersonasSection = React.memo(() => {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold text-amber-700 dark:text-amber-300">Selected Personas</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {memoizedSelectedPersonas.map((persona) => (
            <PersonaCard key={persona.name} persona={persona} />
          ))}
        </div>
      </div>
    );
  });

  return (
    <div className="min-h-screen p-8 bg-gradient-to-br from-amber-50 to-rose-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
      {showConfetti && <Confetti />}
      <Card className="w-full max-w-4xl overflow-hidden shadow-2xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-md">
        <CardHeader className="bg-gradient-to-r from-amber-400 to-rose-400 text-white p-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Sparkles className="w-10 h-10" />
              <CardTitle className="text-3xl font-bold">QuestionCrafter</CardTitle>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-lg font-semibold">Iterations: {iterationCount}</span>
              <RefreshCw className="w-6 h-6 animate-spin" style={{ animationDuration: '4s' }} />
            </div>
          </div>
          <CardDescription className="text-gray-100 mt-4 text-lg">Elevate your thinking with AI-powered question refinement</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8 p-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-4"
          >
            <Label htmlFor="question" className="text-xl font-semibold text-amber-700 dark:text-amber-300">Your Question</Label>
            <AutoResizeTextArea
              id="question"
              placeholder="Enter your thought-provoking question here..."
              value={question}
              onChange={(e) => setQuestion(e.target.value.slice(0, 500))}
              className="min-h-[120px] text-lg transition-all duration-300 focus:ring-2 focus:ring-amber-500 p-3 rounded-md border border-amber-200 dark:border-amber-700 bg-white/50 dark:bg-gray-700/50"
            />
            <p className="text-sm text-gray-500">{500 - question.length} characters remaining</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Button 
              onClick={handleSubmit} 
              disabled={isLoadingPersonas || isProcessingQuestion || !question.trim()}
              className="w-full py-6 text-lg font-semibold bg-gradient-to-r from-amber-400 to-rose-400 hover:from-amber-500 hover:to-rose-500 text-white transition-all duration-300"
            >
              {isLoadingPersonas || isProcessingQuestion ? (
                <>
                  <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5 mr-2" />
                  Refine My Question
                </>
              )}
            </Button>
          </motion.div>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <Alert variant="destructive">
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {isLoadingPersonas && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex flex-col items-center justify-center space-y-4"
              >
                <BrainAnimation />
                <p className="text-lg font-medium text-amber-600 dark:text-amber-400">Selecting personas...</p>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {personasReady && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.5 }}
              >
                <SelectedPersonasSection />
              </motion.div>
            )}
          </AnimatePresence>

          {(isProcessingQuestion || processComplete) && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="space-y-6"
            >
              <Label className="text-2xl font-semibold text-amber-700 dark:text-amber-300">Reasoning Rhythm</Label>
              <div className="relative pt-1">
                <div className="overflow-hidden h-2 mb-4 text-xs flex rounded-full bg-amber-100 dark:bg-amber-900">
                  <motion.div
                    style={{ width: `${((currentStage + currentStageProgress) / reasoningStages.length) * 100}%` }}
                    className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-gradient-to-r from-amber-400 to-rose-400"
                    initial={{ width: 0 }}
                    animate={{ width: `${((currentStage + currentStageProgress) / reasoningStages.length) * 100}%` }}
                    transition={{ duration: 0.5 }}
                  ></motion.div>
                </div>
                <div className="flex justify-between">
                  {reasoningStages.map((stage, index) => (
                    <motion.div
                      key={stage.name}
                      className={`text-center transition-all duration-500 ${
                        index <= currentStage ? 'opacity-100 transform translate-y-0' : 'opacity-50 transform translate-y-2'
                      }`}
                      style={{ width: `${100 / reasoningStages.length}%` }}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: index * 0.1 }}
                    >
                      <motion.div
                        className={`w-4 h-4 mx-auto rounded-full flex items-center justify-center ${
                          index < currentStage || (index === currentStage && currentStageProgress >= 1)
                            ? 'bg-gradient-to-r from-amber-400 to-rose-400'
                            : 'bg-amber-200 dark:bg-amber-800'
                        }`}
                        initial={{ scale: 0 }}
                        animate={{ scale: index <= currentStage ? 1 : 0.5 }}
                        transition={{ duration: 0.2 }}
                      >
                        {(index < currentStage || (index === currentStage && currentStageProgress >= 1)) && 
                          <CheckCircle2 className="w-3 h-3 text-white" />
                        }
                      </motion.div>
                      <div className="text-xs font-semibold mt-1 text-amber-700 dark:text-amber-300">
                        {stage.name}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
              {!processComplete && (
                <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/30 rounded-lg">
                  <h3 className="text-lg font-semibold text-amber-700 dark:text-amber-300 mb-2">
                    {reasoningStages[currentStage].name}
                  </h3>
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    {reasoningStages[currentStage].description}
                  </p>
                </div>
              )}
            </motion.div>
          )}

          <AnimatePresence>
            {showInsights && (
              <motion.div
                ref={resultsRef}
                tabIndex={-1}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.5 }}
                className="space-y-8"
                aria-live="polite"
              >
                <div className="space-y-4">
                  <Label className="text-2xl font-semibold text-amber-700 dark:text-amber-300">Refined Question</Label>
                  <AutoResizeTextArea
                    value={refinedQuestion}
                    readOnly
                    className="text-lg font-medium bg-amber-50 dark:bg-amber-900/30 dark:text-amber-100 border-amber-200 dark:border-amber-700 transition-all duration-300 p-3 rounded-md"
                  />
                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="rationale">
                      <AccordionTrigger className="text-amber-700 dark:text-amber-300">Rationale for Refinement</AccordionTrigger>
                      <AccordionContent>
                        <p className="text-sm whitespace-pre-line text-amber-800 dark:text-amber-200">{refinementRationale}</p>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                  <div className="flex space-x-4 mt-6">
                    <Button onClick={handleIterate} className="flex-1 bg-gradient-to-r from-amber-400 to-rose-400 hover:from-amber-500 hover:to-rose-500 text-white transition-all duration-300">
                      <CheckCircle2 className="mr-2 h-5 w-5" />
                      Iterate Again
                    </Button>
                    <Button onClick={handleExplore} className="flex-1 bg-gradient-to-r from-rose-400 to-pink-400 hover:from-rose-500 hover:to-pink-500 text-white transition-all duration-300">Explore New Dimensions</Button>
                  </div>
                </div>

                <div className="space-y-6 bg-rose-50 dark:bg-rose-900/30 rounded-lg p-8">
                  <Label className="text-2xl font-semibold text-rose-800 dark:text-rose-200">Insights</Label>
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="best-answer" className="text-xl font-medium text-rose-700 dark:text-rose-300">Synthesized Insights</Label>
                      <AutoResizeTextArea
                        id="best-answer"
                        value={bestAnswer}
                        readOnly
                        className="bg-white dark:bg-gray-800 border-rose-200 dark:border-rose-700 transition-all duration-300 p-3 rounded-md w-full"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="harmony-principle" className="text-xl font-medium text-rose-700 dark:text-rose-300">Shared Fundamental Principle</Label>
                      <AutoResizeTextArea
                        id="harmony-principle"
                        value={harmonyPrinciple}
                        readOnly
                        className="bg-white dark:bg-gray-800 border-rose-200 dark:border-rose-700 transition-all duration-300 p-3 rounded-md w-full"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="conversation-journey" className="text-xl font-medium text-rose-700 dark:text-rose-300">Summary of the Conversation's Journey</Label>
                      <AutoResizeTextArea
                        id="conversation-journey"
                        value={conversationJourney}
                        readOnly
                        className="bg-white dark:bg-gray-800 border-rose-200 dark:border-rose-700 transition-all duration-300 p-3 rounded-md w-full"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <Label className="text-lg font-semibold text-amber-700 dark:text-amber-300">Provide Feedback</Label>
                  <div className="flex items-center justify-center space-x-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-8 h-8 cursor-pointer transition-colors duration-200 ${
                          star <= feedbackRating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300 dark:text-gray-600'
                        }`}
                        onClick={() => setFeedbackRating(star)}
                      />
                    ))}
                  </div>
                  <AutoResizeTextArea
                    placeholder="Your thoughts on the refined question..."
                    value={feedbackComment}
                    onChange={(e) => setFeedbackComment(e.target.value)}
                    className="min-h-[100px] bg-white/50 dark:bg-gray-700/50 border-amber-200 dark:border-amber-700 p-3 rounded-md"
                  />
                  <Button onClick={handleFeedbackSubmit} className="w-full bg-gradient-to-r from-amber-400 to-rose-400 hover:from-amber-500 hover:to-rose-500 text-white transition-all duration-300">
                    <Lightbulb className="w-5 h-5 mr-2" />
                    Submit Feedback
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
        <CardFooter className="flex justify-between items-center bg-amber-50 dark:bg-amber-900/30 p-6">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Created by PolyReason Labs. Happy Inquiring!
          </p>
        </CardFooter>
      </Card>
      <Dialog open={showNewDimensions} onOpenChange={setShowNewDimensions}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Explore New Dimensions</DialogTitle>
            <DialogDescription>
              Review individual perspectives and discover new pathways for exploration.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-6">
            <div>
              <h3 className="text-lg font-bold mb-2">Individual Persona Answers</h3>
              <div className="w-full p-4 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md whitespace-pre-wrap">
                {individualAnswers ? convertMarkdownToBold(individualAnswers) : 'No individual answers available.'}
              </div>
            </div>
            <div>
              <h3 className="text-lg font-bold mb-2">New Dimensions and Resources</h3>
              <div className="w-full p-4 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md whitespace-pre-wrap">
                {newDimensions ? convertMarkdownToBold(newDimensions) : 'No new dimensions available.'}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
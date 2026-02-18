'use client';

import React, { useRef, useEffect } from 'react';
import { useReactToPrint } from 'react-to-print';
import { Toaster, toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { Printer, BookOpen, PanelRightOpen, X, Moon, Sun, Sparkles, CheckCircle, RotateCcw } from 'lucide-react';
import { ChatInterface } from '@/components/ChatInterface';
import { LessonPlan } from '@/components/LessonPlan';
import { PennyFrame } from '@/components/PennyFrame';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';
import { Message } from '@/types';
import { extractLessonPlanFromResponse, containsLessonPlanDraft, extractStudentMaterials } from '@/lib/lessonPlanParser';

export default function HomePage() {
  const { 
    messages, isTyping, lessonPlan, isPlanOpen, hasPlanUpdated, theme, conversationPhase,
    setMessages, setIsTyping, setLessonPlan, setIsPlanOpen, setHasPlanUpdated, addMessage, toggleTheme, setConversationPhase, resetConversation
  } = useStore();

  const componentRef = useRef<HTMLDivElement>(null);

  // Print Handler
  const handlePrint = useReactToPrint({
    contentRef: componentRef,
    documentTitle: `Lesson Plan - ${lessonPlan.title || 'Untitled'}`,
    onBeforeGetContent: () => {
      toast.info("Preparing your lesson plan package...");
    },
    onAfterPrint: () => {
      toast.success("Lesson plan downloaded successfully!");
    }
  });

  // Chat Handler - Now calls real Poe API
  const handleSendMessage = async (text: string) => {
    // Add user message
    const newMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date()
    };
    addMessage(newMessage);
    setIsTyping(true);

    try {
      // Build conversation history for context
      const conversationHistory = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
      conversationHistory.push({ role: 'user', content: text });

      // Call our API route
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: conversationHistory,
          currentPlan: lessonPlan,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response from Penny');
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      
      // Create placeholder message for streaming
      const botMessageId = (Date.now() + 1).toString();
      const botMessage: Message = {
        id: botMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date()
      };
      addMessage(botMessage);
      setIsTyping(false);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          fullResponse += chunk;
          
          // Update the message content as we stream
          setMessages(prev => 
            prev.map(msg => 
              msg.id === botMessageId 
                ? { ...msg, content: fullResponse }
                : msg
            )
          );
        }
      }

      // Try to extract structured lesson plan data
      const extractedPlan = extractLessonPlanFromResponse(fullResponse);
      if (extractedPlan && Object.keys(extractedPlan).length > 0) {
        setLessonPlan(prev => ({ ...prev, ...extractedPlan }));
        setHasPlanUpdated(true);
        
        // Move to drafting phase if we have substantial content
        if (extractedPlan.title || extractedPlan.objectives?.length) {
          setConversationPhase('drafting');
        }
        
        toast.success("Lesson Plan Updated!", {
          action: {
            label: "View",
            onClick: () => setIsPlanOpen(true)
          }
        });
        
        // Also try to extract student materials
        const materials = extractStudentMaterials(fullResponse);
        if (materials) {
          // Update student materials in store if we add that
          console.log('Extracted student materials:', materials);
        }
      } else if (containsLessonPlanDraft(fullResponse) && conversationPhase === 'gathering') {
        // Penny has started drafting but didn't output JSON - move to drafting phase
        setConversationPhase('drafting');
        toast.info("Penny is drafting your lesson plan. Click 'Finalize' when ready to generate the full package.");
      }

    } catch (error) {
      console.error("Failed to fetch response:", error);
      setIsTyping(false);
      toast.error("Failed to generate response. Please try again.");
      
      // Add error message
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I apologize, but I encountered an error. Please try again.",
        timestamp: new Date()
      };
      addMessage(errorMessage);
    }
  };

  // Finalize lesson plan - triggers JSON extraction
  const handleFinalize = async () => {
    setIsTyping(true);
    
    const finalizePrompt = `Please finalize and output the complete lesson plan we've designed. Format your response as follows:

1. First, output the structured lesson plan data between [LESSON_PLAN_JSON] and [/LESSON_PLAN_JSON] tags using this exact JSON structure:

[LESSON_PLAN_JSON]
{
  "title": "Lesson title",
  "gradeLevel": "Grade level",
  "subject": "Subject area",
  "duration": "Time duration",
  "standard": "Standard(s) addressed",
  "objectives": ["Learning objective 1", "Learning objective 2"],
  "materials": ["Material 1", "Material 2"],
  "procedure": [
    {"step": "Set Purpose", "description": "Description of this phase including teacher and student moves"},
    {"step": "Modeling", "description": "I Do phase description"},
    {"step": "Guided Practice", "description": "We Do phase description"},
    {"step": "Independent Practice", "description": "You Do phase description"},
    {"step": "Closure", "description": "Wrap-up and exit slip"}
  ],
  "assessment": "Assessment description",
  "successCriteria": ["Criterion 1", "Criterion 2"],
  "supports": {
    "all": ["Support for all students"],
    "el": ["EL-specific supports"],
    "iep504": ["IEP/504 accommodations"]
  },
  "equityNotes": "Representation tags and equity considerations",
  "exitSlip": "Exit slip prompt aligned to DOK level",
  "rubric": [
    {"score": 0, "description": "No understanding demonstrated"},
    {"score": 1, "description": "Partial understanding"},
    {"score": 2, "description": "Approaching mastery"},
    {"score": 3, "description": "Full mastery with evidence"}
  ],
  "textOptions": [
    {"title": "Text title", "source": "Source", "lexile": "Lexile level", "url": "URL if available", "rationale": "Why this text", "selected": true}
  ],
  "teacherModifications": ["Optional modification 1", "Optional modification 2"]
}
[/LESSON_PLAN_JSON]

2. After the JSON, provide:
   - A brief summary for the teacher
   - Any sentence frames or graphic organizers that should be included in the student packet
   - Links to recommended texts (if not already included)

Make sure ALL accommodations are embedded within the procedure steps, not just listed separately.`;

    await handleSendMessage(finalizePrompt);
    setConversationPhase('complete');
  };

  return (
    <div 
      className={cn(
        "flex h-screen overflow-hidden font-['DM_Sans'] relative transition-colors duration-500",
        theme === 'coffee' ? "bg-[#2c241b] text-[#e8e6df]" : "bg-[#dcdcd1] text-[#1a1a1a]"
      )}
    >
      <Toaster position="top-center" toastOptions={{
        className: 'bg-[#1a1a1a] text-[#e8e6df] border-2 border-[#e8e6df] font-["DM_Sans"] shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)]',
      }} />

      {/* BACKGROUND TEXTURES */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.05] bg-[url('https://www.transparenttextures.com/patterns/aged-paper.png')] z-0 mix-blend-multiply"></div>
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[url('https://www.transparenttextures.com/patterns/noise-lines.png')] z-0 mix-blend-overlay"></div>

      {/* LEFT COLUMN: PENNY (Fixed Width) */}
      <div className={cn(
        "hidden lg:flex flex-col w-[450px] h-full p-8 border-r-4 z-10 relative shadow-2xl items-center justify-center shrink-0 transition-colors duration-500",
        theme === 'coffee' 
          ? "border-[#e8e6df]/20 bg-[#3e3226]" 
          : "border-[#1a1a1a] bg-[#e6e2d6]"
      )}>
        <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cardboard-flat.png')] opacity-10 pointer-events-none mix-blend-multiply"></div>
        
        <div className="relative z-10 scale-100 transition-transform duration-500 hover:scale-[1.02]">
          <PennyFrame size="xl" />
        </div>

        <div className="mt-12 text-center space-y-4 max-w-[300px] relative">
          <div className={cn("absolute -top-6 left-1/2 -translate-x-1/2 w-px h-12 transition-colors duration-500", theme === 'coffee' ? "bg-[#e8e6df]/20" : "bg-[#1a1a1a]/20")}></div>
          <div className={cn("h-1 w-24 mx-auto mb-6 transition-colors duration-500", theme === 'coffee' ? "bg-[#e8e6df]" : "bg-[#1a1a1a]")}></div>
          <p className="font-['Oswald'] text-2xl uppercase tracking-widest font-bold leading-tight">"Rigor without access is gatekeeping. Access without rigor is abandonment. True equity demands both."</p>
          <div className={cn("w-12 h-1 mx-auto transition-colors duration-500", theme === 'coffee' ? "bg-[#e8e6df]/20" : "bg-[#1a1a1a]/20")}></div>
          <p className="font-serif italic opacity-60 text-base">- Penny</p>
        </div>

        {/* Conversation Phase Indicator */}
        <div className="absolute bottom-24 left-0 w-full px-8">
          <div className={cn(
            "flex items-center justify-between text-xs uppercase tracking-widest font-bold p-3 border-2 transition-colors duration-500",
            theme === 'coffee' 
              ? "border-[#e8e6df]/20 bg-[#2c241b]" 
              : "border-[#1a1a1a]/20 bg-[#dcdcd1]"
          )}>
            <span className={cn(conversationPhase === 'gathering' ? "opacity-100" : "opacity-40")}>
              Gathering
            </span>
            <span className="opacity-20">→</span>
            <span className={cn(conversationPhase === 'drafting' ? "opacity-100" : "opacity-40")}>
              Drafting
            </span>
            <span className="opacity-20">→</span>
            <span className={cn(conversationPhase === 'complete' ? "opacity-100" : "opacity-40", "flex items-center gap-1")}>
              {conversationPhase === 'complete' && <CheckCircle size={12} />}
              Complete
            </span>
          </div>
        </div>

        {/* Theme Toggle */}
        <div className="absolute bottom-8 left-0 w-full flex justify-center">
          <button 
            onClick={toggleTheme}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-full border transition-all duration-300",
              theme === 'coffee' 
                ? "border-[#e8e6df]/30 text-[#e8e6df]/70 hover:bg-[#e8e6df]/10" 
                : "border-[#1a1a1a]/30 text-[#1a1a1a]/70 hover:bg-[#1a1a1a]/5"
            )}
          >
            {theme === 'coffee' ? <Sun size={16} /> : <Moon size={16} />}
            <span className="text-xs uppercase tracking-widest font-bold">
              {theme === 'coffee' ? "Morning Mode" : "Coffee Break"}
            </span>
          </button>
        </div>
      </div>

      {/* MIDDLE COLUMN: CHAT (Flexible) */}
      <div className="flex-1 flex flex-col relative z-0 h-full max-w-6xl mx-auto w-full">
        <div className="p-4 md:p-12 h-full flex flex-col justify-center relative">
          <ChatInterface 
            messages={messages} 
            onSendMessage={handleSendMessage}
            isTyping={isTyping} 
            theme={theme}
            onFinalize={handleFinalize}
            canFinalize={conversationPhase === 'drafting' && !isTyping}
            onReset={() => {
              resetConversation();
              toast.success("Started a new conversation!");
            }}
          />
        </div>
      </div>

      {/* MOBILE PENNY HEADER (Only visible on small screens) */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <PennyFrame size="sm" className="w-16 h-16 shadow-lg" />
      </div>

      {/* RIGHT DRAWER TOGGLE BUTTON (Floating) */}
      <motion.button
        onClick={() => setIsPlanOpen(!isPlanOpen)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={cn(
          "fixed right-0 top-1/2 -translate-y-1/2 z-40 p-4 rounded-l-lg shadow-[0px_4px_20px_rgba(0,0,0,0.4)] border-l-2 border-t-2 border-b-2 flex flex-col items-center gap-2 transition-all duration-300",
          isPlanOpen ? "translate-x-[100%]" : "translate-x-0",
          theme === 'coffee' 
            ? "bg-[#3e3226] text-[#e8e6df] border-[#e8e6df]/20" 
            : "bg-[#1a1a1a] text-[#e8e6df] border-[#e8e6df]"
        )}
      >
        <div className="writing-vertical-rl font-['Oswald'] uppercase tracking-widest text-sm font-bold py-2">
          View Lesson Plan
        </div>
        {hasPlanUpdated && !isPlanOpen && (
          <span className="absolute -top-1.5 -left-1.5 w-4 h-4 bg-red-600 rounded-full border-2 border-white animate-pulse shadow-md"></span>
        )}
        <PanelRightOpen size={24} />
      </motion.button>

      {/* RIGHT DRAWER: LESSON PLAN */}
      <AnimatePresence>
        {isPlanOpen && (
          <>
            {/* Backdrop for mobile */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsPlanOpen(false)}
              className="fixed inset-0 bg-[#1a1a1a]/80 z-40 lg:hidden backdrop-blur-sm"
            />
            
            {/* Drawer Panel */}
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className={cn(
                "fixed right-0 top-0 h-full w-full md:w-[85%] lg:w-[75%] z-50 shadow-[-20px_0_50px_rgba(0,0,0,0.5)] border-l-8 flex flex-col",
                theme === 'coffee' 
                  ? "bg-[#2c241b] border-[#e8e6df]/10" 
                  : "bg-[#f0ece2] border-[#1a1a1a]"
              )}
            >
              {/* Texture Overlay */}
              <div className="absolute inset-0 pointer-events-none opacity-[0.05] bg-[url('https://www.transparenttextures.com/patterns/cardboard-flat.png')] z-0 mix-blend-multiply"></div>

              {/* Drawer Header */}
              <div className={cn(
                "h-20 border-b-4 flex items-center justify-between px-8 shrink-0 relative z-10 transition-colors duration-500",
                theme === 'coffee' 
                  ? "bg-[#3e3226] border-[#e8e6df]/10 text-[#e8e6df]" 
                  : "bg-[#e6e2d6] border-[#1a1a1a] text-[#1a1a1a]"
              )}>
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-10 h-10 flex items-center justify-center shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)] transition-colors duration-500",
                    theme === 'coffee' ? "bg-[#e8e6df] text-[#2c241b]" : "bg-[#1a1a1a] text-[#f0ece2]"
                  )}>
                    <BookOpen size={20} />
                  </div>
                  <div>
                    <h3 className="font-['Oswald'] uppercase font-bold tracking-widest text-xl">Current Draft</h3>
                    <p className="text-[10px] font-mono opacity-60 uppercase tracking-widest">Last edited: Just now</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => handlePrint()}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 text-xs font-['Oswald'] uppercase tracking-widest transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)] active:translate-y-[2px] active:translate-x-[2px] active:shadow-none border border-transparent hover:scale-105",
                      theme === 'coffee' 
                        ? "bg-[#e8e6df] text-[#2c241b] hover:bg-[#fff]" 
                        : "bg-[#1a1a1a] text-[#e8e6df] hover:bg-[#333]"
                    )}
                  >
                    <Printer size={16} />
                    <span>Print Package</span>
                  </button>
                  <button 
                    onClick={() => setIsPlanOpen(false)}
                    className={cn(
                      "p-2 transition-colors border-2 border-transparent rounded-full",
                      theme === 'coffee' 
                        ? "hover:bg-[#e8e6df]/10 hover:text-[#e8e6df] hover:border-[#e8e6df]/20" 
                        : "hover:bg-[#1a1a1a] hover:text-[#e8e6df] hover:border-[#1a1a1a]"
                    )}
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              {/* Drawer Content */}
              <div className={cn(
                "flex-1 overflow-y-auto p-4 md:p-8 relative z-0 transition-colors duration-500",
                theme === 'coffee' ? "bg-[#2c241b]" : "bg-[#f0ece2]"
              )}>
                <div className={cn(
                  "max-w-6xl mx-auto shadow-[0px_10px_40px_rgba(0,0,0,0.1)] min-h-full p-8 border relative transition-colors duration-500",
                  theme === 'coffee' 
                    ? "bg-[#e8e6df] border-[#e8e6df]/10" 
                    : "bg-white border-[#e8e6df]"
                )}>
                  {/* Paper Texture for the document itself */}
                  <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[url('https://www.transparenttextures.com/patterns/paper.png')] z-0"></div>
                  <div className="relative z-10">
                    <LessonPlan ref={componentRef} {...lessonPlan} />
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

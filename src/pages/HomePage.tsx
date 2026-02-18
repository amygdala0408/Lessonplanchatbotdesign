import React, { useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { Toaster, toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { Printer, BookOpen, PanelRightOpen, X } from 'lucide-react';
import { ChatInterface } from '../app/components/ChatInterface';
import { LessonPlan } from '../app/components/LessonPlan';
import { PennyFrame } from '../app/components/PennyFrame';
import { cn } from '../lib/utils';
import { useStore } from '../store/useStore';
import { api } from '../services/api';
import { Message } from '../types';

export default function HomePage() {
  const { 
    messages, isTyping, lessonPlan, isPlanOpen, hasPlanUpdated,
    setMessages, setIsTyping, setLessonPlan, setIsPlanOpen, setHasPlanUpdated, addMessage 
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

  // Chat Handler
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
      const { response: responseText, updatedPlan } = await api.sendMessage(text, lessonPlan);

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseText,
        timestamp: new Date()
      };
      
      addMessage(botMessage);
      setIsTyping(false);
      
      if (updatedPlan) {
          setLessonPlan(updatedPlan);
          setHasPlanUpdated(true);
          toast.success("Lesson Plan Updated!", {
              action: {
                  label: "View",
                  onClick: () => setIsPlanOpen(true)
              }
          });
      }
    } catch (error) {
      console.error("Failed to fetch response:", error);
      setIsTyping(false);
      toast.error("Failed to generate response. Please try again.");
    }
  };

  return (
    <div className="flex h-screen bg-[#dcdcd1] overflow-hidden font-['DM_Sans'] text-[#1a1a1a] relative">
      <Toaster position="top-center" toastOptions={{
        className: 'bg-[#1a1a1a] text-[#e8e6df] border-2 border-[#e8e6df] font-["DM_Sans"] shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)]',
      }} />

      {/* BACKGROUND TEXTURES */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.05] bg-[url('https://www.transparenttextures.com/patterns/aged-paper.png')] z-0 mix-blend-multiply"></div>
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[url('https://www.transparenttextures.com/patterns/noise-lines.png')] z-0 mix-blend-overlay"></div>

      {/* LEFT COLUMN: PENNY (Fixed Width) */}
      <div className="hidden lg:flex flex-col w-[450px] h-full p-8 border-r-4 border-[#1a1a1a] bg-[#e6e2d6] z-10 relative shadow-2xl items-center justify-center shrink-0">
          <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cardboard-flat.png')] opacity-10 pointer-events-none mix-blend-multiply"></div>
          
          <div className="relative z-10 scale-100 transition-transform duration-500 hover:scale-[1.02]">
            <PennyFrame size="xl" />
          </div>

          <div className="mt-12 text-center space-y-4 max-w-[300px] relative">
             <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-px h-12 bg-[#1a1a1a]/20"></div>
             <div className="h-1 w-24 bg-[#1a1a1a] mx-auto mb-6"></div>
             <p className="font-['Oswald'] text-2xl uppercase tracking-widest font-bold leading-tight">"Rigor without access is gatekeeping. Access without rigor is abandonment. True equity demands both."</p>
             <div className="w-12 h-1 bg-[#1a1a1a]/20 mx-auto"></div>
             <p className="font-serif italic opacity-60 text-base">- Penny</p>
          </div>

          <div className="absolute bottom-8 left-0 w-full text-center">
             
          </div>
      </div>

      {/* MIDDLE COLUMN: CHAT (Flexible) */}
      <div className="flex-1 flex flex-col relative z-0 h-full max-w-6xl mx-auto w-full">
         <div className="p-4 md:p-12 h-full flex flex-col justify-center">
             <ChatInterface 
                messages={messages} 
                onSendMessage={handleSendMessage}
                isTyping={isTyping} 
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
            "fixed right-0 top-1/2 -translate-y-1/2 z-40 bg-[#1a1a1a] text-[#e8e6df] p-4 rounded-l-lg shadow-[0px_4px_20px_rgba(0,0,0,0.4)] border-l-2 border-t-2 border-b-2 border-[#e8e6df] flex flex-col items-center gap-2 transition-all duration-300",
            isPlanOpen ? "translate-x-[100%]" : "translate-x-0"
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
                    className="fixed right-0 top-0 h-full w-full md:w-[85%] lg:w-[75%] bg-[#f0ece2] z-50 shadow-[-20px_0_50px_rgba(0,0,0,0.5)] border-l-8 border-[#1a1a1a] flex flex-col"
                >
                     {/* Texture Overlay */}
                    <div className="absolute inset-0 pointer-events-none opacity-[0.05] bg-[url('https://www.transparenttextures.com/patterns/cardboard-flat.png')] z-0 mix-blend-multiply"></div>

                    {/* Drawer Header */}
                    <div className="h-20 bg-[#e6e2d6] border-b-4 border-[#1a1a1a] flex items-center justify-between px-8 shrink-0 relative z-10">
                         <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-[#1a1a1a] text-[#f0ece2] flex items-center justify-center shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)]">
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
                                className="flex items-center gap-2 bg-[#1a1a1a] text-[#e8e6df] px-4 py-2 text-xs font-['Oswald'] uppercase tracking-widest hover:bg-[#333] transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)] active:translate-y-[2px] active:translate-x-[2px] active:shadow-none border border-transparent hover:scale-105"
                             >
                                <Printer size={16} />
                                <span>Print Package</span>
                             </button>
                             <button 
                                onClick={() => setIsPlanOpen(false)}
                                className="p-2 hover:bg-[#1a1a1a] hover:text-[#e8e6df] transition-colors border-2 border-transparent hover:border-[#1a1a1a] rounded-full"
                             >
                                <X size={24} />
                             </button>
                         </div>
                    </div>

                    {/* Drawer Content */}
                    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-[#f0ece2] relative z-0">
                        <div className="max-w-6xl mx-auto bg-white shadow-[0px_10px_40px_rgba(0,0,0,0.1)] min-h-full p-8 border border-[#e8e6df] relative">
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

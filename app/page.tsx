'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useReactToPrint } from 'react-to-print';
import { Toaster, toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { Printer, BookOpen, PanelRightOpen, X, Moon, Sun, CheckCircle, Play } from 'lucide-react';
import { ChatInterface } from '@/components/ChatInterface';
import { LessonPlan } from '@/components/LessonPlan';
import { PennyFrame } from '@/components/PennyFrame';
import { ClassProfilePanel } from '@/components/ClassProfilePanel';
import { InstructionalModelChooser } from '@/components/InstructionalModelChooser';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';
import { Message, ChatTurnResult, ConversationPhase, LessonPlanData, ValidationError, InstructionalModel } from '@/types';
import { parseTurn, extractStudentMaterials } from '@/lib/lessonPlanParser';
import { nextPhase, canFinalize } from '@/lib/phaseMachine';
import { validateLessonPlan, formatErrorsForRetry } from '@/lib/lessonPlanSchema';

const PHASE_LABELS: Record<ConversationPhase, string> = {
  gathering: 'Gathering',
  text_selection: 'Text Selection',
  instructional_model: 'Model Choice',
  preview: 'Preview',
  drafting: 'Drafting',
  complete: 'Complete',
};

export default function HomePage() {
  const {
    messages, isTyping, lessonPlan, isPlanOpen, hasPlanUpdated, theme,
    conversationPhase, isDemoMode, learnerProfile, validationErrors, lessonPackage,
    studentMaterials,
    setMessages, setIsTyping, setLessonPlan, setIsPlanOpen, setHasPlanUpdated,
    addMessage, toggleTheme, setConversationPhase, setStudentMaterials,
    setLearnerProfile, setValidationErrors, setLessonPackage,
    resetConversation, loadDemoMode,
  } = useStore();

  // Class-profile panel auto-expands during gathering, collapses thereafter
  // (the teacher can re-open it any time via the chip).
  const [classProfileExpanded, setClassProfileExpanded] = useState(true);
  useEffect(() => {
    if (conversationPhase === 'gathering') setClassProfileExpanded(true);
    else setClassProfileExpanded(false);
  }, [conversationPhase]);

  const componentRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: componentRef,
    documentTitle: `Lesson Plan - ${lessonPlan.title || 'Untitled'}`,
    onBeforePrint: async () => {
      toast.info("Preparing your lesson plan package...");
    },
    onAfterPrint: () => {
      toast.success("Lesson plan downloaded successfully!");
    }
  });

  /**
   * Send a message to /api/chat and stream the response.
   * Returns a typed envelope describing what was extracted plus signals for
   * the phase machine. Callers (e.g. handleFinalize) inspect ok/errors before
   * advancing state.
   */
  const handleSendMessage = async (text: string): Promise<ChatTurnResult> => {
    const newMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    addMessage(newMessage);
    setIsTyping(true);

    try {
      const conversationHistory = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));
      conversationHistory.push({ role: 'user', content: text });

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: conversationHistory,
          currentPlan: lessonPlan,
          learnerProfile,
          conversationPhase,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response from Penny');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';

      const botMessageId = (Date.now() + 1).toString();
      const botMessage: Message = {
        id: botMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      };
      addMessage(botMessage);
      setIsTyping(false);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          fullResponse += chunk;

          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === botMessageId ? { ...msg, content: fullResponse } : msg,
            ),
          );
        }
      }

      const turn = parseTurn(fullResponse);

      // Merge any extracted plan into store + persist student materials.
      if (turn.plan && Object.keys(turn.plan).length > 0) {
        setLessonPlan((prev) => ({ ...prev, ...turn.plan! }));
        setHasPlanUpdated(true);

        const materials = extractStudentMaterials(fullResponse);
        if (materials) {
          setStudentMaterials((prev) => ({
            ...prev,
            ...materials,
            sentenceFrames: [
              ...(prev.sentenceFrames ?? []),
              ...(materials.sentenceFrames ?? []),
            ],
            readingPassages: [
              ...(prev.readingPassages ?? []),
              ...(materials.readingPassages ?? []),
            ],
          }));
        }
      }

      // Drive the phase machine off (current phase, plan after merge, signals).
      const planAfterMerge = { ...lessonPlan, ...(turn.plan ?? {}) };
      const transition = nextPhase({
        current: conversationPhase,
        plan: planAfterMerge,
        turn,
      });
      if (transition.next !== conversationPhase) {
        setConversationPhase(transition.next);
        if (transition.toast) {
          if (transition.toast.kind === 'success') toast.success(transition.toast.message);
          else toast.info(transition.toast.message);
        }
      }

      return turn;
    } catch (error) {
      console.error('Failed to fetch response:', error);
      setIsTyping(false);
      toast.error('Failed to generate response. Please try again.');

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I apologize, but I encountered an error. Please try again.',
        timestamp: new Date(),
      };
      addMessage(errorMessage);

      return {
        ok: false,
        rawResponse: '',
        signals: {
          isWaitingForTextSelection: false,
          containsLessonPlanDraft: false,
          hasJsonBlock: false,
        },
        errors: [{ path: 'network', message: String(error), severity: 'error' }],
      };
    }
  };

  // Finalize the lesson plan. Validates the resulting JSON against the schema
  // and only advances to 'complete' when validation passes. Auto-retries once
  // with a structured violation list before giving up.
  const handleFinalize = async () => {
    const guard = canFinalize(conversationPhase, isTyping, lessonPlan);
    if (!guard.ok) {
      toast.warning(guard.reason);
      return;
    }

    setConversationPhase('drafting');

    const finalizePrompt = `Please finalize and output the complete lesson plan we've designed.

Output the structured lesson plan data between [LESSON_PLAN_JSON] and [/LESSON_PLAN_JSON] tags using this exact JSON structure:

[LESSON_PLAN_JSON]
{
  "title": "Lesson title",
  "gradeLevel": "Grade level",
  "subject": "Subject area",
  "duration": "Time duration",
  "standard": { "framework": "CCSS", "code": "CCSS.ELA-LITERACY.RI.11-12.6", "description": "..." },
  "instructionalModel": "Explicit Instruction | 5E Inquiry | Project-Based Learning | Cooperative Learning | Socratic Seminar | Workshop Model | Flipped Classroom",
  "objectives": [{"text": "Students will...", "dok": 3, "verb": "analyze"}],
  "materials": ["Material 1", "Material 2"],
  "procedure": [
    {"phase": "launch", "step": "Set Purpose (10 min)", "description": "...", "accommodations": "Visual schedule posted; sentence stems available"},
    {"phase": "model", "step": "Modeling (15 min)", "description": "...", "accommodations": "Think-aloud captioned"},
    {"phase": "guided_practice", "step": "Guided Practice (25 min)", "description": "...", "accommodations": "Strategic pairs; sentence frames"},
    {"phase": "independent_practice", "step": "Independent Practice (30 min)", "description": "...", "accommodations": "Reduced load option; alt response modes"},
    {"phase": "exit_slip", "step": "Closure & Exit Slip (10 min)", "description": "...", "accommodations": "Bilingual glossary available"}
  ],
  "assessment": "Assessment description",
  "successCriteria": ["I can ...", "I can ...", "I can ..."],
  "supports": {
    "all": ["Support for all students"],
    "el": ["EL-specific supports"],
    "iep504": ["IEP/504 accommodations"]
  },
  "equityNotes": "Representation tags and equity considerations",
  "exitSlip": "Exit slip prompt aligned to the highest-DOK objective",
  "rubric": [
    {"score": 0, "description": "No understanding demonstrated"},
    {"score": 1, "description": "Partial understanding"},
    {"score": 2, "description": "Approaching mastery"},
    {"score": 3, "description": "Full mastery with evidence"}
  ],
  "textOptions": [
    {"title": "...", "source": "...", "lexile": "...", "url": "...", "rationale": "...", "selected": true},
    {"title": "...", "source": "...", "lexile": "...", "url": "...", "rationale": "...", "selected": false},
    {"title": "...", "source": "...", "lexile": "...", "url": "...", "rationale": "...", "selected": false}
  ],
  "teacherModifications": ["Optional modification 1", "Optional modification 2"]
}
[/LESSON_PLAN_JSON]

Hard requirements:
- Exactly 5 procedure phases in order: launch -> model -> guided_practice -> independent_practice -> exit_slip
- Every procedure step has non-empty "accommodations" embedded
- Exit slip aligned to the highest-DOK objective
- Rubric has exactly 4 rows scored 0/1/2/3
- Exactly one selected: true in textOptions, the others false`;

    const turn = await handleSendMessage(finalizePrompt);
    if (!turn.ok) {
      // Network or stream error already toasted in handleSendMessage. Bring the
      // user back to preview so they can try again.
      setConversationPhase('preview');
      return;
    }

    // Validate the merged plan via the server endpoint so we get both
    // structural checks and catalog-ID cross-validation in one round-trip.
    const merged = { ...lessonPlan, ...(turn.plan ?? {}) };
    let result = await validatePlanRemote(merged);

    if (!result.ok) {
      // One auto-retry with a structured violation list.
      toast.info('Penny\'s draft missed a few quality gates. Asking her to fix it...');
      const retryPrompt = result.retryPrompt || formatErrorsForRetry(result.errors);
      const retryTurn = await handleSendMessage(retryPrompt);
      const retryMerged = { ...lessonPlan, ...(retryTurn.plan ?? {}) };
      result = await validatePlanRemote(retryMerged);
    }

    setValidationErrors(result.errors);
    if (result.ok) {
      setConversationPhase('complete');
      toast.success('Lesson plan finalized.');
      setIsPlanOpen(true);
      // Resolve the catalog package so the print pages render real
      // accommodations/glossary/citations/misconceptions instead of
      // placeholders. Failures here don't block finalize — the print
      // package falls back to the default placeholders.
      void fetchLessonPackage(merged);
    } else {
      // Park back at preview so the teacher can edit and retry.
      setConversationPhase('preview');
      const blocking = result.errors.filter((e) => e.severity === 'error');
      toast.error(
        `Lesson plan still has ${blocking.length} issue${blocking.length === 1 ? '' : 's'}. Open the lesson preview to see the checklist.`,
      );
    }
  };

  // Resolves catalog references on the server so the print package can render
  // resolved content. Failures are logged; they don't block finalize.
  async function fetchLessonPackage(plan: Partial<LessonPlanData>) {
    try {
      const resp = await fetch('/api/lesson-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, learnerProfile }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const pkg = await resp.json();
      setLessonPackage(pkg);
    } catch (err) {
      console.warn('[lesson-package] resolve failed:', err);
    }
  }

  // Server-side plan validation (structural + catalog ID cross-checks). Falls
  // back to client-side structural validation if the endpoint is unreachable
  // so a hosting glitch doesn't strand the teacher.
  async function validatePlanRemote(
    plan: Partial<LessonPlanData>,
  ): Promise<{ ok: boolean; errors: ValidationError[]; retryPrompt?: string }> {
    try {
      const resp = await fetch('/api/validate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, gate: 'finalize' }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as {
        ok: boolean;
        errors: ValidationError[];
        retryPrompt?: string;
      };
      return data;
    } catch (err) {
      console.warn('[validate-plan] remote check failed, using local fallback:', err);
      const local = validateLessonPlan(plan, 'finalize');
      return {
        ok: local.ok,
        errors: local.errors,
        retryPrompt: formatErrorsForRetry(local.errors),
      };
    }
  }

  const finalizeGuard = canFinalize(conversationPhase, isTyping, lessonPlan);

  // Teacher picked an instructional model from the chooser. Persist on the
  // plan and send a confirmation turn so Penny can move into preview.
  const handleInstructionalModelPick = async (model: InstructionalModel) => {
    setLessonPlan((prev) => ({ ...prev, instructionalModel: model }));
    toast.success(`Locked in ${model}.`);
    void handleSendMessage(
      `Let's go with ${model}. Build the preview around that model and ask me to confirm before finalizing.`,
    );
  };

  return (
    <div
      className={cn(
        "flex h-screen overflow-hidden font-['DM_Sans'] relative transition-colors duration-500",
        theme === 'coffee' ? 'bg-[#2c241b] text-[#e8e6df]' : 'bg-[#dcdcd1] text-[#1a1a1a]',
      )}
    >
      <Toaster
        position="top-center"
        toastOptions={{
          className: 'bg-[#1a1a1a] text-[#e8e6df] border-2 border-[#e8e6df] font-["DM_Sans"] shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)]',
        }}
      />

      <div className="absolute inset-0 pointer-events-none opacity-[0.05] bg-[url('https://www.transparenttextures.com/patterns/aged-paper.png')] z-0 mix-blend-multiply"></div>
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[url('https://www.transparenttextures.com/patterns/noise-lines.png')] z-0 mix-blend-overlay"></div>

      {/* LEFT COLUMN: PENNY (Fixed Width) */}
      <div
        className={cn(
          'hidden lg:flex flex-col w-[450px] h-full p-8 border-r-4 z-10 relative shadow-2xl shrink-0 transition-colors duration-500',
          theme === 'coffee' ? 'border-[#e8e6df]/20 bg-[#3e3226]' : 'border-[#1a1a1a] bg-[#e6e2d6]',
        )}
      >
        <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cardboard-flat.png')] opacity-10 pointer-events-none mix-blend-multiply"></div>

        <div className="flex-1 flex flex-col items-center justify-center relative z-10">
          <div className="scale-100 transition-transform duration-500 hover:scale-[1.02]">
            <PennyFrame size="xl" />
          </div>
        </div>

        <div className="relative z-10 flex flex-col items-center gap-6 pb-4">
          <div className="text-center space-y-3 max-w-[320px]">
            <div className={cn('h-1 w-24 mx-auto transition-colors duration-500', theme === 'coffee' ? 'bg-[#e8e6df]' : 'bg-[#1a1a1a]')}></div>
            <p className="font-['Oswald'] text-lg uppercase tracking-widest font-bold leading-tight">"Rigor without access is gatekeeping. Access without rigor is abandonment. True equity demands both."</p>
            <p className="font-serif italic opacity-60 text-xs">— Dr. Kristopher J. Childs<br /><span className="text-[10px]">(via Penny Pedagogy)</span></p>
          </div>

          {/* Conversation Phase Indicator */}
          <div className="w-full px-4">
            <div
              className={cn(
                'flex items-center justify-between text-[10px] uppercase tracking-widest font-bold p-2.5 border-2 transition-colors duration-500 gap-1',
                theme === 'coffee' ? 'border-[#e8e6df]/20 bg-[#2c241b]' : 'border-[#1a1a1a]/20 bg-[#dcdcd1]',
              )}
            >
              {(['gathering', 'text_selection', 'instructional_model', 'preview', 'complete'] as ConversationPhase[]).map((phase, i, arr) => (
                <React.Fragment key={phase}>
                  <span
                    className={cn(
                      conversationPhase === phase || (phase === 'complete' && conversationPhase === 'complete')
                        ? 'opacity-100'
                        : 'opacity-40',
                      'flex items-center gap-1 truncate',
                    )}
                  >
                    {phase === 'complete' && conversationPhase === 'complete' && <CheckCircle size={10} />}
                    {PHASE_LABELS[phase]}
                  </span>
                  {i < arr.length - 1 && <span className="opacity-20">→</span>}
                </React.Fragment>
              ))}
            </div>
            {!finalizeGuard.ok && conversationPhase !== 'complete' && conversationPhase !== 'gathering' && (
              <p className="mt-2 text-[10px] opacity-60 italic px-1">{finalizeGuard.reason}</p>
            )}
          </div>

          <div className="flex flex-col items-center gap-2">
            {!isDemoMode && messages.length <= 1 && (
              <button
                onClick={() => {
                  loadDemoMode();
                  toast.success('Demo loaded! Check out the lesson plan.');
                }}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-full border transition-all duration-300 font-bold',
                  theme === 'coffee'
                    ? 'border-green-500/50 text-green-400 hover:bg-green-500/20 bg-green-500/10'
                    : 'border-green-600 text-green-700 hover:bg-green-100 bg-green-50',
                )}
              >
                <Play size={16} />
                <span className="text-xs uppercase tracking-widest">View Demo</span>
              </button>
            )}
            <button
              onClick={toggleTheme}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all duration-300',
                theme === 'coffee'
                  ? 'border-[#e8e6df]/30 text-[#e8e6df]/70 hover:bg-[#e8e6df]/10'
                  : 'border-[#1a1a1a]/30 text-[#1a1a1a]/70 hover:bg-[#1a1a1a]/5',
              )}
            >
              {theme === 'coffee' ? <Sun size={14} /> : <Moon size={14} />}
              <span className="text-[10px] uppercase tracking-widest font-bold">
                {theme === 'coffee' ? 'Morning Mode' : 'Coffee Break'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* MIDDLE COLUMN: CHAT */}
      <div className="flex-1 flex flex-col relative z-0 h-full max-w-6xl mx-auto w-full">
        <div className="p-4 md:p-12 h-full flex flex-col justify-center relative">
          {/* Class profile sits above chat so Penny gets accommodation context
              from the very first turn. Auto-expanded during gathering, then
              collapsed but always re-openable via the chip. */}
          <div className="max-w-4xl mx-auto w-full">
            <ClassProfilePanel
              profile={learnerProfile}
              onChange={setLearnerProfile}
              theme={theme}
              expanded={classProfileExpanded}
              onToggle={() => setClassProfileExpanded((v) => !v)}
            />
          </div>

          <ChatInterface
            messages={messages}
            onSendMessage={(text) => { void handleSendMessage(text); }}
            isTyping={isTyping}
            theme={theme}
            onFinalize={handleFinalize}
            canFinalize={finalizeGuard.ok}
            finalizeDisabledReason={!finalizeGuard.ok ? finalizeGuard.reason : undefined}
            onReset={() => {
              resetConversation();
              toast.success('Started a new conversation!');
            }}
          />

          {/* Phase-aware chooser: visible only during the instructional_model
              phase. One click locks in the model and advances the phase. */}
          {conversationPhase === 'instructional_model' && (
            <div className="max-w-4xl mx-auto w-full">
              <InstructionalModelChooser
                plan={lessonPlan}
                learnerProfile={learnerProfile}
                conversationHistory={messages.map((m) => ({ role: m.role, content: m.content }))}
                theme={theme}
                onSelect={handleInstructionalModelPick}
              />
            </div>
          )}
        </div>
      </div>

      <div className="lg:hidden fixed top-4 left-4 z-50">
        <PennyFrame size="sm" className="w-16 h-16 shadow-lg" />
      </div>

      {/* RIGHT DRAWER TOGGLE BUTTON */}
      <motion.button
        onClick={() => setIsPlanOpen(!isPlanOpen)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={cn(
          'fixed right-0 top-1/2 -translate-y-1/2 z-40 p-4 rounded-l-lg shadow-[0px_4px_20px_rgba(0,0,0,0.4)] border-l-2 border-t-2 border-b-2 flex flex-col items-center gap-2 transition-all duration-300',
          isPlanOpen ? 'translate-x-[100%]' : 'translate-x-0',
          theme === 'coffee'
            ? 'bg-[#3e3226] text-[#e8e6df] border-[#e8e6df]/20'
            : 'bg-[#1a1a1a] text-[#e8e6df] border-[#e8e6df]',
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
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsPlanOpen(false)}
              className="fixed inset-0 bg-[#1a1a1a]/80 z-40 lg:hidden backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className={cn(
                'fixed right-0 top-0 h-full w-full md:w-[85%] lg:w-[75%] z-50 shadow-[-20px_0_50px_rgba(0,0,0,0.5)] border-l-8 flex flex-col',
                theme === 'coffee' ? 'bg-[#2c241b] border-[#e8e6df]/10' : 'bg-[#f0ece2] border-[#1a1a1a]',
              )}
            >
              <div className="absolute inset-0 pointer-events-none opacity-[0.05] bg-[url('https://www.transparenttextures.com/patterns/cardboard-flat.png')] z-0 mix-blend-multiply"></div>

              <div
                className={cn(
                  'min-h-[72px] border-b-4 flex items-center justify-between px-4 md:px-8 shrink-0 relative z-10 transition-colors duration-500',
                  theme === 'coffee' ? 'bg-[#3e3226] border-[#e8e6df]/10 text-[#e8e6df]' : 'bg-[#e6e2d6] border-[#1a1a1a] text-[#1a1a1a]',
                )}
              >
                <div className="flex items-center gap-3 md:gap-4">
                  <div
                    className={cn(
                      'w-10 h-10 flex items-center justify-center shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)] transition-colors duration-500 shrink-0',
                      theme === 'coffee' ? 'bg-[#e8e6df] text-[#2c241b]' : 'bg-[#1a1a1a] text-[#f0ece2]',
                    )}
                  >
                    <BookOpen size={20} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-['Oswald'] uppercase font-bold tracking-widest text-lg md:text-xl truncate">Current Draft</h3>
                    <p className="text-[10px] font-mono opacity-60 uppercase tracking-widest hidden sm:block">
                      {conversationPhase === 'complete' ? 'Finalized' : `Phase: ${PHASE_LABELS[conversationPhase]}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 md:gap-4 shrink-0">
                  <button
                    onClick={() => handlePrint()}
                    className={cn(
                      'flex items-center gap-2 px-3 md:px-4 py-2 text-xs font-["Oswald"] uppercase tracking-widest transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)] active:translate-y-[2px] active:translate-x-[2px] active:shadow-none border border-transparent hover:scale-105',
                      theme === 'coffee'
                        ? 'bg-[#e8e6df] text-[#2c241b] hover:bg-[#fff]'
                        : 'bg-[#1a1a1a] text-[#e8e6df] hover:bg-[#333]',
                    )}
                  >
                    <Printer size={16} />
                    <span className="hidden sm:inline">Print Package</span>
                    <span className="sm:hidden">Print</span>
                  </button>
                  <button
                    onClick={() => setIsPlanOpen(false)}
                    className={cn(
                      'p-2 transition-colors border-2 border-transparent rounded-full',
                      theme === 'coffee'
                        ? 'hover:bg-[#e8e6df]/10 hover:text-[#e8e6df] hover:border-[#e8e6df]/20'
                        : 'hover:bg-[#1a1a1a] hover:text-[#e8e6df] hover:border-[#1a1a1a]',
                    )}
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div
                className={cn(
                  'flex-1 overflow-y-auto p-4 md:p-8 relative z-0 transition-colors duration-500',
                  theme === 'coffee' ? 'bg-[#2c241b]' : 'bg-[#f0ece2]',
                )}
              >
                {validationErrors.length > 0 && (
                  <div className="max-w-6xl mx-auto mb-4 p-4 border-2 border-red-700 bg-red-50 text-red-900 print:hidden">
                    <h4 className="font-bold uppercase text-xs tracking-widest mb-2">Quality gate flagged issues</h4>
                    <ul className="text-xs space-y-1 list-disc pl-5">
                      {validationErrors.filter((e) => e.severity === 'error').slice(0, 8).map((e, i) => (
                        <li key={i}><span className="font-mono">{e.path}</span>: {e.message}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div
                  className={cn(
                    'max-w-6xl mx-auto shadow-[0px_10px_40px_rgba(0,0,0,0.1)] min-h-full p-8 border relative transition-colors duration-500',
                    theme === 'coffee' ? 'bg-[#e8e6df] border-[#e8e6df]/10' : 'bg-white border-[#e8e6df]',
                  )}
                >
                  <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[url('https://www.transparenttextures.com/patterns/paper.png')] z-0"></div>
                  <div className="relative z-10">
                    <LessonPlan
                      ref={componentRef}
                      {...lessonPlan}
                      lessonPackage={lessonPackage}
                      studentMaterials={studentMaterials}
                    />
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

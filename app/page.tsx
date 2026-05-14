'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useReactToPrint } from 'react-to-print';
import { Toaster, toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { Printer, BookOpen, PanelRightOpen, X, Moon, Sun, CheckCircle, Play, RotateCcw } from 'lucide-react';
import { ChatInterface } from '@/components/ChatInterface';
import { LessonPlan } from '@/components/LessonPlan';
import { PennyFrame } from '@/components/PennyFrame';
import { ClassProfilePanel } from '@/components/ClassProfilePanel';
import { InstructionalModelChooser } from '@/components/InstructionalModelChooser';
import { TextOptionPicker } from '@/components/TextOptionPicker';
import { InlineStructuredPicker } from '@/components/InlineStructuredPicker';
import { ModelStatusChip } from '@/components/ModelStatusChip';
import { ArtifactsPanel } from '@/components/ArtifactsPanel';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';
import { Message, ChatTurnResult, ConversationPhase, LessonPlanData, ValidationError, InstructionalModel } from '@/types';
import { parseTurn, extractStudentMaterials, stripHiddenBlocks, extractQuickReplies } from '@/lib/lessonPlanParser';
import { nextPhase, canFinalize } from '@/lib/phaseMachine';
import { streamArtifacts } from '@/lib/api/artifacts';
import type { ArtifactType } from '@/lib/llm/artifactSchemas';

const PHASE_LABELS: Record<ConversationPhase, string> = {
  gathering: 'Gathering',
  text_selection: 'Text Selection',
  instructional_model: 'Model Choice',
  preview: 'Preview',
  drafting: 'Drafting',
  complete: 'Complete',
};

interface FinalizeProgress {
  startedAt: number;
  elapsedSeconds: number;
  stage: 'preparing' | 'generating' | 'validating' | 'packaging';
  model: string;
  attempt: number;
}

export default function HomePage() {
  const {
    messages, isTyping, lessonPlan, isPlanOpen, hasPlanUpdated, theme,
    conversationPhase, isDemoMode, learnerProfile, validationErrors, lessonPackage,
    studentMaterials,
    setMessages, setIsTyping, setLessonPlan, setIsPlanOpen, setHasPlanUpdated,
    addMessage, toggleTheme, setConversationPhase, setStudentMaterials,
    setLearnerProfile, setValidationErrors, setLessonPackage,
    recordModelTurn,
    upsertArtifact, setArtifactStatus, resetArtifacts,
    resetConversation, loadDemoMode,
  } = useStore();

  // Class-profile panel auto-expands during gathering, collapses thereafter
  // (the teacher can re-open it any time via the chip).
  const [classProfileExpanded, setClassProfileExpanded] = useState(true);
  const [finalizeProgress, setFinalizeProgress] = useState<FinalizeProgress | null>(null);
  useEffect(() => {
    if (conversationPhase === 'gathering') setClassProfileExpanded(true);
    else setClassProfileExpanded(false);
  }, [conversationPhase]);
  useEffect(() => {
    if (!finalizeProgress) return;
    const timer = window.setInterval(() => {
      setFinalizeProgress((prev) => (
        prev
          ? {
              ...prev,
              elapsedSeconds: Math.floor((Date.now() - prev.startedAt) / 1000),
            }
          : null
      ));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [finalizeProgress]);

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

      // Capture multi-LLM routing info from server response headers.
      const turnStartedAt = Date.now();
      const respModel = response.headers.get('x-penny-model');
      const respProvider = response.headers.get('x-penny-provider');
      const respTools = response.headers.get('x-penny-tools');

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

      // Buffer streaming chunks and flush once per animation frame so we don't
      // thrash React with one setState per token. Also strip hidden machine
      // blocks ([QUICK_REPLIES], [LESSON_PLAN_JSON]) from the visible bubble
      // while still applying their effects when the stream completes.
      let pendingFlush = false;
      const scheduleFlush = () => {
        if (pendingFlush) return;
        pendingFlush = true;
        const flush = () => {
          pendingFlush = false;
          const visible = stripHiddenBlocks(fullResponse);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === botMessageId ? { ...msg, content: visible } : msg,
            ),
          );
        };
        if (typeof requestAnimationFrame !== 'undefined') {
          requestAnimationFrame(flush);
        } else {
          setTimeout(flush, 16);
        }
      };

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          fullResponse += chunk;
          scheduleFlush();
        }
      }

      // Record the chat turn's model routing for the ModelStatusChip popover.
      if (respModel) {
        recordModelTurn({
          task: 'chat',
          model: respModel,
          provider: respProvider ?? 'unknown',
          latencyMs: Date.now() - turnStartedAt,
          at: Date.now(),
          tools: respTools ? respTools.split(',').map((t) => t.trim()) : undefined,
        });
      }

      const turn = parseTurn(fullResponse);

      // Final visible content + quick-replies snap once streaming completes.
      const finalVisible = turn.visibleContent ?? stripHiddenBlocks(fullResponse);
      const finalQuickReplies = turn.signals.quickReplies ?? extractQuickReplies(fullResponse);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === botMessageId
            ? { ...msg, content: finalVisible, quickReplies: finalQuickReplies }
            : msg,
        ),
      );

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
          quickReplies: null,
        },
        errors: [{ path: 'network', message: String(error), severity: 'error' }],
      };
    }
  };

  // Finalize the lesson plan through the generator endpoint only. The legacy
  // "[LESSON_PLAN_JSON]" chat fallback was intentionally removed because it can
  // hide parser failures and render garbage when the gateway path is unavailable.
  const handleFinalize = async () => {
    const guard = canFinalize(conversationPhase, isTyping, lessonPlan);
    if (!guard.ok) {
      toast.warning(guard.reason);
      return;
    }

    setConversationPhase('drafting');
    setIsTyping(true);
    const startedAt = Date.now();
    setFinalizeProgress({
      startedAt,
      elapsedSeconds: 0,
      stage: 'preparing',
      model: 'anthropic/claude-sonnet-4.5',
      attempt: 1,
    });

    // Snapshot the conversation so the server has the same history the chat
    // route would see.
    const conversationHistory = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    try {
      setFinalizeProgress((prev) => prev ? { ...prev, stage: 'generating' } : null);
      const generatorResult = await finalizeViaGenerator({
        plan: lessonPlan,
        learnerProfile,
        messages: conversationHistory,
      });

      if (generatorResult.ok && generatorResult.plan) {
        // Prefer the server-merged plan (it already carries `qualityScore`
        // from the EQuIP+UDL scorer). Fall back to client-side merge only
        // when the server didn't return a merged shape.
        const merged = (generatorResult.merged
          ? ({ ...lessonPlan, ...generatorResult.merged } as LessonPlanData)
          : ({ ...lessonPlan, ...generatorResult.plan } as LessonPlanData));
        setFinalizeProgress((prev) => prev ? { ...prev, stage: 'packaging' } : null);
        setLessonPlan(merged);
        setValidationErrors([]);
        setHasPlanUpdated(true);
        setConversationPhase('complete');
        toast.success('Lesson plan finalized.');
        setIsPlanOpen(true);
        void fetchLessonPackage(merged);
        // Kick off the artifact-generator lane in parallel. Artifacts stream
        // back over SSE into the store (`artifacts` + `artifactStatus`); the
        // <ArtifactsPanel> in the lesson drawer renders them as they arrive.
        void generateArtifactsForPlan(merged);
        return;
      }

      // The generator endpoint ran but the plan didn't pass the finalize gate.
      // Surface the structured errors, render the merged plan anyway, and park
      // at preview so the teacher can see exactly what needs repair.
      setFinalizeProgress((prev) => prev ? { ...prev, stage: 'validating' } : null);
      if (generatorResult.merged) {
        setLessonPlan({ ...lessonPlan, ...generatorResult.merged } as LessonPlanData);
        setHasPlanUpdated(true);
      }
      setValidationErrors(generatorResult.errors);
      setConversationPhase('preview');
      setIsPlanOpen(true);
      const blocking = generatorResult.errors.filter((e) => e.severity === 'error');
      toast.error(
        `Lesson plan still has ${blocking.length} issue${blocking.length === 1 ? '' : 's'}. Open the lesson preview to see the checklist.`,
      );
    } finally {
      setIsTyping(false);
      setFinalizeProgress(null);
    }
  };

  /**
   * Calls /api/finalize-plan. A 503 is returned as a visible validation error
   * instead of falling back to legacy chat JSON generation.
   */
  async function finalizeViaGenerator(args: {
    plan: Partial<LessonPlanData>;
    learnerProfile: typeof learnerProfile;
    messages: { role: string; content: string }[];
  }): Promise<{
    ok: boolean;
    plan: Partial<LessonPlanData> | null;
    merged: Partial<LessonPlanData> | null;
    errors: ValidationError[];
  }> {
    try {
      const resp = await fetch('/api/finalize-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });

      if (resp.status === 503) {
        const data = (await resp.json().catch(() => null)) as { errors?: ValidationError[] } | null;
        const errors = data?.errors?.length
          ? data.errors
          : [
              {
                path: '<root>',
                message: 'Finalize requires AI_GATEWAY_API_KEY in this environment.',
                severity: 'error' as const,
              },
            ];
        setValidationErrors(errors);
        setConversationPhase('preview');
        setIsPlanOpen(true);
        toast.error('Finalize needs the AI Gateway key. The chat fallback has been removed to protect lesson quality.');
        return { ok: false, plan: null, merged: lessonPlan, errors };
      }
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        console.warn('[finalize-plan] non-OK:', resp.status, text);
        toast.error('Penny had trouble finalizing. Rendering the current draft with errors.');
        return {
          ok: false,
          plan: null,
          merged: lessonPlan,
          errors: [
            {
              path: '<root>',
              message: `Finalize endpoint returned ${resp.status}`,
              severity: 'error',
            },
          ],
        };
      }

      const data = (await resp.json()) as {
        ok: boolean;
        structuralOk?: boolean;
        plan: Partial<LessonPlanData> | null;
        merged: Partial<LessonPlanData> | null;
        errors: ValidationError[];
        retryPrompt?: string;
        qualityScore?: NonNullable<LessonPlanData['qualityScore']> | null;
        scorecard?: { judgeUsed?: boolean } | null;
        meta?: { model?: string; latencyMs?: number; provider?: string };
      };

      if (data.meta?.model) {
        console.info(
          `[finalize-plan] model=${data.meta.model} latency=${data.meta.latencyMs}ms ok=${data.ok} scored=${!!data.qualityScore}`,
        );
        recordModelTurn({
          task: 'generator',
          model: data.meta.model,
          provider: data.meta.provider ?? 'ai-gateway',
          latencyMs: data.meta.latencyMs ?? 0,
          at: Date.now(),
        });
        // Surface the scorer call too, when the LLM judge was actually
        // invoked — gives the ModelStatusChip a real signal that the
        // scoring lane is part of the pipeline.
        if (data.scorecard?.judgeUsed) {
          recordModelTurn({
            task: 'scorer',
            model: 'openai/gpt-5.5',
            provider: data.meta.provider ?? 'ai-gateway',
            latencyMs: 0,
            at: Date.now(),
          });
        }
      }

      return {
        ok: data.ok,
        plan: data.plan,
        merged: data.merged ?? null,
        errors: data.errors ?? [],
      };
    } catch (err) {
      console.warn('[finalize-plan] fetch failed:', err);
      const errors: ValidationError[] = [
        {
          path: '<root>',
          message: 'Finalize request failed before the generator returned. Check network/API configuration.',
          severity: 'error',
        },
      ];
      setValidationErrors(errors);
      setConversationPhase('preview');
      setIsPlanOpen(true);
      toast.error('Penny had trouble finalizing. Rendering the current draft with errors.');
      return { ok: false, plan: null, merged: lessonPlan, errors };
    }
  }

  /**
   * Kick off the artifact-generator lane. Streams SSE events into the store
   * (`upsertArtifact` per artifact, `setArtifactStatus` for streaming/done).
   * Pure side-effect — failures are logged but don't block finalize, since
   * each artifact is best-effort and the panel renders graceful fallbacks
   * for any that fail.
   */
  async function generateArtifactsForPlan(
    plan: Partial<LessonPlanData>,
    types?: ArtifactType[],
  ) {
    const selectedText = (plan.textOptions ?? []).find((t) => t.selected) ?? null;
    resetArtifacts();
    setArtifactStatus({ kind: 'streaming', startedAt: Date.now() });
    try {
      await streamArtifacts(
        { plan, selectedText, learnerProfile, types },
        {
          onArtifact: (artifact) => upsertArtifact(artifact),
          onError: (info) => console.warn('[artifacts] failed:', info.type, info.message),
          onDone: ({ succeeded, failed, latencyMs, model }) => {
            setArtifactStatus({ kind: 'done', latencyMs, succeeded, failed, model });
            recordModelTurn({
              task: 'artifact_generator',
              model,
              provider: 'ai-gateway',
              latencyMs,
              at: Date.now(),
            });
            if (succeeded.length > 0 && failed.length === 0) {
              toast.success(`Generated ${succeeded.length} student artifacts.`);
            } else if (succeeded.length > 0) {
              toast.warning(
                `Generated ${succeeded.length} of ${succeeded.length + failed.length} artifacts.`,
              );
            } else {
              toast.error('Artifact generation failed.');
            }
          },
          onFatal: (message) => {
            setArtifactStatus({ kind: 'error', message });
            console.error('[artifacts] fatal:', message);
          },
        },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setArtifactStatus({ kind: 'error', message });
      console.warn('[artifacts] streamArtifacts threw:', err);
    }
  }

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

  // Teacher picked one of Penny's 3 text options from the inline picker. We
  // toggle `selected` on that option locally so the phase machine can advance
  // and the catalog selectors get the right context on the next chat turn.
  const handleTextOptionPick = async (index: number) => {
    if (!lessonPlan.textOptions || lessonPlan.textOptions.length === 0) return;
    const chosen = lessonPlan.textOptions[index];
    if (!chosen) return;
    setLessonPlan((prev) => ({
      ...prev,
      textOptions: (prev.textOptions ?? []).map((opt, i) => ({
        ...opt,
        selected: i === index,
      })),
    }));
    toast.success(`Text locked in: ${chosen.title || `Option ${index + 1}`}`);
    void handleSendMessage(
      `Let's use "${chosen.title || `Option ${index + 1}`}". Recommend an instructional model that fits this text and the class profile.`,
    );
  };

  // Which gathering-phase fields are still missing and need the inline picker
  // to fill them. We only render the inline picker for the first missing
  // field at a time so the chat doesn't get cluttered with 3 stacked widgets.
  const missingGatheringField: 'subject' | 'gradeLevel' | 'duration' | null = (() => {
    if (conversationPhase !== 'gathering') return null;
    if (!lessonPlan.subject || lessonPlan.subject.trim().length < 2) return 'subject';
    if (!lessonPlan.gradeLevel || lessonPlan.gradeLevel.trim().length < 1) return 'gradeLevel';
    if (!lessonPlan.duration || lessonPlan.duration.trim().length < 2) return 'duration';
    return null;
  })();

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
            <ModelStatusChip />
            <button
              onClick={() => {
                if (typeof window !== 'undefined') {
                  // Hard-clear any stale persisted state — useful when an older
                  // build left polluted plan content in localStorage.
                  try { window.localStorage.removeItem('penny-pedagogy-storage'); } catch { /* ignore */ }
                }
                resetConversation();
                toast.success('Cleared. Fresh start ready.');
              }}
              title="Clear chat + lesson plan and start over"
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all duration-300',
                theme === 'coffee'
                  ? 'border-amber-400/40 text-amber-300 hover:bg-amber-400/10'
                  : 'border-amber-600/40 text-amber-700 hover:bg-amber-100',
              )}
            >
              <RotateCcw size={14} />
              <span className="text-[10px] uppercase tracking-widest font-bold">Start Fresh</span>
            </button>
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

          {finalizeProgress && (
            <div className="max-w-4xl mx-auto w-full mt-4">
              <div
                className={cn(
                  'border-2 p-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,0.18)]',
                  theme === 'coffee'
                    ? 'bg-[#3e3226] border-[#e8e6df]/20 text-[#e8e6df]'
                    : 'bg-white border-[#1a1a1a] text-[#1a1a1a]',
                )}
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-widest opacity-60">
                      Finalizing lesson package
                    </div>
                    <div className="font-['Oswald'] uppercase tracking-widest font-bold mt-1">
                      {finalizeProgress.stage === 'preparing' && 'Preparing context'}
                      {finalizeProgress.stage === 'generating' && 'Generator is building the plan'}
                      {finalizeProgress.stage === 'validating' && 'Checking quality gates'}
                      {finalizeProgress.stage === 'packaging' && 'Resolving catalog package'}
                    </div>
                    <p className="text-xs opacity-70 mt-1">
                      Model: {finalizeProgress.model} · Attempt {finalizeProgress.attempt} · {finalizeProgress.elapsedSeconds}s elapsed.
                      This usually takes 60-90 seconds for a complete print-ready plan.
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-600 animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-2.5 h-2.5 rounded-full bg-green-600 animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-2.5 h-2.5 rounded-full bg-green-600 animate-bounce"></span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Phase-aware pickers — only the picker that matches the active phase
              renders, so the chat surface stays focused. */}
          {conversationPhase === 'gathering' && missingGatheringField && (
            <div className="max-w-4xl mx-auto w-full">
              <InlineStructuredPicker
                field={missingGatheringField}
                theme={theme}
                onPick={(value) => {
                  // Set the corresponding field on the plan immediately so the
                  // server-side catalog selectors get the right context on the
                  // *very next* chat turn. The user-facing message then nudges
                  // Penny to move forward.
                  setLessonPlan((prev) => {
                    if (missingGatheringField === 'subject') {
                      const subjectVal = value.replace(/^Subject:\s*/i, '').replace(/\.$/, '');
                      return { ...prev, subject: subjectVal };
                    }
                    if (missingGatheringField === 'gradeLevel') {
                      const grade = value.replace(/^Grade level:\s*/i, '').replace(/\.$/, '');
                      return { ...prev, gradeLevel: grade };
                    }
                    if (missingGatheringField === 'duration') {
                      const dur = value.replace(/^Class length:\s*/i, '').replace(/\.$/, '');
                      return { ...prev, duration: dur };
                    }
                    return prev;
                  });
                  void handleSendMessage(value);
                }}
              />
            </div>
          )}

          {conversationPhase === 'text_selection' && (lessonPlan.textOptions?.length ?? 0) >= 2 && (
            <div className="max-w-4xl mx-auto w-full">
              <TextOptionPicker
                options={lessonPlan.textOptions ?? []}
                theme={theme}
                onPick={handleTextOptionPick}
              />
            </div>
          )}

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
                  <div className="relative z-10 space-y-6">
                    <LessonPlan
                      ref={componentRef}
                      {...lessonPlan}
                      lessonPackage={lessonPackage}
                      studentMaterials={studentMaterials}
                      onSectionRegenerated={(section, value) => {
                        // Merge the regenerated section back into the plan.
                        setLessonPlan((prev) => ({ ...prev, [section]: value }));
                        toast.success(`Refreshed ${section}.`);
                        // Best-effort: kick a fresh validate-plan pass so the
                        // EQuIP+UDL scorecard updates with the new section.
                        // Fire-and-forget — UI shows the new value immediately
                        // and the scorecard refreshes when the response lands.
                        void (async () => {
                          try {
                            const resp = await fetch('/api/validate-plan', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                plan: { ...lessonPlan, [section]: value },
                                gate: 'finalize',
                              }),
                            });
                            const data = await resp.json().catch(() => null);
                            if (data?.qualityScore) {
                              setLessonPlan((prev) => ({
                                ...prev,
                                [section]: value,
                                qualityScore: data.qualityScore,
                              }));
                            }
                          } catch (err) {
                            console.warn('[regenerate-section] re-score failed:', err);
                          }
                        })();
                      }}
                    />
                    <ArtifactsPanel
                      onRegenerate={(types) => {
                        void generateArtifactsForPlan(lessonPlan, types);
                      }}
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

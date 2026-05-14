import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Message, LessonPlanData, ConversationPhase, StudentMaterialsData, LearnerProfile, ValidationError } from '../types';
import type { ArtifactPayload, ArtifactType } from '../lib/llm/artifactSchemas';
import { initialLessonPlan, initialStudentMaterials } from '../data/defaults';
import { demoLessonPlan, demoMessages } from '../data/demoData';
// LessonPackagePayload is the client-shaped resolved package returned from
// /api/lesson-package. We type it loosely here to avoid pulling server-only
// catalog types into the client bundle.
export interface LessonPackagePayload {
  accommodationsByPhase?: Record<string, Array<{ id: string; name: string; teacherPrompt: string; studentMicrocopy: string; phaseScope?: string[]; slotTargets?: string[] }>>;
  misconceptions?: Array<{ id: string; misconception: string; probe: string; teacherMove: string }>;
  glossary?: Array<{ termId: string; term: string; language: string; translation: string; pedagogicalDefinition: string }>;
  citations?: Array<{ id: string; reference: string; url?: string; topicTags: string[] }>;
  resources?: Array<{
    id: string;
    title: string;
    author: string;
    source: string;
    url: string;
    license: string;
    licenseClass: string;
    lexile?: number;
    gradeBand?: string;
    tasl: string;
    audio?: 'yes' | 'no' | 'unknown';
    captions: string;
    transcript: string;
    keyboardNav: string;
    account?: 'free' | 'free-account' | 'paid' | 'unknown';
    audience?: 'student' | 'teacher';
  }>;
  scaffoldsByPhase?: Record<string, Array<{ id: string; name: string; type: string; dokLevel?: number; teacherMove: string; studentMove: string }>>;
  opener?: { id: string; subject: string; openerType: string; hookText: string };
  exitSlip?: { id: string; subject: string; prompt: string; rubricSnippet?: string };
}

/**
 * Lightweight telemetry for the multi-LLM strategy. Each chat / picker /
 * generator round-trip pushes its model + latency here so the UI can render a
 * "which model just handled this?" status chip. Not persisted — purely
 * session-level visibility.
 */
export interface ModelTurn {
  task: 'chat' | 'picker' | 'generator' | 'scorer' | 'patcher' | 'accommodation' | 'artifact_generator';
  model: string;        // e.g., 'anthropic/claude-sonnet-4.5'
  provider: string;     // 'ai-gateway' | 'poe'
  latencyMs: number;
  at: number;           // Date.now()
  tools?: string[];     // e.g., ['pickCatalog']
}

/**
 * Status envelope for the artifact lane. `idle` before the first generation,
 * `streaming` while SSE events are still arriving, `done` once the route
 * emits its `done` event. `error` only when the stream itself fatals — per-
 * artifact failures show up as `failures[]` on the done state without
 * promoting to `error`, so the renderer can fall back gracefully on a
 * subset.
 */
export type ArtifactStatus =
  | { kind: 'idle' }
  | { kind: 'streaming'; startedAt: number }
  | { kind: 'done'; latencyMs: number; succeeded: ArtifactType[]; failed: { type: ArtifactType; error: string }[]; model: string }
  | { kind: 'error'; message: string };

interface AppState {
  messages: Message[];
  isTyping: boolean;
  lessonPlan: LessonPlanData;
  studentMaterials: StudentMaterialsData;
  isPlanOpen: boolean;
  hasPlanUpdated: boolean;
  theme: 'default' | 'coffee';
  conversationPhase: ConversationPhase;
  isDemoMode: boolean;
  learnerProfile: LearnerProfile | null;
  validationErrors: ValidationError[];
  lessonPackage: LessonPackagePayload | null;
  modelTurns: ModelTurn[];
  /** Most recent artifact-generator output keyed by artifact type. */
  artifacts: Partial<Record<ArtifactType, ArtifactPayload>>;
  artifactStatus: ArtifactStatus;

  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  setIsTyping: (isTyping: boolean) => void;
  setLessonPlan: (lessonPlan: LessonPlanData | ((prev: LessonPlanData) => LessonPlanData)) => void;
  setStudentMaterials: (materials: StudentMaterialsData | ((prev: StudentMaterialsData) => StudentMaterialsData)) => void;
  setIsPlanOpen: (isOpen: boolean) => void;
  setHasPlanUpdated: (hasUpdated: boolean) => void;
  addMessage: (message: Message) => void;
  toggleTheme: () => void;
  setConversationPhase: (phase: ConversationPhase) => void;
  setLearnerProfile: (profile: LearnerProfile | null) => void;
  setValidationErrors: (errors: ValidationError[]) => void;
  setLessonPackage: (pkg: LessonPackagePayload | null) => void;
  recordModelTurn: (turn: ModelTurn) => void;
  /** Replace one artifact in the dictionary (called per SSE event). */
  upsertArtifact: (artifact: ArtifactPayload) => void;
  setArtifactStatus: (status: ArtifactStatus) => void;
  /** Wipe artifacts when the user starts a new finalize round. */
  resetArtifacts: () => void;
  resetConversation: () => void;
  loadDemoMode: () => void;
}

const initialMessages: Message[] = [
  {
    id: '1',
    role: 'assistant',
    content:
      "Hi, I'm Penny. Drop your standard, lesson idea, or teaching dilemma, and I'll ask a few quick questions so we can turn it into rigorous, equitable, UDL-aligned instruction. The Class Profile to your left already tells me who's in the room, so I won't re-interrogate. (And yes — there will be exactly one well-placed joke about pacing guides.)",
    timestamp: new Date(),
  },
];

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      messages: initialMessages,
      isTyping: false,
      lessonPlan: initialLessonPlan,
      studentMaterials: initialStudentMaterials,
      isPlanOpen: false,
      hasPlanUpdated: false,
      theme: 'default',
      conversationPhase: 'gathering',
      isDemoMode: false,
      learnerProfile: null,
      validationErrors: [],
      lessonPackage: null,
      modelTurns: [],
      artifacts: {},
      artifactStatus: { kind: 'idle' },

      setMessages: (messages) => set((state) => ({
        messages: typeof messages === 'function' ? messages(state.messages) : messages
      })),
      setIsTyping: (isTyping) => set({ isTyping }),
      setLessonPlan: (lessonPlan) => set((state) => ({
        lessonPlan: typeof lessonPlan === 'function' ? lessonPlan(state.lessonPlan) : lessonPlan
      })),
      setStudentMaterials: (materials) => set((state) => ({
        studentMaterials: typeof materials === 'function' ? materials(state.studentMaterials) : materials
      })),
      setIsPlanOpen: (isPlanOpen) => set({ isPlanOpen }),
      setHasPlanUpdated: (hasPlanUpdated) => set({ hasPlanUpdated }),
      addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'default' ? 'coffee' : 'default' })),
      setConversationPhase: (conversationPhase) => set({ conversationPhase }),
      setLearnerProfile: (learnerProfile) => set({ learnerProfile }),
      setValidationErrors: (validationErrors) => set({ validationErrors }),
      setLessonPackage: (lessonPackage) => set({ lessonPackage }),
      recordModelTurn: (turn) => set((state) => ({
        // Cap at the last 20 turns so the array stays small.
        modelTurns: [...state.modelTurns, turn].slice(-20),
      })),
      upsertArtifact: (artifact) => set((state) => ({
        artifacts: { ...state.artifacts, [artifact.type]: artifact },
      })),
      setArtifactStatus: (artifactStatus) => set({ artifactStatus }),
      resetArtifacts: () => set({ artifacts: {}, artifactStatus: { kind: 'idle' } }),
      resetConversation: () => set({
        messages: initialMessages,
        lessonPlan: initialLessonPlan,
        studentMaterials: initialStudentMaterials,
        conversationPhase: 'gathering',
        hasPlanUpdated: false,
        isPlanOpen: false,
        isDemoMode: false,
        learnerProfile: null,
        validationErrors: [],
        lessonPackage: null,
        modelTurns: [],
        artifacts: {},
        artifactStatus: { kind: 'idle' },
      }),
      loadDemoMode: () => set({
        messages: demoMessages,
        lessonPlan: demoLessonPlan,
        conversationPhase: 'complete',
        hasPlanUpdated: true,
        isPlanOpen: true,
        isDemoMode: true,
        validationErrors: [],
        lessonPackage: null,
      }),
    }),
    {
      name: 'penny-pedagogy-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        messages: state.messages,
        lessonPlan: state.lessonPlan,
        studentMaterials: state.studentMaterials,
        theme: state.theme,
        conversationPhase: state.conversationPhase,
        learnerProfile: state.learnerProfile,
        lessonPackage: state.lessonPackage,
      }),
      // Bump on schema-changing edits so we don't load stale phase strings.
      version: 2,
      migrate: (persisted: unknown, version: number) => {
        const state = (persisted ?? {}) as Partial<AppState>;
        if (version < 2) {
          // Old phases were 'gathering' | 'drafting' | 'complete'. Map drafting
          // to 'preview' so users don't get stuck with Finalize disabled.
          if ((state.conversationPhase as string) === 'drafting') {
            state.conversationPhase = 'preview';
          }
        }
        return state;
      },
      onRehydrateStorage: () => (state) => {
        if (state?.messages) {
          state.messages = state.messages.map(msg => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }));
        }
      },
    }
  )
);

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Message, LessonPlanData, ConversationPhase, StudentMaterialsData, LearnerProfile, ValidationError } from '../types';
import { initialLessonPlan, initialStudentMaterials } from '../data/defaults';
import { demoLessonPlan, demoMessages } from '../data/demoData';
// LessonPackagePayload is the client-shaped resolved package returned from
// /api/lesson-package. We type it loosely here to avoid pulling server-only
// catalog types into the client bundle.
export interface LessonPackagePayload {
  accommodationsByPhase?: Record<string, Array<{ id: string; name: string; teacherPrompt: string; studentMicrocopy: string; phaseScope?: string[]; slotTargets?: string[] }>>;
  misconceptions?: Array<{ id: string; misconception: string; probe: string; teacherMove: string }>;
  glossary?: Array<{ id: string; term: string; language: string; gradeBand: string[]; definition: string }>;
  citations?: Array<{ id: string; reference: string; url?: string; topicTags: string[] }>;
  resources?: Array<{ id: string; title: string; source: string; url: string; license: string; licenseClass: string; lexile?: number; gradeBand: string[] }>;
  scaffoldsByPhase?: Record<string, Array<{ id: string; name: string; type: string; dokLevel?: number; teacherMove: string; studentMove: string }>>;
  opener?: { id: string; subject: string; openerType: string; hookText: string };
  exitSlip?: { id: string; subject: string; prompt: string; rubricSnippet?: string };
}

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
  resetConversation: () => void;
  loadDemoMode: () => void;
}

const initialMessages: Message[] = [
  {
    id: '1',
    role: 'assistant',
    content: "Hi, I'm Penny. Drop your standard, lesson idea, or teaching dilemma, and I'll ask a few quick questions so we can transform it into rigorous, equitable, UDL-aligned instruction — with zero fluff and maybe one well-placed joke about unrealistic pacing guides.",
    timestamp: new Date()
  }
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

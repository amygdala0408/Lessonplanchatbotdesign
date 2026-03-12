import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Message, LessonPlanData, ConversationPhase, StudentMaterialsData } from '../types';
import { initialLessonPlan, initialStudentMaterials } from '../data/defaults';
import { demoLessonPlan, demoMessages } from '../data/demoData';

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
  
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  setIsTyping: (isTyping: boolean) => void;
  setLessonPlan: (lessonPlan: LessonPlanData | ((prev: LessonPlanData) => LessonPlanData)) => void;
  setStudentMaterials: (materials: StudentMaterialsData | ((prev: StudentMaterialsData) => StudentMaterialsData)) => void;
  setIsPlanOpen: (isOpen: boolean) => void;
  setHasPlanUpdated: (hasUpdated: boolean) => void;
  addMessage: (message: Message) => void;
  toggleTheme: () => void;
  setConversationPhase: (phase: ConversationPhase) => void;
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
      resetConversation: () => set({
        messages: initialMessages,
        lessonPlan: initialLessonPlan,
        studentMaterials: initialStudentMaterials,
        conversationPhase: 'gathering',
        hasPlanUpdated: false,
        isPlanOpen: false,
        isDemoMode: false,
      }),
      loadDemoMode: () => set({
        messages: demoMessages,
        lessonPlan: demoLessonPlan,
        conversationPhase: 'complete',
        hasPlanUpdated: true,
        isPlanOpen: true,
        isDemoMode: true,
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
      }),
      onRehydrateStorage: () => (state) => {
        // Convert timestamp strings back to Date objects
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

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Message, LessonPlanData } from '../types';
import { initialLessonPlan } from '../data/defaults';

interface AppState {
  messages: Message[];
  isTyping: boolean;
  lessonPlan: LessonPlanData;
  isPlanOpen: boolean;
  hasPlanUpdated: boolean;
  theme: 'default' | 'coffee';
  
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  setIsTyping: (isTyping: boolean) => void;
  setLessonPlan: (lessonPlan: LessonPlanData | ((prev: LessonPlanData) => LessonPlanData)) => void;
  setIsPlanOpen: (isOpen: boolean) => void;
  setHasPlanUpdated: (hasUpdated: boolean) => void;
  addMessage: (message: Message) => void;
  toggleTheme: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      messages: [
        {
          id: '1',
          role: 'assistant',
          content: "Hello! I'm Penny Pedagogy. What subject and grade level are we planning for today?",
          timestamp: new Date()
        }
      ],
      isTyping: false,
      lessonPlan: initialLessonPlan,
      isPlanOpen: false,
      hasPlanUpdated: false,
      theme: 'default',

      setMessages: (messages) => set((state) => ({ 
        messages: typeof messages === 'function' ? messages(state.messages) : messages 
      })),
      setIsTyping: (isTyping) => set({ isTyping }),
      setLessonPlan: (lessonPlan) => set((state) => ({ 
        lessonPlan: typeof lessonPlan === 'function' ? lessonPlan(state.lessonPlan) : lessonPlan 
      })),
      setIsPlanOpen: (isPlanOpen) => set({ isPlanOpen }),
      setHasPlanUpdated: (hasPlanUpdated) => set({ hasPlanUpdated }),
      addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'default' ? 'coffee' : 'default' })),
    }),
    {
      name: 'penny-pedagogy-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ 
        messages: state.messages, 
        lessonPlan: state.lessonPlan,
        theme: state.theme 
      }), // Only persist these fields
    }
  )
);

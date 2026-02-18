import { create } from 'zustand';
import { Message, LessonPlanData } from '../types';
import { initialLessonPlan } from '../data/defaults';

interface AppState {
  messages: Message[];
  isTyping: boolean;
  lessonPlan: LessonPlanData;
  isPlanOpen: boolean;
  hasPlanUpdated: boolean;
  
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  setIsTyping: (isTyping: boolean) => void;
  setLessonPlan: (lessonPlan: LessonPlanData | ((prev: LessonPlanData) => LessonPlanData)) => void;
  setIsPlanOpen: (isOpen: boolean) => void;
  setHasPlanUpdated: (hasUpdated: boolean) => void;
  addMessage: (message: Message) => void;
}

export const useStore = create<AppState>((set) => ({
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

  setMessages: (messages) => set((state) => ({ 
    messages: typeof messages === 'function' ? messages(state.messages) : messages 
  })),
  setIsTyping: (isTyping) => set({ isTyping }),
  setLessonPlan: (lessonPlan) => set((state) => ({ 
    lessonPlan: typeof lessonPlan === 'function' ? lessonPlan(state.lessonPlan) : lessonPlan 
  })),
  setIsPlanOpen: (isPlanOpen) => set({ isPlanOpen }),
  setHasPlanUpdated: (hasPlanUpdated) => set({ hasPlanUpdated }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] }))
}));

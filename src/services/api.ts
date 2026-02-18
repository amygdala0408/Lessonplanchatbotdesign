import { Message, LessonPlanData } from '../types';
import { demoLessonPlan, initialLessonPlan } from '../data/defaults';

// Mock service layer
export const api = {
  sendMessage: async (text: string, currentPlan: LessonPlanData): Promise<{ response: string; updatedPlan?: LessonPlanData }> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        let responseText = "I can help with that! Could you provide more details?";
        let updatedPlan: LessonPlanData | undefined;

        const lowerText = text.toLowerCase();

        if (lowerText.includes("science") || lowerText.includes("volcano")) {
          responseText = "That sounds exciting! I've drafted a lesson plan for 5th Grade Science on Volcanoes. Check the plan drawer to see it.";
          updatedPlan = demoLessonPlan;
        } else if (lowerText.includes("math") || lowerText.includes("fraction")) {
          responseText = "Great! Let's work on fractions. I've updated the objectives. What specific activity would you like to include?";
          updatedPlan = {
            ...currentPlan,
            title: "Fun with Fractions",
            subject: "Mathematics",
            gradeLevel: "3rd Grade",
            objectives: ["Understand numerator and denominator", "Compare simple fractions"]
          };
        } else if (lowerText.includes("print") || lowerText.includes("pdf")) {
          responseText = "You can download the full package by opening the Lesson Plan drawer and clicking 'Print Full Package'.";
        } else {
          responseText = "I've updated the plan based on your request. What else should we add?";
           if (!currentPlan.title) {
               updatedPlan = { ...currentPlan, title: "Custom Lesson Plan", subject: "General" };
           }
        }

        resolve({ response: responseText, updatedPlan });
      }, 1500);
    });
  }
};

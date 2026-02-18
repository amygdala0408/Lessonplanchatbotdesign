import { LessonPlanData } from '../types';

export const initialLessonPlan: LessonPlanData = {
  title: "",
  gradeLevel: "",
  subject: "",
  duration: "",
  objectives: [],
  materials: [],
  procedure: [],
  assessment: ""
};

export const demoLessonPlan: LessonPlanData = {
  title: "Volcano Eruptions: Understanding Earth's Power",
  gradeLevel: "5th Grade",
  subject: "Earth Science",
  duration: "45 Minutes",
  objectives: [
    "Identify the three main types of volcanoes.",
    "Explain the process of a volcanic eruption.",
    "Demonstrate an understanding of tectonic plates."
  ],
  materials: [
    "Baking soda",
    "Vinegar",
    "Red food coloring",
    "Plastic bottle",
    "Clay or playdough",
    "Tray"
  ],
  procedure: [
    { step: "Introduction", description: "Show a video clip of a volcanic eruption. Ask students what they think is happening." },
    { step: "Discussion", description: "Explain the structure of the earth and how magma rises to the surface." },
    { step: "Activity", description: "Students build their own volcano model using clay and the plastic bottle." },
    { step: "Experiment", description: "Students mix baking soda and vinegar to simulate an eruption." },
    { step: "Reflection", description: "Students write a short paragraph about what they observed." }
  ],
  assessment: "Students will be assessed based on their participation in the experiment and the accuracy of their reflection paragraph."
};

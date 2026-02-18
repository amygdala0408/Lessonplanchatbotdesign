export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export type ConversationPhase = 'gathering' | 'drafting' | 'complete';

export interface LessonPlanData {
  title: string;
  gradeLevel: string;
  subject: string;
  duration: string;
  standard?: string;
  objectives: string[];
  materials: string[];
  procedure: { step: string; description: string; accommodations?: string }[];
  assessment: string;
  
  // Extended fields from Penny's output
  successCriteria?: string[];
  supports?: {
    all: string[];
    el: string[];
    iep504: string[];
  };
  equityNotes?: string;
  exitSlip?: string;
  rubric?: { score: number; description: string }[];
  teacherModifications?: string[];
  
  // Text selection
  textOptions?: {
    title: string;
    source: string;
    lexile: string;
    url: string;
    rationale: string;
    selected: boolean;
  }[];
}

export interface StudentMaterialsData {
  worksheets: {
    title: string;
    sections: {
      label: string;
      type: 'observation' | 'hypothesis' | 'diagram' | 'cer' | 'reflection' | 'custom';
      instructions: string;
      sentenceStems?: string[];
      wordBank?: string[];
      accommodationNotes?: string;
    }[];
  }[];
  
  graphicOrganizers: {
    type: 'cer' | 'comparison' | 'theme_tracking' | 'argument_map' | 'vocabulary';
    title: string;
    structure: Record<string, unknown>;
  }[];
  
  readingPassages: {
    title: string;
    source: string;
    url: string;
    audioUrl?: string;
    lexile: string;
    content?: string;
    bilingualGlossary?: { term: string; definition: string; translation?: string }[];
  }[];
  
  sentenceFrames: {
    purpose: string;
    frames: string[];
    targetLearners: ('all' | 'el' | 'iep504')[];
  }[];
}

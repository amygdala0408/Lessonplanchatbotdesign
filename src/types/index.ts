export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  /**
   * Optional per-message quick-reply options. When the assistant ends a turn
   * with a closed question, Penny emits a hidden `[QUICK_REPLIES]` block and
   * the parser surfaces the parsed options here so the UI can render clickable
   * chips. Clearing or never emitting means "free-write expected."
   */
  quickReplies?: QuickReply | null;
}

/**
 * A small enumerated answer set the chat UI renders as one-click chips.
 * Penny emits the underlying contract as a JSON object inside a hidden
 * `[QUICK_REPLIES] … [/QUICK_REPLIES]` block at the end of any turn that
 * expects an enumerable answer.
 *
 * `kind` is a hint for the UI (and for telemetry/testing); the canonical
 * source of truth is `options[].value` (what we'll send back as the user's
 * reply) and `options[].label` (what the teacher sees on the chip).
 */
export interface QuickReply {
  prompt?: string;
  kind?:
    | 'duration'
    | 'grade'
    | 'subject'
    | 'instructional_model'
    | 'confirmation'
    | 'multi'
    | 'other';
  options: QuickReplyOption[];
  /** When true, the chip row accepts multiple selections + a "Done" submit. */
  multi?: boolean;
  /** When true, the free-write box is hidden entirely. Defaults to false. */
  blockFreeWrite?: boolean;
}

export interface QuickReplyOption {
  /** Display text on the chip. */
  label: string;
  /** Text sent back as the user's reply. Defaults to `label`. */
  value?: string;
  /** Optional short rationale shown under the chip. */
  hint?: string;
}

// Canonical phase machine. Maps to the conversation contract in PENNY_SYSTEM_PROMPT.md
// and the lesson_phase_manifest.csv from Zeno LX (launch / model / guided_practice /
// independent_practice / exit_slip). The conversation phases below describe the *teacher*
// flow; the lesson plan procedure phases below describe the *lesson* flow.
export type ConversationPhase =
  | 'gathering'
  | 'text_selection'
  | 'instructional_model'
  | 'preview'
  | 'drafting'
  | 'complete';

export const CONVERSATION_PHASES: ConversationPhase[] = [
  'gathering',
  'text_selection',
  'instructional_model',
  'preview',
  'drafting',
  'complete',
];

export type LessonPhaseId =
  | 'launch'
  | 'model'
  | 'guided_practice'
  | 'independent_practice'
  | 'exit_slip';

export const LESSON_PHASE_ORDER: LessonPhaseId[] = [
  'launch',
  'model',
  'guided_practice',
  'independent_practice',
  'exit_slip',
];

// Human-readable labels for the lesson phases (used in legacy markdown/JSON parsing
// where Penny may emit "Set Purpose" or "I Do" instead of the canonical id).
export const LESSON_PHASE_LABELS: Record<LessonPhaseId, string[]> = {
  launch: ['Launch', 'Set Purpose', 'Hook', 'Engage', 'Opener'],
  model: ['Model', 'Modeling', 'I Do', 'Direct Instruction', 'Mini-Lesson'],
  guided_practice: ['Guided Practice', 'We Do', 'Explore', 'Collaborative'],
  independent_practice: ['Independent Practice', 'You Do', 'Apply', 'Elaborate'],
  exit_slip: ['Exit Slip', 'Closure', 'Evaluate', 'Cool Down'],
};

export type DOKLevel = 1 | 2 | 3 | 4;

export type StandardFramework = 'CCSS' | 'NGSS' | 'C3' | 'state' | 'other';

export interface Standard {
  framework: StandardFramework;
  code: string;
  description: string;
}

// Represented in the catalog as instructional_models.csv. P0 just types the enum;
// P1 wires the catalog selectors that pick a model and inherit its phase moves.
export type InstructionalModel =
  | 'Explicit Instruction'
  | '5E Inquiry'
  | 'Project-Based Learning'
  | 'Cooperative Learning'
  | 'Socratic Seminar'
  | 'Workshop Model'
  | 'Flipped Classroom';

export const INSTRUCTIONAL_MODELS: InstructionalModel[] = [
  'Explicit Instruction',
  '5E Inquiry',
  'Project-Based Learning',
  'Cooperative Learning',
  'Socratic Seminar',
  'Workshop Model',
  'Flipped Classroom',
];

// Inputs to the accommodations rules engine (lit by the gathering-phase questionnaire
// in P1; for P0 we accept partial values so existing flows keep working).
export interface LearnerProfile {
  hasIEP: boolean;
  has504: boolean;
  // 1 = newcomer, 5 = reclassified / proficient. null = no MLs in the class.
  multilingualLevel: 1 | 2 | 3 | 4 | 5 | null;
  homeLanguages: string[]; // ISO codes preferred (es, ht, vi, etc.)
  needsTags: NeedsTag[];
  classSize?: number;
  notes?: string;
}

export type NeedsTag =
  | 'attention_cues'
  | 'anxiety_support'
  | 'organization_support'
  | 'language_support'
  | 'reading_support'
  | 'writing_support'
  | 'math_support'
  | 'sensory_support'
  | 'executive_function_support'
  | 'social_emotional_support'
  | 'extended_time'
  | 'reduced_load'
  | 'alt_response_modes';

export interface Objective {
  text: string;
  dok: DOKLevel;
  // The verb anchored to the dok_lexicon row (e.g. "analyze"). Optional in P0.
  verb?: string;
  isExtension?: boolean; // true for the optional DOK 4 extension
}

/**
 * Structured execution recipe for a single lesson phase (Option B in
 * docs/plans/procedure-detail-enhancement.plan.md). `description` stays the
 * 2-4 sentence *what* summary; these six fields are the *how* — one teacher
 * decision point each, 1-3 sentences, plain text.
 */
export interface TeacherMoves {
  /** What the teacher SAYS or DOES to open the phase; model question verbatim in quotes. */
  launch: string;
  /** Conferring move + data collected + student talk to listen for while students work. */
  duringWork: string;
  /** The artifact/signal/evidence that proves the phase landed before transitioning. */
  checkForUnderstanding: string;
  /** Pre-planned move when a student or pair freezes; tied to the accommodation lanes. */
  ifStuck: string;
  /** Pre-planned stretch move for early finishers; aligned to the highest-DOK objective. */
  ifAhead: string;
  /** How the teacher closes the phase and routes into the next one; names the signal. */
  transition: string;
}

export interface ProcedureStep {
  // Canonical id from lesson_phase_manifest.csv. Optional during P0 because
  // legacy demo data and markdown-only outputs may not carry it; the parser
  // detects it from the human label when missing.
  phase?: LessonPhaseId;
  // Human label as Penny wrote it (e.g. "Set Purpose (10 min)").
  step: string;
  description: string;
  // Structured teacher-move recipe. Optional for legacy plans; the generator
  // schema requires it on every fresh finalize.
  teacherMoves?: TeacherMoves;
  // Embedded accommodations as free text (P0). P1 swaps to accommodationIds[].
  accommodations?: string;
  // Catalog references resolved server-side (populated in P1).
  scaffoldIds?: string[];
  accommodationIds?: string[];
  // Suggested timing in minutes.
  durationMin?: number;
  durationMax?: number;
}

export interface RubricRow {
  score: 0 | 1 | 2 | 3;
  description: string;
}

export interface TextOption {
  title: string;
  source: string;
  lexile: string;
  url: string;
  rationale: string;
  selected: boolean;
  // Catalog row id (resolved server-side in P1). Optional during P0 transition.
  resourceId?: string;
  // From representation_tags.csv canonical enum (rtag.*). Free-string in P0.
  representationTags?: string[];
  accessibility?: {
    audio?: boolean;
    captions?: boolean;
    transcript?: boolean;
    keyboardNav?: boolean;
    accountRequired?: boolean;
  };
}

export interface Supports {
  all: string[];
  el: string[];
  iep504: string[];
}

export interface LessonPlanData {
  title: string;
  gradeLevel: string;
  subject: string;
  duration: string;
  standard?: string | Standard;
  objectives: (string | Objective)[];
  materials: string[];
  procedure: ProcedureStep[];
  assessment: string;

  // Extended fields from Penny's output
  successCriteria?: string[];
  supports?: Supports;
  equityNotes?: string;
  exitSlip?: string;
  rubric?: RubricRow[];
  teacherModifications?: string[];

  // Text selection
  textOptions?: TextOption[];

  // P0 additions
  instructionalModel?: InstructionalModel;
  learnerProfile?: LearnerProfile;
  // EQuIP+UDL rubric snapshot from the quality scorer (P2). Stored when finalize succeeds.
  qualityScore?: {
    average: number;
    dimensions: { name: string; score: 0 | 1 | 2 | 3; rationale: string }[];
    passed: boolean;
    // Implementation Recipe Clarity (teacherMoves quality), scored alongside
    // the six EQuIP+UDL dimensions. Optional: plans scored before the
    // procedure-detail enhancement won't carry it.
    recipeClarity?: { score: 0 | 1 | 2 | 3; rationale: string };
  };

  // Catalog references resolved server-side (P1 fills these out).
  resourceIds?: string[];
  exitSlipId?: string;
  openerId?: string;
  misconceptionIds?: string[];
  evidenceCitationKeys?: string[];
}

// Result envelope returned from chat orchestration so callers can decide how to
// transition the phase machine. Set by app/page.tsx#handleSendMessage and consumed
// by handleFinalize (only advances to 'complete' when ok && validated).
export interface ChatTurnResult {
  ok: boolean;
  plan?: Partial<LessonPlanData>;
  rawResponse: string;
  /**
   * Visible content with the hidden machine blocks ([QUICK_REPLIES],
   * [LESSON_PLAN_JSON], etc.) stripped. Falls back to rawResponse when the
   * parser didn't run.
   */
  visibleContent?: string;
  signals: {
    isWaitingForTextSelection: boolean;
    containsLessonPlanDraft: boolean;
    hasJsonBlock: boolean;
    /** Parsed `[QUICK_REPLIES]` block, if any. Null when not present. */
    quickReplies: QuickReply | null;
  };
  errors?: ValidationError[];
}

export interface ValidationError {
  path: string;
  message: string;
  severity: 'error' | 'warning';
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

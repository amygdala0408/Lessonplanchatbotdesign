import {
  type LessonPlanData,
  type StudentMaterialsData,
  type LessonPhaseId,
  type DOKLevel,
  type ChatTurnResult,
  type Objective,
  type QuickReply,
  type QuickReplyOption,
  LESSON_PHASE_LABELS,
  INSTRUCTIONAL_MODELS,
} from '../types';

/**
 * Cleans up extracted text - removes markdown formatting and validates content
 */
function cleanExtractedText(text: string | undefined, maxLength: number = 100): string {
  if (!text) return '';

  let cleaned = text
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/`/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#+\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length > maxLength) {
    cleaned = cleaned.substring(0, maxLength).trim();
  }

  return cleaned;
}

/**
 * Strip markdown formatting that occasionally leaks into JSON string values.
 * Penny is a markdown-native model; if the generator leaves emphasis or code
 * formatting in description text the printed plan ends up with literal `**`
 * characters. Keep newlines/structure but drop the syntactic noise.
 */
function stripPlanMarkdown(text: string | undefined): string {
  if (!text) return '';
  return text
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/_(?=\S)([^_\n]+?)(?<=\S)_/g, '$1')
    .replace(/(^|\s)\*(?=\S)([^*\n]+?)(?<=\S)\*(?=\s|$|[.,;:!?])/g, '$1$2')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isValidField(text: string | undefined, minLength: number = 2): boolean {
  if (!text) return false;
  const cleaned = cleanExtractedText(text);
  if (cleaned.length < minLength || cleaned.length > 150) return false;
  if (/^[\*\#\-\•\s]+$/.test(cleaned)) return false;
  if (/^\d+$/.test(cleaned)) return false;
  if (cleaned.split(' ').length > 20) return false;
  return true;
}

/**
 * Map a free-text phase label (Penny may write "Set Purpose (10 min)" or "I Do")
 * to the canonical lesson_phase_manifest id.
 */
export function detectLessonPhaseId(label: string): LessonPhaseId | null {
  const normalized = label.toLowerCase();
  for (const [phaseId, labels] of Object.entries(LESSON_PHASE_LABELS) as [LessonPhaseId, string[]][]) {
    if (labels.some((l) => normalized.includes(l.toLowerCase()))) {
      return phaseId;
    }
  }
  return null;
}

/**
 * Extract a DOK level from an objective string. Prefer explicit "DOK 3"
 * markers, fall back to verb signals from the dok_lexicon spirit (the full
 * lexicon validation happens in P1).
 */
export function extractDOKLevel(text: string): DOKLevel | null {
  const explicit = text.match(/DOK\s*([1-4])/i);
  if (explicit) return Number(explicit[1]) as DOKLevel;

  const lower = text.toLowerCase();
  const dok4 = ['design', 'synthesize', 'integrate', 'argue', 'investigate over time', 'connect across', 'apply across'];
  const dok3 = ['analyze', 'critique', 'justify', 'evaluate', 'compare', 'contrast', 'formulate', 'trace', 'differentiate', 'explain why'];
  const dok2 = ['summarize', 'paraphrase', 'classify', 'categorize', 'estimate', 'interpret', 'represent', 'describe'];
  const dok1 = ['define', 'identify', 'list', 'recall', 'recognize', 'compute'];

  if (dok4.some((k) => lower.includes(k))) return 4;
  if (dok3.some((k) => lower.includes(k))) return 3;
  if (dok2.some((k) => lower.includes(k))) return 2;
  if (dok1.some((k) => lower.includes(k))) return 1;
  return null;
}

export function detectInstructionalModel(text: string): typeof INSTRUCTIONAL_MODELS[number] | null {
  const lower = text.toLowerCase();
  for (const model of INSTRUCTIONAL_MODELS) {
    if (lower.includes(model.toLowerCase())) return model;
  }
  // Synonyms
  if (lower.includes('gradual release') || lower.includes('i do, we do, you do')) return 'Explicit Instruction';
  if (lower.includes('inquiry')) return '5E Inquiry';
  if (lower.includes('jigsaw') || lower.includes('group roles')) return 'Cooperative Learning';
  if (lower.includes('seminar') || lower.includes('socratic')) return 'Socratic Seminar';
  return null;
}

/**
 * Extracts structured lesson plan JSON from Penny's response.
 *
 * Strict by design: ONLY returns data when the response contains an explicit
 * JSON payload (an `[LESSON_PLAN_JSON]` block or a ```json``` code fence whose
 * contents parse as a plan-shaped object). It deliberately does NOT mine
 * markdown prose for plan-like phrases — that aggressive fallback used to
 * misfire on every conversational turn now that the canonical finalize path
 * lives in /api/finalize-plan (generateObject + Zod). For legacy callers
 * (the Poe fallback path) the markdown miner is still available via
 * `extractFromMarkdown(response)` directly.
 */
export function extractLessonPlanFromResponse(response: string): Partial<LessonPlanData> | null {
  const jsonMatch = response.match(/\[LESSON_PLAN_JSON\]([\s\S]*?)\[\/LESSON_PLAN_JSON\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1].trim());
      return normalizeLessonPlanData(parsed);
    } catch (e) {
      console.error('Failed to parse lesson plan JSON:', e);
    }
  }

  const codeBlockMatch = response.match(/```json\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      // Only treat the code block as a plan if it actually looks like one.
      // Otherwise it's likely an illustrative snippet inside chat prose.
      if (looksLikePlanShape(parsed)) {
        return normalizeLessonPlanData(parsed);
      }
    } catch (e) {
      console.error('Failed to parse JSON code block:', e);
    }
  }

  return null;
}

/**
 * Returns true when the parsed JSON has enough plan-shaped fields that we can
 * confidently treat it as a lesson plan payload (vs. an illustrative snippet
 * Penny pasted into the chat for some other reason).
 */
function looksLikePlanShape(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  const obj = parsed as Record<string, unknown>;
  const planKeys = [
    'title',
    'objectives',
    'procedure',
    'gradeLevel',
    'grade_level',
    'rubric',
    'exitSlip',
    'exit_slip',
    'textOptions',
    'text_options',
    'successCriteria',
    'success_criteria',
  ];
  const hits = planKeys.filter((k) => obj[k] !== undefined).length;
  return hits >= 2;
}

/**
 * Normalizes various JSON formats into our LessonPlanData structure
 */
function normalizeLessonPlanData(data: Record<string, unknown>): Partial<LessonPlanData> {
  const normalized: Partial<LessonPlanData> = {};

  if (data.title) normalized.title = stripPlanMarkdown(String(data.title));
  if (data.gradeLevel || data.grade_level || data.grade) {
    normalized.gradeLevel = stripPlanMarkdown(String(data.gradeLevel || data.grade_level || data.grade));
  }
  if (data.subject) normalized.subject = stripPlanMarkdown(String(data.subject));
  if (data.duration || data.time || data.length) {
    normalized.duration = stripPlanMarkdown(String(data.duration || data.time || data.length));
  }
  if (data.standard || data.standards) {
    const standard = data.standard || data.standards;
    normalized.standard =
      typeof standard === 'string'
        ? stripPlanMarkdown(standard)
        : standard as LessonPlanData['standard'];
  }

  // Objectives — capture DOK if present, otherwise infer.
  const rawObjectives = Array.isArray(data.objectives)
    ? data.objectives
    : data.objective
      ? [data.objective]
      : data.learningObjective || data.learning_objective
        ? [data.learningObjective || data.learning_objective]
        : [];

  if (rawObjectives.length > 0) {
    normalized.objectives = rawObjectives.map((obj: unknown): string | Objective => {
      if (typeof obj === 'string') {
        const clean = stripPlanMarkdown(obj);
        const dok = extractDOKLevel(clean);
        return dok ? { text: clean, dok } : clean;
      }
      if (typeof obj === 'object' && obj !== null) {
        const o = obj as Record<string, unknown>;
        const text = stripPlanMarkdown(String(o.text || o.objective || o.statement || obj));
        const dok = (o.dok || o.DOK || o.dok_level) as DOKLevel | undefined;
        return {
          text,
          dok: (dok ?? extractDOKLevel(text) ?? 2) as DOKLevel,
          verb: o.verb ? String(o.verb) : undefined,
          isExtension: Boolean(o.isExtension || o.is_extension || o.extension),
        };
      }
      return stripPlanMarkdown(String(obj));
    });
  }

  if (Array.isArray(data.materials)) {
    normalized.materials = data.materials.map((m) => stripPlanMarkdown(String(m)));
  }

  // Procedure: detect canonical phase id from label.
  if (Array.isArray(data.procedure)) {
    normalized.procedure = data.procedure.map((step: unknown) => {
      if (typeof step === 'string') {
        const clean = stripPlanMarkdown(step);
        return { step: clean, description: '', phase: detectLessonPhaseId(clean) ?? undefined };
      }
      const s = step as Record<string, unknown>;
      const rawLabel = String(s.step || s.name || s.phase || '');
      const label = stripPlanMarkdown(rawLabel);
      const phase = (s.phase && typeof s.phase === 'string'
        ? detectLessonPhaseId(s.phase)
        : null) ?? detectLessonPhaseId(label);
      return {
        step: label,
        description: stripPlanMarkdown(String(s.description || s.content || s.details || '')),
        accommodations: s.accommodations ? stripPlanMarkdown(String(s.accommodations)) : undefined,
        scaffoldIds: Array.isArray(s.scaffoldIds) ? s.scaffoldIds.map(String) : undefined,
        accommodationIds: Array.isArray(s.accommodationIds) ? s.accommodationIds.map(String) : undefined,
        durationMin: typeof s.durationMin === 'number' ? s.durationMin : undefined,
        durationMax: typeof s.durationMax === 'number' ? s.durationMax : undefined,
        phase: phase ?? undefined,
      };
    });
  } else if (Array.isArray(data.phases)) {
    normalized.procedure = (data.phases as unknown[]).map((phase: unknown) => {
      const p = phase as Record<string, unknown>;
      const label = stripPlanMarkdown(String(p.name || p.phase || p.step || ''));
      const desc = stripPlanMarkdown(String(p.teacherMove || p.description || ''))
        + (p.studentMove ? `\n\nStudent: ${stripPlanMarkdown(String(p.studentMove))}` : '');
      return {
        step: label,
        description: desc,
        accommodations: p.accommodations ? JSON.stringify(p.accommodations) : undefined,
        phase: detectLessonPhaseId(label) ?? undefined,
      };
    });
  }

  if (data.assessment) normalized.assessment = stripPlanMarkdown(String(data.assessment));

  const successCriteriaData = data.successCriteria || data.success_criteria;
  if (Array.isArray(successCriteriaData)) {
    normalized.successCriteria = successCriteriaData.map((s: unknown) => stripPlanMarkdown(String(s)));
  }

  if (data.supports && typeof data.supports === 'object') {
    const s = data.supports as Record<string, unknown>;
    const all = s.all;
    const el = s.el || s.EL;
    const iep = s.iep504 || s['IEP/504'] || s.iep;
    normalized.supports = {
      all: Array.isArray(all) ? all.map((x) => stripPlanMarkdown(String(x))) : [],
      el: Array.isArray(el) ? el.map((x) => stripPlanMarkdown(String(x))) : [],
      iep504: Array.isArray(iep) ? iep.map((x) => stripPlanMarkdown(String(x))) : [],
    };
  }

  if (data.equityNotes || data.equity_notes || data.equity) {
    const e = data.equityNotes || data.equity_notes || data.equity;
    normalized.equityNotes = stripPlanMarkdown(typeof e === 'string' ? e : JSON.stringify(e));
  }

  if (data.exitSlip || data.exit_slip || data.exitTicket) {
    const e = data.exitSlip || data.exit_slip || data.exitTicket;
    if (typeof e === 'string') normalized.exitSlip = stripPlanMarkdown(e);
    else if (typeof e === 'object' && e !== null) {
      const ed = e as Record<string, unknown>;
      normalized.exitSlip = stripPlanMarkdown(String(ed.prompt || ed.question || e));
    }
  }

  if (Array.isArray(data.rubric)) {
    normalized.rubric = (data.rubric as unknown[]).map((item: unknown) => {
      const i = item as Record<string, unknown>;
      const score = Number(i.score || 0);
      return {
        score: (score >= 0 && score <= 3 ? score : 0) as 0 | 1 | 2 | 3,
        description: stripPlanMarkdown(String(i.description || i.criteria || '')),
      };
    });
  }

  const teacherMods = data.teacherModifications || data.teacher_modifications || data.modifications;
  if (Array.isArray(teacherMods)) {
    normalized.teacherModifications = teacherMods.map((m: unknown) => stripPlanMarkdown(String(m)));
  }

  const textOpts = data.textOptions || data.text_options || data.texts;
  if (Array.isArray(textOpts)) {
    normalized.textOptions = textOpts.map((text: unknown) => {
      const t = text as Record<string, unknown>;
      return {
        title: stripPlanMarkdown(String(t.title || '')),
        source: stripPlanMarkdown(String(t.source || '')),
        lexile: stripPlanMarkdown(String(t.lexile || t.level || '')),
        url: String(t.url || t.link || ''),
        rationale: stripPlanMarkdown(String(t.rationale || '')),
        selected: Boolean(t.selected),
        resourceId: t.resourceId ? String(t.resourceId) : undefined,
        representationTags: Array.isArray(t.representationTags) ? t.representationTags.map(String) : undefined,
      };
    });
  }

  if (data.instructionalModel || data.instructional_model || data.model) {
    const m = String(data.instructionalModel || data.instructional_model || data.model);
    const matched = INSTRUCTIONAL_MODELS.find(
      (im) => im.toLowerCase() === m.toLowerCase(),
    );
    if (matched) normalized.instructionalModel = matched;
  }

  if (Array.isArray(data.resourceIds)) normalized.resourceIds = data.resourceIds.map(String);
  if (data.exitSlipId) normalized.exitSlipId = String(data.exitSlipId);
  if (data.openerId) normalized.openerId = String(data.openerId);
  if (Array.isArray(data.misconceptionIds)) normalized.misconceptionIds = data.misconceptionIds.map(String);
  if (Array.isArray(data.evidenceCitationKeys)) {
    normalized.evidenceCitationKeys = data.evidenceCitationKeys.map(String);
  }

  return normalized;
}

/**
 * Attempts to extract lesson plan data from markdown-formatted response.
 * Same heuristics as before; left intact so demos keep working when Penny
 * forgets to emit the JSON block.
 */
function extractFromMarkdown(response: string): Partial<LessonPlanData> | null {
  const result: Partial<LessonPlanData> = {};

  const titlePatterns = [
    /^#\s+(.+)$/m,
    /\*\*Title[:\s]*\*\*\s*(.+)/i,
    /\*\*Lesson[:\s]*\*\*\s*(.+)/i,
    /^##\s+(.+)$/m,
    /Lesson\s+Plan[:\s]+(.+)/i,
    /\*\*(.+?)\*\*\s*\n.*(?:Grade|Subject|Duration)/i,
  ];
  for (const pattern of titlePatterns) {
    const match = response.match(pattern);
    if (match && match[1] && match[1].length > 5 && match[1].length < 200) {
      result.title = match[1].trim().replace(/\*\*/g, '');
      break;
    }
  }

  const gradePatterns = [
    /(?:Grade\s*Level|Grade)[:\s]*(\d+(?:th|st|nd|rd)?(?:\s*-\s*\d+(?:th|st|nd|rd)?)?)/i,
    /(\d+(?:th|st|nd|rd)\s+Grade)/i,
    /Grades?\s+(\d+(?:\s*-\s*\d+)?)/i,
  ];
  for (const pattern of gradePatterns) {
    const match = response.match(pattern);
    if (match && match[1]) {
      const cleaned = cleanExtractedText(match[1], 30);
      if (isValidField(cleaned) && /\d/.test(cleaned)) {
        result.gradeLevel = cleaned;
        break;
      }
    }
  }

  const knownSubjects = ['ELA', 'English Language Arts', 'English', 'Math', 'Mathematics', 'Science', 'Biology', 'Chemistry', 'Physics', 'History', 'Social Studies', 'Geography', 'Government', 'Economics', 'Art', 'Music', 'PE', 'Health', 'SEL'];
  for (const subj of knownSubjects) {
    if (response.toLowerCase().includes(subj.toLowerCase())) {
      result.subject = subj;
      break;
    }
  }
  if (!result.subject) {
    const subjectMatch = response.match(/(?:Subject|Content\s+Area|Course)[:\s]*([A-Za-z\s]+?)(?:\n|,|\|)/i);
    if (subjectMatch && subjectMatch[1]) {
      const cleaned = cleanExtractedText(subjectMatch[1], 50);
      if (isValidField(cleaned, 3) && cleaned.length < 50) {
        result.subject = cleaned;
      }
    }
  }

  const durationPatterns = [
    /(\d+[-–]\d+\s*(?:minutes?|mins?))/i,
    /(\d+\s*(?:minutes?|mins?|hours?|hrs?))/i,
    /((?:Single|Double|Block)\s*Period)/i,
    /Duration[:\s]*(\d+\s*min)/i,
  ];
  for (const pattern of durationPatterns) {
    const match = response.match(pattern);
    if (match && match[1]) {
      const cleaned = cleanExtractedText(match[1], 30);
      if (cleaned.length > 2 && cleaned.length < 40) {
        result.duration = cleaned;
        break;
      }
    }
  }

  const standardPatterns = [
    /(?:Standard|CCSS|NGSS)[:\s]*([^\n]+)/i,
    /(CCSS\.[A-Z\-\.0-9]+)/i,
  ];
  for (const pattern of standardPatterns) {
    const match = response.match(pattern);
    if (match) {
      result.standard = (match[1] || match[0]).trim();
      break;
    }
  }

  const objectivePatterns = [
    /(?:Learning\s+)?Objectives?[:\s]*\n((?:[-•*\d.]\s*.+\n?)+)/i,
    /(?:Learning\s+)?Objectives?[:\s]*\n?((?:\*\*.+\*\*\n?)+)/i,
    /Students?\s+will\s+(?:be\s+able\s+to\s+)?(.+?)(?:\n|$)/gi,
    /SWBAT\s+(.+?)(?:\n|$)/gi,
  ];
  for (const pattern of objectivePatterns) {
    const match = response.match(pattern);
    if (match && match[1]) {
      const objectives = match[1]
        .split('\n')
        .map((line) => line.replace(/^[-•*\d.]\s*/, '').replace(/\*\*/g, '').trim())
        .filter((line) => line.length > 10);
      if (objectives.length > 0) {
        result.objectives = objectives.map((o) => {
          const dok = extractDOKLevel(o);
          return dok ? { text: o, dok } : o;
        });
        break;
      }
    }
  }

  const materialsPatterns = [
    /Materials?[:\s]*\n((?:[-•*\d.]\s*.+\n?)+)/i,
    /(?:You(?:'ll)?\s+need|Required)[:\s]*\n((?:[-•*\d.]\s*.+\n?)+)/i,
  ];
  for (const pattern of materialsPatterns) {
    const match = response.match(pattern);
    if (match && match[1]) {
      result.materials = match[1]
        .split('\n')
        .map((line) => line.replace(/^[-•*\d.]\s*/, '').trim())
        .filter(Boolean);
      break;
    }
  }

  const phaseNames = ['Set Purpose', 'Modeling', 'Guided Practice', 'Independent Practice', 'Closure'];
  const procedure: { step: string; description: string; phase?: LessonPhaseId }[] = [];
  for (const phase of phaseNames) {
    const phasePattern = new RegExp(`(?:\\*\\*)?${phase}(?:\\*\\*)?[:\\s]*(?:\\(\\d+\\s*min(?:utes?)?\\))?[:\\s]*([^]*?)(?=(?:\\*\\*)?(?:${phaseNames.join('|')})|$)`, 'i');
    const match = response.match(phasePattern);
    if (match && match[1] && match[1].trim().length > 20) {
      procedure.push({
        step: phase,
        description: match[1].trim().substring(0, 1000),
        phase: detectLessonPhaseId(phase) ?? undefined,
      });
    }
  }
  if (procedure.length > 0) result.procedure = procedure;

  const assessmentPatterns = [
    /Assessment[:\s]*\n?([^]*?)(?=\n(?:##|\*\*(?:Exit|Rubric|Support)))/i,
    /Assessment[:\s]*([^\n]+)/i,
  ];
  for (const pattern of assessmentPatterns) {
    const match = response.match(pattern);
    if (match && match[1] && match[1].trim().length > 10) {
      result.assessment = match[1].trim().substring(0, 500);
      break;
    }
  }

  const exitSlipMatch = response.match(/Exit\s+Slip[:\s]*\n?([^]*?)(?=\n(?:##|\*\*Rubric))/i);
  if (exitSlipMatch && exitSlipMatch[1]) {
    result.exitSlip = exitSlipMatch[1].trim().substring(0, 300);
  }

  if (result.title || (result.objectives && result.objectives.length > 0) || result.procedure) {
    return result;
  }

  return null;
}

/**
 * Extracts student materials from Penny's response
 */
export function extractStudentMaterials(response: string): Partial<StudentMaterialsData> | null {
  const materials: Partial<StudentMaterialsData> = {
    worksheets: [],
    graphicOrganizers: [],
    readingPassages: [],
    sentenceFrames: [],
  };

  const sentenceFrameMatches = response.matchAll(/(?:Sentence (?:Frame|Stem|Starter)s?)[:\s]*\n((?:[-•*]\s*.+\n?)+)/gi);
  for (const match of sentenceFrameMatches) {
    const frames = match[1]
      .split('\n')
      .map((line) => line.replace(/^[-•*]\s*/, '').trim())
      .filter(Boolean);

    if (frames.length > 0) {
      materials.sentenceFrames!.push({
        purpose: 'General support',
        frames,
        targetLearners: ['all'],
      });
    }
  }

  const textMatches = response.matchAll(/(?:Text|Reading)[:\s]*\[([^\]]+)\]\(([^)]+)\)/gi);
  for (const match of textMatches) {
    materials.readingPassages!.push({
      title: match[1],
      source: 'Linked resource',
      url: match[2],
      lexile: '',
    });
  }

  if (
    materials.sentenceFrames!.length > 0
    || materials.readingPassages!.length > 0
    || materials.worksheets!.length > 0
    || materials.graphicOrganizers!.length > 0
  ) {
    return materials;
  }

  return null;
}

/**
 * Detects if Penny's response contains a draft lesson plan.
 */
export function containsLessonPlanDraft(response: string): boolean {
  const draftIndicators = [
    /learning\s+objective/i,
    /lesson\s+procedure/i,
    /set\s+purpose/i,
    /guided\s+practice/i,
    /independent\s+practice/i,
    /exit\s+slip/i,
    /success\s+criteria/i,
    /DOK\s+[234]/i,
  ];
  return draftIndicators.filter((pattern) => pattern.test(response)).length >= 3;
}

/**
 * Returns true when Penny is presenting 3 text options and waiting for the
 * teacher to choose one. Tightened from the original heuristic to require
 * three numbered options + an interrogative ("which would you like").
 */
export function isWaitingForTextSelection(response: string): boolean {
  // Look for three distinct option markers (Option 1/2/3 or 📚 markers).
  const optionMatches = response.match(/(?:option\s*[1-3]|📚\s*\*?\*?option\s*[1-3])/gi) ?? [];
  const distinctOptions = new Set(optionMatches.map((m) => m.match(/[1-3]/)?.[0])).size;
  if (distinctOptions < 3) return false;

  // Must be asking the teacher to choose.
  const askingPatterns = [
    /which\s+text\s+would\s+you/i,
    /which\s+(?:option\s+)?would\s+you\s+(?:like|prefer|choose)/i,
    /choose\s+(?:your|a|one)\s+text/i,
    /pick\s+(?:your|a|one)/i,
    /shall\s+I\s+build\s+the\s+lesson/i,
    /let\s+me\s+know\s+which/i,
  ];
  const isAsking = askingPatterns.some((p) => p.test(response));
  if (!isAsking) return false;

  // If a full lesson plan JSON is already in the response, we're past selection.
  if (/\[LESSON_PLAN_JSON\]/i.test(response)) return false;

  return true;
}

/**
 * Extract Penny's [QUICK_REPLIES] block.
 *
 * Contract (see PENNY_SYSTEM_PROMPT.md "Quick-Reply Chips"):
 * ```
 * [QUICK_REPLIES]
 * {"prompt": "...", "kind": "duration", "options": ["30 min", "45 min"]}
 * [/QUICK_REPLIES]
 * ```
 *
 * `options` may be either a flat array of strings or an array of
 * `{label, value?, hint?}` objects. Returns null when the block is missing,
 * malformed JSON, or empty.
 */
export function extractQuickReplies(raw: string): QuickReply | null {
  const match = raw.match(/\[QUICK_REPLIES\]([\s\S]*?)\[\/QUICK_REPLIES\]/i);
  if (!match) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1].trim());
  } catch {
    // Lenient fallback: a plain newline-separated list inside the block.
    const lines = match[1]
      .split('\n')
      .map((l) => l.replace(/^[-•*\d.\s]+/, '').trim())
      .filter(Boolean);
    if (lines.length === 0) return null;
    return {
      options: lines.map((label) => ({ label })),
    };
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as Record<string, unknown>;

  let options: QuickReplyOption[] = [];
  if (Array.isArray(p.options)) {
    options = p.options
      .map((o: unknown): QuickReplyOption | null => {
        if (typeof o === 'string') {
          const label = o.trim();
          return label ? { label } : null;
        }
        if (o && typeof o === 'object') {
          const obj = o as Record<string, unknown>;
          const label = String(obj.label ?? obj.text ?? obj.value ?? '').trim();
          if (!label) return null;
          return {
            label,
            value: typeof obj.value === 'string' ? obj.value : undefined,
            hint: typeof obj.hint === 'string' ? obj.hint : undefined,
          };
        }
        return null;
      })
      .filter((x): x is QuickReplyOption => x !== null);
  }

  if (options.length === 0) return null;

  return {
    prompt: typeof p.prompt === 'string' ? p.prompt : undefined,
    kind:
      typeof p.kind === 'string'
        ? (p.kind as QuickReply['kind'])
        : undefined,
    options,
    multi: Boolean(p.multi),
    blockFreeWrite: Boolean(p.blockFreeWrite ?? p.block_free_write),
  };
}

/**
 * Strip hidden machine blocks ([QUICK_REPLIES], [LESSON_PLAN_JSON]) from the
 * visible assistant message. The plan + chips are still applied; the bubble
 * just shouldn't include the raw JSON.
 */
export function stripHiddenBlocks(raw: string): string {
  return raw
    .replace(/\[QUICK_REPLIES\][\s\S]*?\[\/QUICK_REPLIES\]/gi, '')
    .replace(/\[LESSON_PLAN_JSON\][\s\S]*?\[\/LESSON_PLAN_JSON\]/gi, '')
    .replace(/```json[\s\S]*?```/gi, (block) =>
      // Keep prose JSON blocks visible (e.g. illustrative code) but drop the
      // ones that obviously contain a lesson plan or quick-replies payload.
      /(\bprocedure\b|\bobjectives\b|\bquickReplies\b|\bQUICK_REPLIES\b)/i.test(block) ? '' : block,
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Single entry point used by app/page.tsx#handleSendMessage. Returns a typed
 * envelope describing what we extracted plus signals the phase machine needs.
 */
export function parseTurn(rawResponse: string): ChatTurnResult {
  const extractedPlan = extractLessonPlanFromResponse(rawResponse);
  const hasJsonBlock = /\[LESSON_PLAN_JSON\]/i.test(rawResponse) || /```json/i.test(rawResponse);
  const quickReplies = extractQuickReplies(rawResponse);
  const visibleContent = stripHiddenBlocks(rawResponse);

  return {
    ok: true,
    plan: extractedPlan ?? undefined,
    rawResponse,
    visibleContent,
    signals: {
      isWaitingForTextSelection: isWaitingForTextSelection(rawResponse),
      containsLessonPlanDraft: containsLessonPlanDraft(rawResponse),
      hasJsonBlock,
      quickReplies,
    },
  };
}

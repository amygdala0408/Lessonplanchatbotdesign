import { LessonPlanData, StudentMaterialsData } from '../types';

/**
 * Cleans up extracted text - removes markdown formatting and validates content
 */
function cleanExtractedText(text: string | undefined, maxLength: number = 100): string {
  if (!text) return '';
  
  let cleaned = text
    .replace(/\*\*/g, '')           // Remove bold markers
    .replace(/\*/g, '')             // Remove italic markers
    .replace(/`/g, '')              // Remove code markers
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert links to text
    .replace(/^#+\s*/g, '')         // Remove heading markers
    .replace(/\s+/g, ' ')           // Normalize whitespace
    .trim();
  
  // Truncate if too long
  if (cleaned.length > maxLength) {
    cleaned = cleaned.substring(0, maxLength).trim();
  }
  
  return cleaned;
}

/**
 * Validates that a field looks like valid content (not garbage)
 */
function isValidField(text: string | undefined, minLength: number = 2): boolean {
  if (!text) return false;
  const cleaned = cleanExtractedText(text);
  
  // Reject if too short, too long, or contains suspicious patterns
  if (cleaned.length < minLength || cleaned.length > 150) return false;
  if (/^[\*\#\-\•\s]+$/.test(cleaned)) return false; // Only formatting chars
  if (/^\d+$/.test(cleaned)) return false; // Only numbers
  if (cleaned.split(' ').length > 20) return false; // Too many words for a field
  
  return true;
}

/**
 * Extracts structured lesson plan JSON from Penny's response
 * Looks for JSON between [LESSON_PLAN_JSON] tags or attempts to parse markdown structure
 */
export function extractLessonPlanFromResponse(response: string): Partial<LessonPlanData> | null {
  // First, try to find explicit JSON tags
  const jsonMatch = response.match(/\[LESSON_PLAN_JSON\]([\s\S]*?)\[\/LESSON_PLAN_JSON\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1].trim());
      return normalizeLessonPlanData(parsed);
    } catch (e) {
      console.error('Failed to parse lesson plan JSON:', e);
    }
  }

  // Try to find JSON code block
  const codeBlockMatch = response.match(/```json\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      return normalizeLessonPlanData(parsed);
    } catch (e) {
      console.error('Failed to parse JSON code block:', e);
    }
  }

  // Fallback: Try to extract structured data from markdown
  return extractFromMarkdown(response);
}

/**
 * Normalizes various JSON formats into our LessonPlanData structure
 */
function normalizeLessonPlanData(data: Record<string, unknown>): Partial<LessonPlanData> {
  const normalized: Partial<LessonPlanData> = {};

  // Map common field variations
  if (data.title) normalized.title = String(data.title);
  if (data.gradeLevel || data.grade_level || data.grade) {
    normalized.gradeLevel = String(data.gradeLevel || data.grade_level || data.grade);
  }
  if (data.subject) normalized.subject = String(data.subject);
  if (data.duration || data.time || data.length) {
    normalized.duration = String(data.duration || data.time || data.length);
  }
  if (data.standard || data.standards) {
    normalized.standard = String(data.standard || data.standards);
  }

  // Objectives
  if (Array.isArray(data.objectives)) {
    normalized.objectives = data.objectives.map(String);
  } else if (data.objective) {
    normalized.objectives = [String(data.objective)];
  } else if (data.learningObjective || data.learning_objective) {
    const obj = data.learningObjective || data.learning_objective;
    if (typeof obj === 'string') {
      normalized.objectives = [obj];
    } else if (typeof obj === 'object' && obj !== null) {
      const objData = obj as Record<string, unknown>;
      normalized.objectives = [String(objData.text || objData.objective || obj)];
    }
  }

  // Materials
  if (Array.isArray(data.materials)) {
    normalized.materials = data.materials.map(String);
  }

  // Procedure/Phases
  if (Array.isArray(data.procedure)) {
    normalized.procedure = data.procedure.map((step: unknown) => {
      if (typeof step === 'string') {
        return { step: step, description: '' };
      }
      const stepData = step as Record<string, unknown>;
      return {
        step: String(stepData.step || stepData.name || stepData.phase || ''),
        description: String(stepData.description || stepData.content || stepData.details || ''),
        accommodations: stepData.accommodations ? String(stepData.accommodations) : undefined,
      };
    });
  } else if (Array.isArray(data.phases)) {
    normalized.procedure = (data.phases as unknown[]).map((phase: unknown) => {
      const phaseData = phase as Record<string, unknown>;
      return {
        step: String(phaseData.name || phaseData.phase || phaseData.step || ''),
        description: String(phaseData.teacherMove || phaseData.description || '') + 
                    (phaseData.studentMove ? `\n\nStudent: ${phaseData.studentMove}` : ''),
        accommodations: phaseData.accommodations ? JSON.stringify(phaseData.accommodations) : undefined,
      };
    });
  }

  // Assessment
  if (data.assessment) {
    normalized.assessment = String(data.assessment);
  }

  // Success Criteria
  const successCriteriaData = data.successCriteria || data.success_criteria;
  if (Array.isArray(successCriteriaData)) {
    normalized.successCriteria = successCriteriaData.map((s: unknown) => String(s));
  }

  // Supports
  if (data.supports && typeof data.supports === 'object') {
    const supportsData = data.supports as Record<string, unknown>;
    const allSupports = supportsData.all;
    const elSupports = supportsData.el || supportsData.EL;
    const iepSupports = supportsData.iep504 || supportsData['IEP/504'] || supportsData.iep;
    
    normalized.supports = {
      all: Array.isArray(allSupports) ? allSupports.map((s: unknown) => String(s)) : [],
      el: Array.isArray(elSupports) ? elSupports.map((s: unknown) => String(s)) : [],
      iep504: Array.isArray(iepSupports) ? iepSupports.map((s: unknown) => String(s)) : [],
    };
  }

  // Equity Notes
  if (data.equityNotes || data.equity_notes || data.equity) {
    const equity = data.equityNotes || data.equity_notes || data.equity;
    if (typeof equity === 'string') {
      normalized.equityNotes = equity;
    } else if (typeof equity === 'object') {
      normalized.equityNotes = JSON.stringify(equity);
    }
  }

  // Exit Slip
  if (data.exitSlip || data.exit_slip || data.exitTicket) {
    const exitSlip = data.exitSlip || data.exit_slip || data.exitTicket;
    if (typeof exitSlip === 'string') {
      normalized.exitSlip = exitSlip;
    } else if (typeof exitSlip === 'object' && exitSlip !== null) {
      const exitData = exitSlip as Record<string, unknown>;
      normalized.exitSlip = String(exitData.prompt || exitData.question || exitSlip);
    }
  }

  // Rubric
  if (Array.isArray(data.rubric)) {
    normalized.rubric = (data.rubric as unknown[]).map((item: unknown) => {
      const itemData = item as Record<string, unknown>;
      return {
        score: Number(itemData.score || 0),
        description: String(itemData.description || itemData.criteria || ''),
      };
    });
  }

  // Teacher Modifications
  const teacherMods = data.teacherModifications || data.teacher_modifications || data.modifications;
  if (Array.isArray(teacherMods)) {
    normalized.teacherModifications = teacherMods.map((m: unknown) => String(m));
  }

  // Text Options
  const textOpts = data.textOptions || data.text_options || data.texts;
  if (Array.isArray(textOpts)) {
    normalized.textOptions = textOpts.map((text: unknown) => {
      const textData = text as Record<string, unknown>;
      return {
        title: String(textData.title || ''),
        source: String(textData.source || ''),
        lexile: String(textData.lexile || textData.level || ''),
        url: String(textData.url || textData.link || ''),
        rationale: String(textData.rationale || ''),
        selected: Boolean(textData.selected),
      };
    });
  }

  return normalized;
}

/**
 * Attempts to extract lesson plan data from markdown-formatted response
 */
function extractFromMarkdown(response: string): Partial<LessonPlanData> | null {
  const result: Partial<LessonPlanData> = {};
  
  // Extract title - multiple patterns
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

  // Extract grade level - multiple patterns
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

  // Extract subject - look for known subjects
  const knownSubjects = ['ELA', 'English Language Arts', 'English', 'Math', 'Mathematics', 'Science', 'Biology', 'Chemistry', 'Physics', 'History', 'Social Studies', 'Geography', 'Government', 'Economics', 'Art', 'Music', 'PE', 'Health'];
  for (const subj of knownSubjects) {
    if (response.toLowerCase().includes(subj.toLowerCase())) {
      result.subject = subj;
      break;
    }
  }
  // Fallback to pattern matching if no known subject found
  if (!result.subject) {
    const subjectMatch = response.match(/(?:Subject|Content\s+Area|Course)[:\s]*([A-Za-z\s]+?)(?:\n|,|\|)/i);
    if (subjectMatch && subjectMatch[1]) {
      const cleaned = cleanExtractedText(subjectMatch[1], 50);
      if (isValidField(cleaned, 3) && cleaned.length < 50) {
        result.subject = cleaned;
      }
    }
  }

  // Extract duration - look for time patterns
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

  // Extract standard
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

  // Extract objectives - more flexible patterns
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
        .map(line => line.replace(/^[-•*\d.]\s*/, '').replace(/\*\*/g, '').trim())
        .filter(line => line.length > 10);
      if (objectives.length > 0) {
        result.objectives = objectives;
        break;
      }
    }
  }

  // Extract materials
  const materialsPatterns = [
    /Materials?[:\s]*\n((?:[-•*\d.]\s*.+\n?)+)/i,
    /(?:You(?:'ll)?\s+need|Required)[:\s]*\n((?:[-•*\d.]\s*.+\n?)+)/i,
  ];
  for (const pattern of materialsPatterns) {
    const match = response.match(pattern);
    if (match && match[1]) {
      result.materials = match[1]
        .split('\n')
        .map(line => line.replace(/^[-•*\d.]\s*/, '').trim())
        .filter(Boolean);
      break;
    }
  }

  // Extract procedure/phases
  const phaseNames = ['Set Purpose', 'Modeling', 'Guided Practice', 'Independent Practice', 'Closure'];
  const procedure: { step: string; description: string }[] = [];
  
  for (const phase of phaseNames) {
    const phasePattern = new RegExp(`(?:\\*\\*)?${phase}(?:\\*\\*)?[:\\s]*(?:\\(\\d+\\s*min(?:utes?)?\\))?[:\\s]*([^]*?)(?=(?:\\*\\*)?(?:${phaseNames.join('|')})|$)`, 'i');
    const match = response.match(phasePattern);
    if (match && match[1] && match[1].trim().length > 20) {
      procedure.push({
        step: phase,
        description: match[1].trim().substring(0, 1000),
      });
    }
  }
  
  if (procedure.length > 0) {
    result.procedure = procedure;
  }

  // Extract assessment
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

  // Extract exit slip
  const exitSlipMatch = response.match(/Exit\s+Slip[:\s]*\n?([^]*?)(?=\n(?:##|\*\*Rubric))/i);
  if (exitSlipMatch && exitSlipMatch[1]) {
    result.exitSlip = exitSlipMatch[1].trim().substring(0, 300);
  }

  // Return if we found at least a title or objectives (more lenient)
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

  // Look for sentence frames/stems
  const sentenceFrameMatches = response.matchAll(/(?:Sentence (?:Frame|Stem|Starter)s?)[:\s]*\n((?:[-•*]\s*.+\n?)+)/gi);
  for (const match of sentenceFrameMatches) {
    const frames = match[1]
      .split('\n')
      .map(line => line.replace(/^[-•*]\s*/, '').trim())
      .filter(Boolean);
    
    if (frames.length > 0) {
      materials.sentenceFrames!.push({
        purpose: 'General support',
        frames,
        targetLearners: ['all'],
      });
    }
  }

  // Look for reading passages/texts
  const textMatches = response.matchAll(/(?:Text|Reading)[:\s]*\[([^\]]+)\]\(([^)]+)\)/gi);
  for (const match of textMatches) {
    materials.readingPassages!.push({
      title: match[1],
      source: 'Linked resource',
      url: match[2],
      lexile: '',
    });
  }

  // Only return if we found materials
  if (
    materials.sentenceFrames!.length > 0 ||
    materials.readingPassages!.length > 0 ||
    materials.worksheets!.length > 0 ||
    materials.graphicOrganizers!.length > 0
  ) {
    return materials;
  }

  return null;
}

/**
 * Detects if Penny's response contains a draft lesson plan
 * Used to determine when to show the Finalize button
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
  
  return draftIndicators.filter(pattern => pattern.test(response)).length >= 3;
}

/**
 * Checks if Penny is presenting text options and waiting for selection
 */
export function isWaitingForTextSelection(response: string): boolean {
  const textSelectionIndicators = [
    /option\s+[123]/i,
    /which\s+text\s+would\s+you/i,
    /choose\s+your\s+text/i,
    /select.*text/i,
    /📚.*option/i,
    /text\s+selection/i,
  ];
  
  const waitingIndicators = [
    /which.*would\s+you\s+(like|prefer)/i,
    /let\s+me\s+know/i,
    /what.*choice/i,
  ];
  
  const hasTextOptions = textSelectionIndicators.filter(p => p.test(response)).length >= 2;
  const isAsking = waitingIndicators.some(p => p.test(response));
  const hasFullLesson = containsLessonPlanDraft(response);
  
  return hasTextOptions && isAsking && !hasFullLesson;
}

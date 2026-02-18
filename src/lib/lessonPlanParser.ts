import { LessonPlanData, StudentMaterialsData } from '../types';

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
  if (Array.isArray(data.teacherModifications || data.teacher_modifications || data.modifications)) {
    normalized.teacherModifications = (
      data.teacherModifications || data.teacher_modifications || data.modifications as unknown[]
    ).map(String);
  }

  // Text Options
  if (Array.isArray(data.textOptions || data.text_options || data.texts)) {
    normalized.textOptions = (data.textOptions || data.text_options || data.texts as unknown[]).map((text: unknown) => {
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
  
  // Extract title from first heading
  const titleMatch = response.match(/^#\s+(.+)$/m) || response.match(/\*\*Title[:\s]*\*\*\s*(.+)/i);
  if (titleMatch) {
    result.title = titleMatch[1].trim();
  }

  // Extract grade level
  const gradeMatch = response.match(/(?:Grade|Level)[:\s]*([^\n,]+)/i);
  if (gradeMatch) {
    result.gradeLevel = gradeMatch[1].trim();
  }

  // Extract subject
  const subjectMatch = response.match(/(?:Subject|Content Area)[:\s]*([^\n,]+)/i);
  if (subjectMatch) {
    result.subject = subjectMatch[1].trim();
  }

  // Extract duration
  const durationMatch = response.match(/(?:Duration|Time|Length)[:\s]*([^\n,]+)/i);
  if (durationMatch) {
    result.duration = durationMatch[1].trim();
  }

  // Extract objectives from bullet points after "Objectives" or "Learning Objective"
  const objectivesSection = response.match(/(?:Learning\s+)?Objectives?[:\s]*\n((?:[-•*]\s*.+\n?)+)/i);
  if (objectivesSection) {
    result.objectives = objectivesSection[1]
      .split('\n')
      .map(line => line.replace(/^[-•*]\s*/, '').trim())
      .filter(Boolean);
  }

  // Extract materials
  const materialsSection = response.match(/Materials?[:\s]*\n((?:[-•*]\s*.+\n?)+)/i);
  if (materialsSection) {
    result.materials = materialsSection[1]
      .split('\n')
      .map(line => line.replace(/^[-•*]\s*/, '').trim())
      .filter(Boolean);
  }

  // Only return if we found meaningful data
  if (Object.keys(result).length > 2) {
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
  const indicators = [
    /learning\s+objective/i,
    /success\s+criteria/i,
    /procedure/i,
    /lesson\s+tasks?/i,
    /phase\s+\d/i,
    /set\s+purpose/i,
    /modeling/i,
    /guided\s+practice/i,
    /independent\s+practice/i,
    /closure/i,
    /exit\s+slip/i,
    /assessment/i,
  ];

  let matchCount = 0;
  for (const pattern of indicators) {
    if (pattern.test(response)) {
      matchCount++;
    }
  }

  // If we find at least 3 indicators, consider it a draft
  return matchCount >= 3;
}

import {
  type ConversationPhase,
  type LessonPlanData,
  type ChatTurnResult,
} from '../types';

// Pure transition logic for the conversation phase machine.
// All logic lives here so app/page.tsx stays a thin orchestrator and so the
// transitions are unit-testable in isolation.

export interface PhaseContext {
  current: ConversationPhase;
  plan: Partial<LessonPlanData>;
  turn: ChatTurnResult;
  /**
   * Conversation history (everything in the store, including the current
   * assistant turn after streaming finishes). Used by the unit-context guard
   * so we can detect whether Penny asked about where the lesson sits in the
   * unit before presenting text options. Optional for backward compatibility;
   * callers that omit it lose the guard.
   */
  messages?: { role: string; content: string }[];
}

export interface PhaseTransition {
  next: ConversationPhase;
  reason: string;
  toast?: { kind: 'info' | 'success'; message: string };
}

/**
 * Decide the next conversation phase based on the current phase and the most
 * recent assistant turn. Never moves backwards. Never skips text_selection.
 */
export function nextPhase({ current, plan, turn, messages }: PhaseContext): PhaseTransition {
  // 'complete' is terminal until reset.
  if (current === 'complete') {
    return { next: 'complete', reason: 'terminal' };
  }

  // If Penny just presented 3 text options and is waiting, pin us at text_selection
  // regardless of what we thought we were doing — UNLESS we're still in
  // `gathering` and the topic-confirm beat hasn't happened yet. The pedagogy
  // contract says: after subject+grade+duration land, ask one short question
  // about unit context (hook / mid-unit / transfer) BEFORE listing texts.
  // When the model jumps straight to texts, we keep the conversation parked
  // at gathering so the Finalize button stays gated and the regression is
  // visible during live verification.
  if (turn.signals.isWaitingForTextSelection) {
    if (current === 'gathering' && !hasUnitContextBeat(messages)) {
      return {
        next: 'gathering',
        reason: 'text options presented before unit-context turn',
        toast: {
          kind: 'info',
          message:
            'Penny jumped ahead to texts. Tell her where this lesson sits in the unit (hook, mid-unit, or transfer) before locking a reading in.',
        },
      };
    }
    return {
      next: 'text_selection',
      reason: 'assistant presented text options',
      toast: current !== 'text_selection'
        ? { kind: 'info', message: 'Penny listed 3 text options. Pick one to continue.' }
        : undefined,
    };
  }

  // Detect that the teacher has chosen a text: selection means at least one
  // textOption is selected AND we were previously waiting on selection.
  const textSelected = (plan.textOptions ?? []).some((t) => t.selected);

  switch (current) {
    case 'gathering': {
      // We move out of gathering only when Penny has presented texts (handled above).
      // Allow advance if a draft has appeared without text options (legacy demo flow).
      if (turn.signals.containsLessonPlanDraft && (plan.textOptions?.length ?? 0) === 0) {
        return {
          next: 'preview',
          reason: 'assistant produced a draft without using text options',
          toast: { kind: 'info', message: 'Penny is drafting. Click Finalize when ready.' },
        };
      }
      return { next: 'gathering', reason: 'still gathering' };
    }
    case 'text_selection': {
      if (textSelected) {
        return {
          next: 'instructional_model',
          reason: 'teacher selected a text',
          toast: { kind: 'info', message: 'Text locked in. Penny will now propose an instructional model.' },
        };
      }
      return { next: 'text_selection', reason: 'waiting on teacher selection' };
    }
    case 'instructional_model': {
      if (plan.instructionalModel) {
        return {
          next: 'preview',
          reason: 'instructional model chosen',
          toast: { kind: 'info', message: 'Model locked in. Review the lesson preview, then Finalize.' },
        };
      }
      // Tolerate skipping in P0 (catalogs not wired yet) — if Penny has produced
      // a draft, advance to preview.
      if (turn.signals.containsLessonPlanDraft) {
        return { next: 'preview', reason: 'draft produced; advancing to preview' };
      }
      return { next: 'instructional_model', reason: 'waiting on model choice' };
    }
    case 'preview': {
      // Stay in preview until Finalize is clicked. handleFinalize advances us
      // through 'drafting' -> 'complete' (with validation gating).
      return { next: 'preview', reason: 'preview displayed; awaiting finalize' };
    }
    case 'drafting': {
      // 'drafting' is the transient state during finalize. Only handleFinalize
      // moves us out of drafting (after validation passes).
      return { next: 'drafting', reason: 'finalize in progress' };
    }
  }

  return { next: current, reason: 'no transition' };
}

/**
 * Phase-machine guard for the Finalize button. Centralizes the rule so the UI
 * tooltip and the click handler agree.
 */
export function canFinalize(
  phase: ConversationPhase,
  isTyping: boolean,
  plan: Partial<LessonPlanData>,
): { ok: boolean; reason: string } {
  if (isTyping) return { ok: false, reason: 'Penny is still responding.' };
  if (phase === 'gathering') {
    return { ok: false, reason: 'Tell Penny what you want to teach first.' };
  }
  if (phase === 'text_selection') {
    return { ok: false, reason: 'Pick one of the 3 text options before finalizing.' };
  }
  if (phase === 'instructional_model') {
    return { ok: false, reason: 'Pick an instructional model before finalizing.' };
  }
  if (phase === 'drafting') {
    return { ok: false, reason: 'Finalize already in progress.' };
  }
  if (phase === 'complete') {
    return { ok: false, reason: 'Lesson is already finalized. Start a new conversation to edit.' };
  }
  // phase === 'preview'
  if ((plan.textOptions ?? []).filter((t) => t.selected).length !== 1) {
    return { ok: false, reason: 'Exactly one text must be selected.' };
  }
  return { ok: true, reason: 'Ready to finalize.' };
}

/**
 * Detect whether the conversation contains a "topic-confirm beat" — a prior
 * Penny turn that asked about unit context (hook / mid-unit / transfer) AND
 * a subsequent teacher reply. This is the pedagogy contract from the system
 * prompt; the phase machine uses it to refuse a premature jump from
 * `gathering` to `text_selection`.
 *
 * Heuristic, not parser:
 * - Walk assistant turns that came BEFORE the current (text-options) turn.
 * - Look for one that reads like a question (ends with `?` or contains a
 *   question phrasing) AND mentions unit-context vocabulary.
 * - Confirm there's at least one teacher reply between that question and
 *   the current turn.
 *
 * Returns `true` if we should allow the text_selection transition.
 * Returns `true` (permissive) when `messages` is omitted so legacy callers
 * keep working; the live app always passes `messages`.
 */
function hasUnitContextBeat(messages?: { role: string; content: string }[]): boolean {
  if (!messages || messages.length === 0) return true;

  // The current assistant turn is the last assistant entry. We're looking for
  // a prior assistant question, so scan everything before that.
  let currentAssistantIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      currentAssistantIdx = i;
      break;
    }
  }
  if (currentAssistantIdx <= 0) return false;

  const unitContextWords =
    /\b(hook|mid[- ]?unit|transfer|assessment day|where (this|the lesson|it) (sits|lands|fits)|earlier in the unit|later in the unit|unit context|beginning of the unit|end of the unit|new unit|deepening)\b/i;

  for (let i = currentAssistantIdx - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'assistant') continue;
    const content = m.content ?? '';
    if (!unitContextWords.test(content)) continue;
    const isQuestion = /\?/.test(content);
    if (!isQuestion) continue;

    // Must be followed by a teacher reply BEFORE the current assistant turn.
    for (let j = i + 1; j < currentAssistantIdx; j++) {
      if (messages[j].role === 'user') return true;
    }
  }
  return false;
}

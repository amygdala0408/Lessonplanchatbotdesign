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
export function nextPhase({ current, plan, turn }: PhaseContext): PhaseTransition {
  // 'complete' is terminal until reset.
  if (current === 'complete') {
    return { next: 'complete', reason: 'terminal' };
  }

  // If Penny just presented 3 text options and is waiting, pin us at text_selection
  // regardless of what we thought we were doing.
  if (turn.signals.isWaitingForTextSelection) {
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

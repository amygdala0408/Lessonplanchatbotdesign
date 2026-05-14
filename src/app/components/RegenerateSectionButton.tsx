/**
 * RegenerateSectionButton
 *
 * Hover affordance on a lesson section. On click, opens a small popover with
 * an optional teacher note, fires `/api/regenerate-section`, and hands the
 * fresh section value back to the parent so it can be merged into the plan.
 *
 * Pure presentation + state. Parent owns the actual plan-merge logic.
 */

'use client';

import { useState } from 'react';
import { Loader2, RefreshCw, X } from 'lucide-react';

import { cn } from '../../lib/utils';
import {
  regenerateSection,
  type RegenerableSectionId,
} from '../../lib/api/regenerateSection';
import type { LessonPlanData } from '../../types';

interface Props {
  plan: Partial<LessonPlanData>;
  section: RegenerableSectionId;
  /** Pre-filled rationale (e.g. from the scorer). Shown in the popover. */
  scorerRationale?: string;
  onRegenerated: (value: unknown) => void;
  className?: string;
  size?: 'sm' | 'md';
}

export function RegenerateSectionButton({
  plan,
  section,
  scorerRationale,
  onRegenerated,
  className,
  size = 'sm',
}: Props) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await regenerateSection({
        plan,
        section,
        teacherNote: note.trim() || undefined,
        scorerRationale,
      });
      if (!result.ok || result.value === undefined) {
        setError(result.error ?? 'Regenerate failed.');
        return;
      }
      onRegenerated(result.value);
      setOpen(false);
      setNote('');
    } finally {
      setPending(false);
    }
  };

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className={cn(
        'inline-flex items-center gap-1 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors print:hidden',
        size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1',
        className,
      )}
      title={`Regenerate the ${section} section`}
    >
      {pending ? (
        <Loader2 size={size === 'sm' ? 11 : 13} className="animate-spin" />
      ) : (
        <RefreshCw size={size === 'sm' ? 11 : 13} />
      )}
      <span>Regenerate</span>
    </button>
  );

  if (!open) return trigger;

  return (
    <div className={cn('relative inline-block print:hidden', className)}>
      {trigger}
      <div className="absolute right-0 top-full mt-1 z-30 w-72 rounded border border-gray-300 bg-white shadow-lg p-3 text-sm text-gray-800">
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold uppercase tracking-wider text-[10px] text-gray-600">
            Regenerate {section}
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-gray-400 hover:text-gray-700"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
        {scorerRationale && (
          <div className="mb-2 rounded bg-amber-50 border border-amber-200 text-amber-900 text-xs p-2">
            <span className="font-bold uppercase tracking-wider mr-1">Scorer note:</span>
            {scorerRationale}
          </div>
        )}
        <label className="block text-xs text-gray-600 mb-1">
          Optional note for Penny
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder='e.g. "make it more rigorous", "swap to a Socratic seminar"'
          rows={2}
          className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
          disabled={pending}
        />
        {error && (
          <p className="mt-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">
            {error}
          </p>
        )}
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={pending}
            className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleRun}
            disabled={pending}
            className="text-xs px-3 py-1 rounded bg-[#1a1a1a] text-white hover:bg-black disabled:opacity-50 inline-flex items-center gap-1"
          >
            {pending ? (
              <>
                <Loader2 size={11} className="animate-spin" />
                Regenerating…
              </>
            ) : (
              <>
                <RefreshCw size={11} />
                Run
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

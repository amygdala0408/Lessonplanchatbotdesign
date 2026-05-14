/**
 * QualityScorecardStrip
 *
 * Six-badge strip rendered at the top of the lesson plan when the EQuIP+UDL
 * quality scorer has run. One badge per dimension; clicking a badge expands
 * its rationale. The header shows the running average + pass/fail status.
 *
 * Pure presentational — takes a `qualityScore` shape that matches
 * `LessonPlanData.qualityScore`. The store/server populates this via
 * `toPersistableQualityScore(scoreLessonPlan(plan))`.
 */

'use client';

import { useState } from 'react';
import {
  Award,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

import { cn } from '../../lib/utils';
import type { LessonPlanData } from '../../types';

type DimensionId =
  | 'alignment_coherence'
  | 'instructional_design'
  | 'access_supports'
  | 'assessment_for_learning'
  | 'materials_licensing'
  | 'tone_clarity';

const DIMENSION_LABELS: Record<DimensionId, { short: string; full: string }> = {
  alignment_coherence: { short: 'Alignment', full: 'Alignment & Coherence' },
  instructional_design: { short: 'Design', full: 'Instructional Design' },
  access_supports: { short: 'Access', full: 'Access & Supports (UDL)' },
  assessment_for_learning: { short: 'Assessment', full: 'Assessment for Learning' },
  materials_licensing: { short: 'Materials', full: 'Materials & Licensing' },
  tone_clarity: { short: 'Tone', full: 'Tone & Clarity' },
};

const DIMENSION_ORDER: DimensionId[] = [
  'alignment_coherence',
  'instructional_design',
  'access_supports',
  'assessment_for_learning',
  'materials_licensing',
  'tone_clarity',
];

function scoreColor(score: number): { bg: string; text: string; border: string } {
  if (score >= 3) return { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300' };
  if (score === 2) return { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' };
  if (score === 1) return { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300' };
  return { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-300' };
}

interface Props {
  qualityScore: NonNullable<LessonPlanData['qualityScore']>;
  className?: string;
}

export function QualityScorecardStrip({ qualityScore, className }: Props) {
  const [openId, setOpenId] = useState<DimensionId | null>(null);

  const ordered = DIMENSION_ORDER.map((id) =>
    qualityScore.dimensions.find((d) => d.name === id),
  ).filter(Boolean) as NonNullable<LessonPlanData['qualityScore']>['dimensions'];

  const open = openId ? ordered.find((d) => d.name === openId) : null;

  return (
    <section
      className={cn(
        'border-2 border-[#1a1a1a] bg-white print:bg-white print:border-black',
        className,
      )}
      aria-label="EQuIP+UDL quality scorecard"
    >
      <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-[#1a1a1a] print:border-black">
        <div className="flex items-center gap-2">
          <Award size={18} className="text-amber-600" />
          <span className="font-['Oswald'] uppercase tracking-wider text-sm font-bold print:font-mono">
            EQuIP+UDL Scorecard
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="font-mono text-base">
            <span className="font-bold">{qualityScore.average.toFixed(2)}</span>
            <span className="text-gray-500"> / 3.00</span>
          </span>
          {qualityScore.passed ? (
            <span className="inline-flex items-center gap-1 rounded bg-emerald-100 text-emerald-800 px-2 py-0.5 text-xs font-bold uppercase tracking-wider border border-emerald-300">
              <CheckCircle2 size={12} />
              Passes gate
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded bg-rose-100 text-rose-800 px-2 py-0.5 text-xs font-bold uppercase tracking-wider border border-rose-300">
              <AlertTriangle size={12} />
              Below threshold
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 p-3 print:grid-cols-6">
        {ordered.map((d) => {
          const c = scoreColor(d.score);
          const isOpen = openId === d.name;
          const labels = DIMENSION_LABELS[d.name as DimensionId] ?? {
            short: d.name,
            full: d.name,
          };
          return (
            <button
              key={d.name}
              type="button"
              aria-pressed={isOpen}
              aria-label={`${labels.full}: ${d.score} of 3`}
              onClick={() => setOpenId((prev) => (prev === d.name ? null : (d.name as DimensionId)))}
              className={cn(
                'flex flex-col gap-1 rounded border-2 p-2 text-left transition-colors print:border print:bg-white',
                c.bg,
                c.border,
                isOpen && 'ring-2 ring-offset-1 ring-[#1a1a1a]',
              )}
            >
              <span className={cn('text-[10px] font-bold uppercase tracking-wider', c.text)}>
                {labels.short}
              </span>
              <span className={cn('text-2xl font-mono font-bold leading-none', c.text)}>
                {d.score}
                <span className="text-xs text-gray-500 font-sans"> / 3</span>
              </span>
            </button>
          );
        })}
      </div>

      {open && (
        <div className="border-t border-gray-200 px-4 py-3 text-sm bg-gray-50 print:bg-white">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="font-bold uppercase tracking-wider text-xs text-gray-700">
              {DIMENSION_LABELS[open.name as DimensionId]?.full ?? open.name}
            </span>
            <button
              type="button"
              onClick={() => setOpenId(null)}
              className="text-xs text-gray-500 hover:text-gray-800 inline-flex items-center gap-1 print:hidden"
            >
              Hide <ChevronUp size={12} />
            </button>
          </div>
          <p className="text-gray-800 leading-relaxed">{open.rationale}</p>
        </div>
      )}

      {!open && (
        <div className="px-4 py-2 text-[11px] text-gray-500 border-t border-gray-200 flex items-center gap-1 print:hidden">
          <ChevronDown size={12} />
          Click any badge for the rationale.
        </div>
      )}
    </section>
  );
}

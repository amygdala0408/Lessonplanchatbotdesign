'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Sparkles, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { InstructionalModel, LearnerProfile, LessonPlanData } from '../../types';

interface ModelCandidate {
  model: InstructionalModel;
  rationale: string;
  phaseCount: number;
}

interface InstructionalModelChooserProps {
  plan: Partial<LessonPlanData>;
  learnerProfile: LearnerProfile | null;
  conversationHistory: { role: string; content: string }[];
  theme?: 'default' | 'coffee';
  onSelect: (model: InstructionalModel) => void;
}

/**
 * Surfaced when `conversationPhase === 'instructional_model'`. Pulls 3 ranked
 * model candidates from `/api/catalog-candidates` and lets the teacher pick
 * with one click. Selection emits a confirmation message that advances the
 * phase machine to `preview`.
 */
export function InstructionalModelChooser({
  plan,
  learnerProfile,
  conversationHistory,
  theme = 'default',
  onSelect,
}: InstructionalModelChooserProps) {
  const [candidates, setCandidates] = useState<ModelCandidate[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const resp = await fetch('/api/catalog-candidates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan,
            learnerProfile,
            messages: conversationHistory.slice(-6),
          }),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = (await resp.json()) as { instructionalModels?: ModelCandidate[] };
        if (cancelled) return;
        setCandidates(data.instructionalModels ?? []);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          console.error('[InstructionalModelChooser] candidates fetch failed:', err);
          setError('Could not load model recommendations. Pick from the full list below.');
          // Fallback: hard-coded 7-model list so the teacher can still proceed.
          setCandidates([
            { model: 'Explicit Instruction', rationale: 'Gradual release with frequent CFUs.', phaseCount: 5 },
            { model: '5E Inquiry', rationale: 'Engage / Explore / Explain / Elaborate / Evaluate.', phaseCount: 5 },
            { model: 'Workshop Model', rationale: 'Mini-lesson + sustained practice + share.', phaseCount: 5 },
          ]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // We intentionally re-fetch only when the underlying signals change; the
    // conversation history slice is intentionally short to keep the body small.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.subject, plan.gradeLevel, plan.title, learnerProfile?.hasIEP, learnerProfile?.has504]);

  const isCoffee = theme === 'coffee';

  return (
    <div
      className={cn(
        'border-2 mt-3 mb-1 transition-colors',
        isCoffee ? 'border-[#e8e6df]/30 bg-[#3e3226] text-[#e8e6df]' : 'border-[#1a1a1a] bg-white text-[#1a1a1a]',
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2 px-4 py-2.5 border-b-2',
          isCoffee ? 'border-[#e8e6df]/20 bg-[#2c241b]' : 'border-[#1a1a1a] bg-[#f5f1e6]',
        )}
      >
        <Sparkles size={16} className="opacity-80" />
        <div>
          <div className="font-['Oswald'] uppercase tracking-widest text-xs font-bold">
            Pick an Instructional Model
          </div>
          <div className="text-[11px] opacity-70">
            Penny will draft the lesson around the model you choose.
          </div>
        </div>
      </div>

      <div className="p-3">
        {loading && (
          <div className="flex items-center justify-center py-6 opacity-70 text-xs">
            <Loader2 size={14} className="animate-spin mr-2" /> Ranking models for this lesson…
          </div>
        )}

        {!loading && error && (
          <div className="px-3 py-2 mb-2 text-[11px] border border-amber-700/60 bg-amber-50/10 text-amber-200">
            {error}
          </div>
        )}

        {!loading && candidates && candidates.length === 0 && (
          <div className="text-xs opacity-70 px-3 py-2">
            No catalog matches yet. Tell Penny more about the topic and try again.
          </div>
        )}

        {!loading && candidates && candidates.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {candidates.map((c, i) => (
              <motion.button
                key={c.model}
                type="button"
                whileHover={{ y: -1 }}
                whileTap={{ y: 0, scale: 0.99 }}
                onClick={() => onSelect(c.model)}
                className={cn(
                  'text-left p-3 border-2 transition-colors flex flex-col gap-2 group',
                  isCoffee
                    ? 'border-[#e8e6df]/20 hover:border-[#e8e6df] bg-[#2c241b]'
                    : 'border-[#1a1a1a]/20 hover:border-[#1a1a1a] bg-white',
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-['Oswald'] uppercase tracking-widest text-xs font-bold">
                    {c.model}
                  </div>
                  {i === 0 && (
                    <span
                      className={cn(
                        'text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5',
                        isCoffee ? 'bg-green-600/30 text-green-300' : 'bg-green-100 text-green-800',
                      )}
                    >
                      Top pick
                    </span>
                  )}
                </div>
                <p className="text-[11px] leading-snug opacity-90">{c.rationale}</p>
                <div
                  className={cn(
                    'mt-auto pt-2 text-[10px] uppercase tracking-widest font-bold flex items-center gap-1 opacity-70 group-hover:opacity-100',
                  )}
                >
                  Use this <ChevronRight size={12} />
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

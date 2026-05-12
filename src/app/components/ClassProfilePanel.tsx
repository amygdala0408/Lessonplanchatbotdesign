'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ChevronUp, Users, Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { LearnerProfile, NeedsTag } from '../../types';

interface ClassProfilePanelProps {
  profile: LearnerProfile | null;
  onChange: (profile: LearnerProfile) => void;
  theme?: 'default' | 'coffee';
  /**
   * `expanded` controls whether the editor body is open. The page sets this to
   * `true` during the gathering phase and `false` thereafter (teacher can still
   * click the chip to re-open).
   */
  expanded?: boolean;
  onToggle?: () => void;
}

/**
 * Canonical needs-tag enum mapped to teacher-friendly labels and a brief
 * description. The order is meant to feel natural to a teacher filling this
 * out before class — the most common needs first.
 */
const NEEDS_OPTIONS: { tag: NeedsTag; label: string; hint: string }[] = [
  { tag: 'attention_cues', label: 'Attention cues', hint: 'Trouble sustaining focus or following multi-step directions' },
  { tag: 'organization_support', label: 'Organization', hint: 'Needs externalized structure for multi-step tasks' },
  { tag: 'anxiety_support', label: 'Anxiety / overwhelm', hint: 'Benefits from previews, calm-down protocols, low-stakes practice' },
  { tag: 'language_support', label: 'Language access', hint: 'Bilingual glossaries, frames, sentence stems' },
  { tag: 'reading_support', label: 'Reading support', hint: 'Decoding or comprehension scaffolds; chunking; read-alouds' },
  { tag: 'writing_support', label: 'Writing support', hint: 'Frames, organizers, alternate response modes' },
  { tag: 'math_support', label: 'Math procedural', hint: 'Calculator lane, worked examples, manipulatives' },
  { tag: 'sensory_support', label: 'Sensory', hint: 'Color overlays, headphones, reduced-stimulus space' },
  { tag: 'executive_function_support', label: 'Executive function', hint: 'Checklists, timers, task chunking' },
  { tag: 'social_emotional_support', label: 'Social-emotional', hint: 'Peer scaffolds, role cards, restorative options' },
  { tag: 'extended_time', label: 'Extended time', hint: '1.5x or 2x time on tasks/assessments' },
  { tag: 'reduced_load', label: 'Reduced load', hint: '50% items, focus-on-essentials lane' },
  { tag: 'alt_response_modes', label: 'Alt response modes', hint: 'Oral / scribed / typed responses' },
];

const ML_LEVELS: { value: 1 | 2 | 3 | 4 | 5 | null; label: string; sub: string }[] = [
  { value: null, label: 'None', sub: 'No multilingual learners in this class' },
  { value: 1, label: 'Newcomer', sub: 'Entering / arrived in the last year' },
  { value: 2, label: 'Emerging', sub: 'Beginning English; relies on home language' },
  { value: 3, label: 'Developing', sub: 'Building academic English' },
  { value: 4, label: 'Expanding', sub: 'Independent on familiar topics' },
  { value: 5, label: 'Reclassified', sub: 'No longer designated as ML' },
];

const DEFAULT_PROFILE: LearnerProfile = {
  hasIEP: false,
  has504: false,
  multilingualLevel: null,
  homeLanguages: [],
  needsTags: [],
};

function summarize(p: LearnerProfile | null): string {
  if (!p) return 'Not set';
  const bits: string[] = [];
  if (p.hasIEP) bits.push('IEP');
  if (p.has504) bits.push('504');
  if (p.multilingualLevel != null && p.multilingualLevel <= 4) {
    bits.push(`ML L${p.multilingualLevel}`);
  }
  if (p.needsTags.length > 0) bits.push(`${p.needsTags.length} need tag${p.needsTags.length === 1 ? '' : 's'}`);
  if (p.homeLanguages.length > 0) bits.push(p.homeLanguages.join('/'));
  return bits.length === 0 ? 'No flags set' : bits.join(' · ');
}

export function ClassProfilePanel({
  profile,
  onChange,
  theme = 'default',
  expanded = true,
  onToggle,
}: ClassProfilePanelProps) {
  const p = profile ?? DEFAULT_PROFILE;
  const [languagesText, setLanguagesText] = useState(p.homeLanguages.join(', '));

  const update = (patch: Partial<LearnerProfile>) => {
    onChange({ ...p, ...patch });
  };

  const toggleNeed = (tag: NeedsTag) => {
    const has = p.needsTags.includes(tag);
    update({
      needsTags: has ? p.needsTags.filter((t) => t !== tag) : [...p.needsTags, tag],
    });
  };

  const commitLanguages = () => {
    const langs = languagesText
      .split(',')
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean);
    update({ homeLanguages: langs });
  };

  const isCoffee = theme === 'coffee';

  return (
    <div
      className={cn(
        'border-2 transition-colors duration-300 mb-3',
        isCoffee ? 'border-[#e8e6df]/30 bg-[#3e3226] text-[#e8e6df]' : 'border-[#1a1a1a] bg-white text-[#1a1a1a]',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'w-full flex items-center justify-between px-4 py-2.5 transition-colors',
          isCoffee ? 'hover:bg-[#4a3c2e]' : 'hover:bg-[#f5f1e6]',
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Users size={16} className="shrink-0 opacity-70" />
          <div className="text-left min-w-0">
            <div className="font-['Oswald'] uppercase tracking-widest text-xs font-bold">Class Profile</div>
            <div className="text-[11px] opacity-70 truncate">{summarize(profile)}</div>
          </div>
        </div>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 space-y-4 text-[12px]">
              {/* Plans row */}
              <div className="flex flex-wrap gap-3">
                <ToggleChip
                  label="Students with IEP"
                  active={p.hasIEP}
                  onToggle={() => update({ hasIEP: !p.hasIEP })}
                  theme={theme}
                />
                <ToggleChip
                  label="Students with 504 plan"
                  active={p.has504}
                  onToggle={() => update({ has504: !p.has504 })}
                  theme={theme}
                />
              </div>

              {/* ML row */}
              <div>
                <div className="font-['Oswald'] uppercase tracking-widest text-[10px] opacity-70 mb-1.5">
                  Multilingual learners
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ML_LEVELS.map((level) => (
                    <button
                      key={String(level.value)}
                      type="button"
                      onClick={() => update({ multilingualLevel: level.value })}
                      className={cn(
                        'px-2.5 py-1.5 border transition-colors text-left',
                        p.multilingualLevel === level.value
                          ? isCoffee
                            ? 'bg-[#e8e6df] text-[#2c241b] border-[#e8e6df] font-bold'
                            : 'bg-[#1a1a1a] text-white border-[#1a1a1a] font-bold'
                          : isCoffee
                            ? 'border-[#e8e6df]/30 hover:border-[#e8e6df]'
                            : 'border-[#1a1a1a]/30 hover:border-[#1a1a1a]',
                      )}
                      title={level.sub}
                    >
                      <div className="font-bold text-[11px]">{level.label}</div>
                      <div className="text-[10px] opacity-70 leading-tight">{level.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Languages */}
              <div>
                <label className="font-['Oswald'] uppercase tracking-widest text-[10px] opacity-70 block mb-1.5">
                  Home languages (ISO codes, comma-separated)
                </label>
                <input
                  type="text"
                  value={languagesText}
                  onChange={(e) => setLanguagesText(e.target.value)}
                  onBlur={commitLanguages}
                  placeholder="es, ht, vi"
                  className={cn(
                    'w-full px-2.5 py-1.5 border text-xs font-mono outline-none',
                    isCoffee
                      ? 'bg-[#2c241b] border-[#e8e6df]/30 focus:border-[#e8e6df]'
                      : 'bg-white border-[#1a1a1a]/30 focus:border-[#1a1a1a]',
                  )}
                />
              </div>

              {/* Needs tags */}
              <div>
                <div className="font-['Oswald'] uppercase tracking-widest text-[10px] opacity-70 mb-1.5">
                  Specific needs you&apos;re planning for
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {NEEDS_OPTIONS.map((opt) => {
                    const active = p.needsTags.includes(opt.tag);
                    return (
                      <button
                        key={opt.tag}
                        type="button"
                        title={opt.hint}
                        onClick={() => toggleNeed(opt.tag)}
                        className={cn(
                          'px-2 py-1 text-[11px] border transition-colors flex items-center gap-1',
                          active
                            ? isCoffee
                              ? 'bg-[#e8e6df] text-[#2c241b] border-[#e8e6df]'
                              : 'bg-[#1a1a1a] text-white border-[#1a1a1a]'
                            : isCoffee
                              ? 'border-[#e8e6df]/30 hover:border-[#e8e6df]'
                              : 'border-[#1a1a1a]/30 hover:border-[#1a1a1a]',
                        )}
                      >
                        {active && <Check size={11} />}
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Class size + notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-['Oswald'] uppercase tracking-widest text-[10px] opacity-70 block mb-1.5">
                    Class size
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={p.classSize ?? ''}
                    onChange={(e) =>
                      update({
                        classSize: e.target.value ? parseInt(e.target.value, 10) : undefined,
                      })
                    }
                    placeholder="e.g. 28"
                    className={cn(
                      'w-full px-2.5 py-1.5 border text-xs font-mono outline-none',
                      isCoffee
                        ? 'bg-[#2c241b] border-[#e8e6df]/30 focus:border-[#e8e6df]'
                        : 'bg-white border-[#1a1a1a]/30 focus:border-[#1a1a1a]',
                    )}
                  />
                </div>
                <div className="sm:col-span-1">
                  <label className="font-['Oswald'] uppercase tracking-widest text-[10px] opacity-70 block mb-1.5">
                    Notes (optional)
                  </label>
                  <input
                    type="text"
                    value={p.notes ?? ''}
                    onChange={(e) => update({ notes: e.target.value })}
                    placeholder="e.g. period 4, mixed grade"
                    className={cn(
                      'w-full px-2.5 py-1.5 border text-xs outline-none',
                      isCoffee
                        ? 'bg-[#2c241b] border-[#e8e6df]/30 focus:border-[#e8e6df]'
                        : 'bg-white border-[#1a1a1a]/30 focus:border-[#1a1a1a]',
                    )}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface ToggleChipProps {
  label: string;
  active: boolean;
  onToggle: () => void;
  theme: 'default' | 'coffee';
}

function ToggleChip({ label, active, onToggle, theme }: ToggleChipProps) {
  const isCoffee = theme === 'coffee';
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'px-3 py-1.5 border text-[11px] font-["Oswald"] uppercase tracking-widest font-bold flex items-center gap-1.5 transition-colors',
        active
          ? isCoffee
            ? 'bg-[#e8e6df] text-[#2c241b] border-[#e8e6df]'
            : 'bg-[#1a1a1a] text-white border-[#1a1a1a]'
          : isCoffee
            ? 'border-[#e8e6df]/30 hover:border-[#e8e6df]'
            : 'border-[#1a1a1a]/30 hover:border-[#1a1a1a]',
      )}
    >
      {active && <Check size={12} />}
      {label}
    </button>
  );
}

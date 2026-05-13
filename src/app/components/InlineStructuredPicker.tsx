'use client';

import React from 'react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';

interface InlineStructuredPickerProps {
  /** Which field this picker is for. Drives both the prompt text and the option list. */
  field: 'subject' | 'gradeLevel' | 'duration';
  onPick: (value: string) => void;
  theme?: 'default' | 'coffee';
}

const SUBJECT_OPTIONS: { label: string; value: string }[] = [
  { label: 'ELA / English', value: 'ELA' },
  { label: 'Math', value: 'Math' },
  { label: 'Science', value: 'Science' },
  { label: 'Social Studies', value: 'Social Studies' },
  { label: 'SEL / Advisory', value: 'SEL' },
];

const GRADE_OPTIONS: { label: string; value: string }[] = [
  { label: '9th', value: '9' },
  { label: '10th', value: '10' },
  { label: '11th', value: '11' },
  { label: '12th', value: '12' },
  { label: 'Mixed 9–12', value: '9-12' },
];

const DURATION_OPTIONS: { label: string; value: string; hint?: string }[] = [
  { label: '30 min', value: '30 minutes' },
  { label: '45 min', value: '45 minutes' },
  { label: '60 min', value: '60 minutes' },
  { label: 'Block', value: '90 minutes', hint: '90-min block' },
  { label: 'Multi-day', value: 'Multi-day' },
];

const META: Record<InlineStructuredPickerProps['field'], { title: string; subtitle: string; options: { label: string; value: string; hint?: string }[]; userPrompt: (label: string) => string }> = {
  subject: {
    title: 'Pick the subject',
    subtitle: 'One click sets the subject and tells Penny.',
    options: SUBJECT_OPTIONS,
    userPrompt: (label) => `Subject: ${label}.`,
  },
  gradeLevel: {
    title: 'Pick the grade',
    subtitle: 'One click sets the grade level.',
    options: GRADE_OPTIONS,
    userPrompt: (label) => `Grade level: ${label}.`,
  },
  duration: {
    title: 'Pick the class length',
    subtitle: 'One click sets the lesson duration.',
    options: DURATION_OPTIONS,
    userPrompt: (label) => `Class length: ${label}.`,
  },
};

/**
 * Inline structured picker rendered during the `gathering` phase when one of
 * subject / gradeLevel / duration is missing from the plan. One click sets
 * the value on the plan and sends a confirmation user turn so Penny can move
 * forward without asking. Replaces the wall of "what grade are you teaching?"
 * follow-up questions.
 */
export function InlineStructuredPicker({ field, onPick, theme = 'default' }: InlineStructuredPickerProps) {
  const meta = META[field];
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
        <div>
          <div className="font-['Oswald'] uppercase tracking-widest text-xs font-bold">{meta.title}</div>
          <div className="text-[11px] opacity-70">{meta.subtitle}</div>
        </div>
      </div>

      <div className="p-3 flex flex-wrap gap-2">
        {meta.options.map((opt) => (
          <motion.button
            key={opt.value}
            type="button"
            whileHover={{ y: -1 }}
            whileTap={{ y: 0, scale: 0.99 }}
            onClick={() => onPick(meta.userPrompt(opt.label))}
            className={cn(
              'px-3 py-2 text-xs border-2 transition-colors text-left flex flex-col items-start',
              'shadow-[2px_2px_0px_0px_rgba(0,0,0,0.15)] active:translate-y-[1px] active:translate-x-[1px] active:shadow-none',
              isCoffee
                ? 'border-[#e8e6df]/30 hover:border-[#e8e6df] bg-[#2c241b]'
                : 'border-[#1a1a1a]/30 hover:border-[#1a1a1a] bg-white',
            )}
          >
            <span className="font-['Oswald'] uppercase tracking-widest font-bold">{opt.label}</span>
            {opt.hint && <span className="text-[10px] opacity-70 mt-0.5">{opt.hint}</span>}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

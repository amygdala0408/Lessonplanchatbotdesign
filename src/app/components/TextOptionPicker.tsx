'use client';

import React from 'react';
import { motion } from 'motion/react';
import { BookOpen, ExternalLink, Volume2, Captions, FileText, Keyboard, ShieldCheck, Sparkles } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { TextOption } from '../../types';

interface TextOptionPickerProps {
  options: TextOption[];
  /** Called with the *index* of the chosen option. */
  onPick: (index: number) => void;
  theme?: 'default' | 'coffee';
}

/**
 * One-click text picker rendered during the `text_selection` phase. Replaces
 * the "type 'I'll use option 2'" pattern with a card grid the teacher can
 * actually scan and click. Pulls accessibility chips from
 * `TextOption.accessibility` so license / audio / captions are visible at a
 * glance.
 */
export function TextOptionPicker({ options, onPick, theme = 'default' }: TextOptionPickerProps) {
  const isCoffee = theme === 'coffee';
  if (!options || options.length === 0) return null;

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
        <BookOpen size={16} className="opacity-80" />
        <div className="flex-1">
          <div className="font-['Oswald'] uppercase tracking-widest text-xs font-bold">
            Pick a Text
          </div>
          <div className="text-[11px] opacity-70">
            One click locks the text and moves us to the instructional model.
          </div>
        </div>
      </div>

      <div className="p-3 grid grid-cols-1 md:grid-cols-3 gap-2">
        {options.slice(0, 3).map((opt, i) => {
          const isSelected = opt.selected === true;
          const accessibility = opt.accessibility ?? {};
          return (
            <motion.button
              key={`${opt.title}-${i}`}
              type="button"
              whileHover={{ y: -1 }}
              whileTap={{ y: 0, scale: 0.99 }}
              onClick={() => onPick(i)}
              className={cn(
                'text-left p-3 border-2 transition-colors flex flex-col gap-2 group h-full',
                isSelected
                  ? 'border-green-600 bg-green-50 text-[#1a1a1a]'
                  : isCoffee
                    ? 'border-[#e8e6df]/20 hover:border-[#e8e6df] bg-[#2c241b]'
                    : 'border-[#1a1a1a]/20 hover:border-[#1a1a1a] bg-white',
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="font-['Oswald'] uppercase tracking-widest text-xs font-bold leading-snug">
                  {opt.title || `Option ${i + 1}`}
                </div>
                {i === 0 && !isSelected && (
                  <span
                    className={cn(
                      'text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 shrink-0',
                      isCoffee ? 'bg-green-600/30 text-green-300' : 'bg-green-100 text-green-800',
                    )}
                  >
                    Top pick
                  </span>
                )}
                {isSelected && (
                  <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 bg-green-600 text-white shrink-0">
                    Selected
                  </span>
                )}
              </div>

              <div className="text-[11px] opacity-80 leading-snug">
                <div className="font-bold">{opt.source}</div>
                {opt.lexile && <div className="opacity-80">Lexile {opt.lexile}</div>}
              </div>

              {opt.rationale && (
                <p className="text-[11px] leading-snug opacity-90 italic">{opt.rationale}</p>
              )}

              <div className="flex flex-wrap gap-1 mt-1">
                {accessibility.audio && (
                  <span title="Audio available" className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 border border-current opacity-80">
                    <Volume2 size={9} /> Audio
                  </span>
                )}
                {accessibility.captions && (
                  <span title="Captions" className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 border border-current opacity-80">
                    <Captions size={9} /> CC
                  </span>
                )}
                {accessibility.transcript && (
                  <span title="Transcript" className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 border border-current opacity-80">
                    <FileText size={9} /> Transcript
                  </span>
                )}
                {accessibility.keyboardNav && (
                  <span title="Keyboard navigable" className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 border border-current opacity-80">
                    <Keyboard size={9} /> Keyboard
                  </span>
                )}
                {accessibility.accountRequired === false && (
                  <span title="No account required" className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 border border-current opacity-80">
                    <ShieldCheck size={9} /> Free access
                  </span>
                )}
              </div>

              <div className="mt-auto pt-2 flex items-center justify-between text-[10px] uppercase tracking-widest font-bold">
                {opt.url ? (
                  <a
                    href={opt.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 opacity-70 hover:opacity-100"
                  >
                    <ExternalLink size={10} /> Preview
                  </a>
                ) : <span />}
                <span className="opacity-70 group-hover:opacity-100 inline-flex items-center gap-1">
                  <Sparkles size={11} /> Use this
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

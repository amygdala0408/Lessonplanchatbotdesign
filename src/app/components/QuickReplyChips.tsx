'use client';

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Check, Send } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { QuickReply } from '../../types';

interface QuickReplyChipsProps {
  reply: QuickReply;
  /**
   * Called with the value(s) to send back as the user's reply.
   * For single-select, called once per click.
   * For multi-select, called when the teacher hits "Send selections".
   */
  onPick: (value: string) => void;
  theme?: 'default' | 'coffee';
  /** When true (the chip row has been used), the chips render as disabled. */
  disabled?: boolean;
}

/**
 * Renders the parsed [QUICK_REPLIES] block as clickable chips below the
 * assistant message bubble. One click = one user turn for single-select;
 * for multi-select, the teacher picks one or more then submits.
 */
export function QuickReplyChips({ reply, onPick, theme = 'default', disabled = false }: QuickReplyChipsProps) {
  const isCoffee = theme === 'coffee';
  const [selected, setSelected] = useState<string[]>([]);

  const handleSinglePick = (option: { label: string; value?: string }) => {
    if (disabled) return;
    onPick(option.value ?? option.label);
  };

  const handleToggleMulti = (value: string) => {
    if (disabled) return;
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  };

  const handleSubmitMulti = () => {
    if (disabled || selected.length === 0) return;
    onPick(selected.join(', '));
    setSelected([]);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'mt-3 ml-[72px] flex flex-col gap-2 max-w-[calc(85%-72px)]',
        disabled && 'opacity-50',
      )}
    >
      {reply.prompt && (
        <div
          className={cn(
            'text-[10px] uppercase tracking-widest font-bold opacity-60',
            isCoffee ? 'text-[#e8e6df]' : 'text-[#1a1a1a]',
          )}
        >
          {reply.prompt}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {reply.options.map((opt, i) => {
          const value = opt.value ?? opt.label;
          const isSelected = selected.includes(value);
          return (
            <button
              key={`${value}-${i}`}
              type="button"
              disabled={disabled}
              onClick={() =>
                reply.multi ? handleToggleMulti(value) : handleSinglePick(opt)
              }
              title={opt.hint}
              className={cn(
                'px-3 py-2 text-xs border-2 transition-all flex items-start gap-2 max-w-xs text-left',
                'shadow-[2px_2px_0px_0px_rgba(0,0,0,0.2)] active:translate-y-[1px] active:translate-x-[1px] active:shadow-none',
                'disabled:cursor-not-allowed disabled:active:translate-x-0 disabled:active:translate-y-0',
                reply.multi && isSelected
                  ? isCoffee
                    ? 'bg-[#e8e6df] text-[#2c241b] border-[#e8e6df]'
                    : 'bg-[#1a1a1a] text-white border-[#1a1a1a]'
                  : isCoffee
                    ? 'bg-[#3e3226] text-[#e8e6df] border-[#e8e6df]/30 hover:border-[#e8e6df] hover:bg-[#4a3b2d]'
                    : 'bg-white text-[#1a1a1a] border-[#1a1a1a]/30 hover:border-[#1a1a1a] hover:bg-[#f0ece2]',
              )}
            >
              {reply.multi && (
                <span
                  className={cn(
                    'mt-0.5 w-3 h-3 border flex items-center justify-center shrink-0',
                    isSelected
                      ? 'bg-current border-current'
                      : isCoffee
                        ? 'border-[#e8e6df]/50'
                        : 'border-[#1a1a1a]/40',
                  )}
                >
                  {isSelected && <Check size={9} className="text-current invert" />}
                </span>
              )}
              <div className="flex-1">
                <div className="font-bold leading-tight">{opt.label}</div>
                {opt.hint && (
                  <div className="text-[10px] opacity-70 mt-0.5 leading-snug">{opt.hint}</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
      {reply.multi && (
        <button
          type="button"
          onClick={handleSubmitMulti}
          disabled={disabled || selected.length === 0}
          className={cn(
            'self-start mt-1 px-4 py-2 text-xs font-["Oswald"] uppercase tracking-widest font-bold border-2 transition-all flex items-center gap-2',
            'shadow-[3px_3px_0px_0px_rgba(0,0,0,0.2)] active:translate-y-[1px] active:translate-x-[1px] active:shadow-none',
            'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-x-0 disabled:active:translate-y-0',
            isCoffee
              ? 'bg-[#e8e6df] text-[#2c241b] border-[#e8e6df]'
              : 'bg-[#1a1a1a] text-white border-[#1a1a1a]',
          )}
        >
          <Send size={12} />
          Send {selected.length > 0 ? `(${selected.length})` : ''}
        </button>
      )}
    </motion.div>
  );
}

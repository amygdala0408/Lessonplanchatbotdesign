'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, X } from 'lucide-react';
import { useStore, type ModelTurn } from '@/store/useStore';
import { cn } from '@/lib/utils';

/**
 * A subtle "which LLM just handled this?" badge.
 *
 * Click to expand a popover with the last ~6 turns and which task/model
 * handled each. Makes the multi-LLM strategy visible to the user without
 * cluttering the chat surface.
 */

function prettyModel(id: string): string {
  // anthropic/claude-sonnet-4.5 → Claude Sonnet 4.5
  if (id.includes('/')) {
    const [, name] = id.split('/');
    return name
      .replace(/-/g, ' ')
      .replace(/(^|\s)\S/g, (s) => s.toUpperCase())
      .replace('Gpt', 'GPT');
  }
  return id;
}

function prettyTask(task: ModelTurn['task']): string {
  return task[0].toUpperCase() + task.slice(1);
}

function taskColor(task: ModelTurn['task']): string {
  switch (task) {
    case 'chat':
      return 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300';
    case 'picker':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
    case 'generator':
      return 'bg-rose-500/15 text-rose-700 dark:text-rose-300';
    case 'scorer':
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-300';
    case 'patcher':
      return 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300';
    case 'accommodation':
      return 'bg-violet-500/15 text-violet-700 dark:text-violet-300';
  }
}

export function ModelStatusChip() {
  const modelTurns = useStore((s) => s.modelTurns);
  const [open, setOpen] = useState(false);
  const latest = modelTurns[modelTurns.length - 1];

  if (!latest) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Show model routing history"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-black/5 dark:border-white/10',
          'bg-white/70 dark:bg-zinc-900/70 backdrop-blur-md',
          'px-2.5 py-1 text-[10px] font-medium tracking-wide',
          'shadow-sm hover:shadow transition-all',
          'text-zinc-600 dark:text-zinc-300',
        )}
      >
        <Sparkles className="w-3 h-3 opacity-70" />
        <span className={cn('px-1.5 py-0.5 rounded-full', taskColor(latest.task))}>
          {prettyTask(latest.task)}
        </span>
        <span className="opacity-80">{prettyModel(latest.model)}</span>
        <span className="opacity-50 tabular-nums">{latest.latencyMs}ms</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className={cn(
              'absolute right-0 mt-2 w-80 z-50',
              'rounded-xl border border-black/5 dark:border-white/10',
              'bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md',
              'shadow-xl ring-1 ring-black/5',
              'p-3',
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-zinc-500 dark:text-zinc-400">
                Multi-LLM Routing
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <ul className="space-y-1.5">
              {modelTurns
                .slice(-6)
                .reverse()
                .map((t, i) => (
                  <li
                    key={`${t.at}-${i}`}
                    className="flex items-center justify-between gap-2 text-[11px]"
                  >
                    <span className={cn('px-1.5 py-0.5 rounded-full font-medium', taskColor(t.task))}>
                      {prettyTask(t.task)}
                    </span>
                    <span className="flex-1 truncate text-zinc-700 dark:text-zinc-200">
                      {prettyModel(t.model)}
                    </span>
                    {t.tools && t.tools.length > 0 && (
                      <span className="text-[9px] uppercase tracking-wider text-zinc-400">
                        {t.tools.join(', ')}
                      </span>
                    )}
                    <span className="tabular-nums text-zinc-400 w-12 text-right">
                      {t.latencyMs}ms
                    </span>
                  </li>
                ))}
            </ul>
            <div className="mt-2 pt-2 border-t border-black/5 dark:border-white/10 text-[10px] text-zinc-500 dark:text-zinc-400">
              Routed via Vercel AI Gateway. Each task uses the best-fit model.
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

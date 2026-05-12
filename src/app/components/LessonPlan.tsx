import React, { forwardRef, useMemo } from 'react';
import { cn } from '../../lib/utils';
import { LessonPlanData, Objective, Standard, LESSON_PHASE_ORDER, LessonPhaseId } from '../../types';
import type { LessonPackagePayload } from '../../store/useStore';
import { ExternalLink, Volume2, BookOpen, Target, CheckCircle2, AlertTriangle, Languages, Quote, ShieldCheck } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

const PHASE_DISPLAY: Record<LessonPhaseId, string> = {
  launch: 'Launch',
  model: 'Model',
  guided_practice: 'Guided Practice',
  independent_practice: 'Independent Practice',
  exit_slip: 'Exit Slip',
};

function getObjectiveText(o: string | Objective): string {
  return typeof o === 'string' ? o : o.text;
}

function getObjectiveDOK(o: string | Objective): number | null {
  if (typeof o === 'object' && o.dok) return o.dok;
  return null;
}

function getStandardText(s: string | Standard | undefined): string {
  if (!s) return '';
  if (typeof s === 'string') return s;
  return [s.code, s.description].filter(Boolean).join(' — ');
}

// Generate a stable reference ID based on lesson content
function generateStableRefId(title: string, subject: string, gradeLevel: string): string {
  const input = `${title}-${subject}-${gradeLevel}`.toLowerCase();
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36).toUpperCase().slice(0, 6);
}

// Extract DOK level from objective text
function extractDOKLevel(objective: string): number | null {
  const dokMatch = objective.match(/DOK\s*(\d)/i);
  if (dokMatch) return parseInt(dokMatch[1]);
  
  // Infer DOK from keywords
  const dok4Keywords = ['design', 'create', 'synthesize', 'apply across', 'connect'];
  const dok3Keywords = ['analyze', 'explain why', 'compare', 'contrast', 'evaluate', 'justify', 'argue'];
  const dok2Keywords = ['summarize', 'describe', 'explain', 'interpret', 'classify'];
  
  const lowerObj = objective.toLowerCase();
  if (dok4Keywords.some(k => lowerObj.includes(k))) return 4;
  if (dok3Keywords.some(k => lowerObj.includes(k))) return 3;
  if (dok2Keywords.some(k => lowerObj.includes(k))) return 2;
  return null;
}

// Helper to format text with proper line breaks for steps, bullets, numbered items
const FormattedText = ({ text, className = "" }: { text: string; className?: string }) => {
  if (!text) return null;
  
  // Split by common delimiters: numbered items (1. 2. etc), bullets (- or •), or double newlines
  const lines = text
    .split(/(?=\d+\.\s)|(?=[-•]\s)|(?:\n\n)|\n(?=[A-Z])/)
    .map(line => line.trim())
    .filter(line => line.length > 0);
  
  if (lines.length <= 1) {
    // Check if it's a single block that should be split by sentences for teacher moves
    const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z])/);
    if (sentences.length > 2) {
      return (
        <div className={className}>
          {sentences.map((sentence, i) => (
            <p key={i} className="mb-2 last:mb-0">{sentence.trim()}</p>
          ))}
        </div>
      );
    }
    return <p className={className}>{text}</p>;
  }
  
  // Check if it's a numbered list
  const isNumberedList = lines.some(line => /^\d+\./.test(line));
  // Check if it's a bulleted list
  const isBulletedList = lines.some(line => /^[-•]/.test(line));
  
  if (isNumberedList) {
    return (
      <ol className={cn("list-decimal pl-5 space-y-2", className)}>
        {lines.map((line, i) => (
          <li key={i} className="pl-1">{line.replace(/^\d+\.\s*/, '')}</li>
        ))}
      </ol>
    );
  }
  
  if (isBulletedList) {
    return (
      <ul className={cn("list-disc pl-5 space-y-2", className)}>
        {lines.map((line, i) => (
          <li key={i}>{line.replace(/^[-•]\s*/, '')}</li>
        ))}
      </ul>
    );
  }
  
  // Default: render as paragraphs
  return (
    <div className={className}>
      {lines.map((line, i) => (
        <p key={i} className="mb-2 last:mb-0">{line}</p>
      ))}
    </div>
  );
};

type LessonPlanRenderProps = LessonPlanData & {
  lessonPackage?: LessonPackagePayload | null;
  /**
   * Penny-emitted student materials (sentence frames, reading passages, etc.)
   * extracted from the chat stream. Used as a fallback when the catalog-
   * resolved lessonPackage does not cover the sentence-frame slot.
   */
  studentMaterials?: {
    sentenceFrames?: { purpose?: string; frames: string[] }[];
    readingPassages?: { title: string; source: string; url: string; lexile?: string; content?: string }[];
  };
};

export const LessonPlan = forwardRef<HTMLDivElement, LessonPlanRenderProps>(({
  title,
  gradeLevel,
  subject,
  duration,
  standard,
  objectives,
  materials,
  procedure,
  assessment,
  successCriteria,
  supports,
  equityNotes,
  exitSlip,
  rubric,
  textOptions,
  teacherModifications,
  lessonPackage,
  studentMaterials,
}, ref) => {
  // Generate stable reference ID
  const refId = useMemo(() => 
    generateStableRefId(title || '', subject || '', gradeLevel || ''), 
    [title, subject, gradeLevel]
  );

  // Build sentence-frame display list. Prefers parser-extracted student
  // material frames (structured by purpose) and falls back to scanning
  // `supports` for inline frames so legacy outputs still render.
  const extractedSentenceFrames = useMemo(() => {
    const frames: string[] = [];
    if (studentMaterials?.sentenceFrames && studentMaterials.sentenceFrames.length > 0) {
      for (const slot of studentMaterials.sentenceFrames) {
        if (slot.purpose) frames.push(`__purpose__:${slot.purpose}`);
        for (const f of slot.frames ?? []) frames.push(f);
      }
      return frames;
    }
    if (supports?.all) {
      supports.all.forEach(s => {
        if (s.includes('"') || s.includes('"') || s.includes('___')) {
          frames.push(s);
        }
      });
    }
    if (supports?.el) {
      supports.el.forEach(s => {
        if (s.includes('"') || s.includes('"') || s.includes('___')) {
          frames.push(s);
        }
      });
    }
    return frames;
  }, [studentMaterials, supports]);

  return (
    <div ref={ref} className="bg-[#f0ece2] text-[#1a1a1a] p-12 min-h-screen font-['DM_Sans'] relative overflow-hidden print:p-8 print:shadow-none print:bg-white print:text-black">
      {/* Background Texture for Screen View */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[url('https://www.transparenttextures.com/patterns/cardboard-flat.png')] print:hidden"></div>
      
      {/* VINTAGE REPORT STYLES FOR PRINT ONLY */}
      <style type="text/css" media="print">
        {`
          @page { size: letter portrait; margin: 0.75in; }
          body { font-family: 'Courier Prime', 'Courier New', monospace; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          h1, h2, h3, h4 { font-family: 'Courier Prime', 'Courier New', monospace; text-transform: uppercase; font-weight: bold; }
          .print-hidden { display: none !important; }
          .print-border { border: 2px solid #000 !important; }
          .print-header { border-bottom: 2px solid #000 !important; padding-bottom: 20px; margin-bottom: 20px; }
          
          /* Prevent page breaks inside elements */
          section, .border-2, .border { break-inside: avoid; page-break-inside: avoid; }
          
          /* Force page breaks before student materials */
          .print\\:break-before-page { break-before: page !important; page-break-before: always !important; }
          
          /* Ensure each worksheet fills the page */
          .print\\:min-h-\\[90vh\\] { min-height: 90vh; }
          
          /* Keep procedure steps together */
          .group { break-inside: avoid; page-break-inside: avoid; }
        `}
      </style>

      {/* Header Section */}
      <header className="border-b-4 border-[#1a1a1a] pb-6 mb-8 print:border-b-2 print:border-black print:pb-4">
        <div className="flex justify-between items-end">
          <div>
              <h1 className="text-4xl font-['Oswald'] font-bold uppercase tracking-tighter mb-2 print:text-3xl print:font-mono">{title || "Untitled Lesson Plan"}</h1>
              <div className="flex gap-4 text-sm font-bold uppercase tracking-widest opacity-70 print:font-mono print:text-xs">
                  <span>{subject || "Subject"}</span>
                  <span>•</span>
                  <span>{gradeLevel || "Grade"}</span>
                  <span>•</span>
                  <span>{duration || "Duration"}</span>
              </div>
          </div>
          <div className="text-right hidden sm:block">
              <div className="text-xs font-mono border border-[#1a1a1a] p-2 inline-block print:border-black">
                  REF: {refId || 'DRAFT'}
              </div>
          </div>
        </div>
        {standard && (
          <div className="mt-4 text-sm">
            <span className="font-bold uppercase tracking-widest text-xs opacity-60">Standard: </span>
            <span className="italic">{getStandardText(standard)}</span>
          </div>
        )}
      </header>

      {/* Grid Layout for Content */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 print:block">
        
        {/* Left Column: Objectives & Materials */}
        <div className="md:col-span-1 space-y-8 print:mb-8">
            <section className="print:mb-6">
                <h3 className="font-['Oswald'] text-xl font-bold uppercase border-b-2 border-[#1a1a1a] mb-4 pb-1 print:font-mono print:text-lg print:border-black flex items-center gap-2">
                  <Target size={18} className="print:hidden" />
                  Objectives
                </h3>
                <ul className="space-y-3 text-sm leading-relaxed print:text-xs">
                    {objectives.map((obj, i) => {
                        const text = getObjectiveText(obj);
                        const dokLevel = getObjectiveDOK(obj) ?? extractDOKLevel(text);
                        return (
                          <li key={i} className="flex items-start gap-2">
                            <CheckCircle2 size={16} className="text-green-600 mt-0.5 flex-shrink-0 print:hidden" />
                            <div className="flex-1">
                              <span>{text}</span>
                              {dokLevel && (
                                <span className={cn(
                                  "ml-2 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded print:border print:border-black",
                                  dokLevel === 4 ? "bg-purple-100 text-purple-800 print:bg-white" :
                                  dokLevel === 3 ? "bg-blue-100 text-blue-800 print:bg-white" :
                                  dokLevel === 2 ? "bg-green-100 text-green-800 print:bg-white" :
                                  "bg-gray-100 text-gray-800 print:bg-white"
                                )}>
                                  DOK {dokLevel}
                                </span>
                              )}
                            </div>
                          </li>
                        );
                    })}
                </ul>
            </section>

            <section className="print:mb-6">
                <h3 className="font-['Oswald'] text-xl font-bold uppercase border-b-2 border-[#1a1a1a] mb-4 pb-1 print:font-mono print:text-lg print:border-black">Materials</h3>
                <ul className="space-y-2 text-sm print:text-xs">
                    {materials.map((mat, i) => (
                        <li key={i} className="flex items-start gap-2">
                            <span className="inline-block w-4 h-4 border border-[#1a1a1a] flex-shrink-0 mt-0.5 print:border-black"></span>
                            <span>{mat}</span>
                        </li>
                    ))}
                </ul>
            </section>

            {/* Success Criteria */}
            {successCriteria && successCriteria.length > 0 && (
              <section className="print:mb-6">
                <h3 className="font-['Oswald'] text-xl font-bold uppercase border-b-2 border-[#1a1a1a] mb-4 pb-1 print:font-mono print:text-lg print:border-black">Success Criteria</h3>
                <ul className="space-y-2 text-sm print:text-xs">
                  {successCriteria.map((criterion, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-green-600 font-bold">✓</span>
                      <span>{criterion}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Supports & Scaffolds */}
            {supports && (supports.all?.length > 0 || supports.el?.length > 0 || supports.iep504?.length > 0) && (
              <section className="print:mb-6">
                <h3 className="font-['Oswald'] text-xl font-bold uppercase border-b-2 border-[#1a1a1a] mb-4 pb-1 print:font-mono print:text-lg print:border-black">Supports & Scaffolds</h3>
                <div className="space-y-4 text-sm print:text-xs">
                  {supports.all && supports.all.length > 0 && (
                    <div>
                      <h4 className="font-bold text-xs uppercase tracking-widest mb-2 opacity-70">All Students</h4>
                      <ul className="list-disc pl-5 space-y-1">
                        {supports.all.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                  {supports.el && supports.el.length > 0 && (
                    <div>
                      <h4 className="font-bold text-xs uppercase tracking-widest mb-2 opacity-70">English Learners</h4>
                      <ul className="list-disc pl-5 space-y-1">
                        {supports.el.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                  {supports.iep504 && supports.iep504.length > 0 && (
                    <div>
                      <h4 className="font-bold text-xs uppercase tracking-widest mb-2 opacity-70">IEP/504</h4>
                      <ul className="list-disc pl-5 space-y-1">
                        {supports.iep504.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              </section>
            )}

            <section className="bg-[#e6e2d6] p-4 border border-[#1a1a1a] mt-8 print:bg-white print:border-black print:p-0 print:mt-6">
                <h3 className="font-['Oswald'] text-sm font-bold uppercase mb-2 print:font-mono">Teacher Notes</h3>
                <div className="h-32 border-b border-[#1a1a1a] border-dashed opacity-50 mb-2 print:border-black"></div>
                <div className="h-8 border-b border-[#1a1a1a] border-dashed opacity-50 print:border-black"></div>
            </section>
        </div>

        {/* Right Column: Procedure */}
        <div className="md:col-span-2 space-y-8">
            <section>
                <h3 className="font-['Oswald'] text-xl font-bold uppercase border-b-2 border-[#1a1a1a] mb-6 pb-1 print:font-mono print:text-lg print:border-black">Procedure</h3>
                <div className="space-y-8">
                    {procedure.map((step, i) => (
                        <div key={i} className="group print:break-inside-avoid border-l-4 border-[#1a1a1a] pl-4 print:border-black">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-[#1a1a1a] text-[#f0ece2] font-['Oswald'] font-bold rounded-none print:bg-black print:text-white print:w-6 print:h-6 print:text-xs">
                                    {i + 1}
                                </div>
                                <h4 className="font-bold font-['Oswald'] text-lg print:font-mono print:text-sm print:uppercase">{step.step}</h4>
                            </div>
                            <div className="ml-11 text-sm leading-relaxed print:text-xs print:ml-0">
                                <FormattedText text={step.description} className="text-[#1a1a1a]/90" />
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="mt-8 pt-8 border-t-4 border-[#1a1a1a] print:border-t-2 print:border-black">
                <h3 className="font-['Oswald'] text-xl font-bold uppercase mb-4 print:font-mono print:text-lg">Assessment</h3>
                <p className="text-sm leading-relaxed p-4 bg-white/50 border-l-4 border-[#1a1a1a] italic print:bg-white print:border-black print:text-xs print:font-mono">
                    {assessment || "Assessment details will be added here."}
                </p>
            </section>

            {/* Exit Slip & Rubric */}
            {(exitSlip || (rubric && rubric.length > 0)) && (
              <section className="mt-8 pt-8 border-t-2 border-[#1a1a1a] border-dashed print:border-black">
                <h3 className="font-['Oswald'] text-xl font-bold uppercase mb-4 print:font-mono print:text-lg">Exit Slip</h3>
                {exitSlip && (
                  <div className="p-4 bg-[#e6e2d6] border-2 border-[#1a1a1a] mb-4 print:bg-white print:border-black">
                    <p className="text-sm font-medium">{exitSlip}</p>
                  </div>
                )}
                {rubric && rubric.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-bold text-sm uppercase tracking-widest mb-3 opacity-70">Scoring Rubric (0-3)</h4>
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      {rubric.map((r, i) => (
                        <div key={i} className="border border-[#1a1a1a] p-2 text-center print:border-black">
                          <div className="font-bold text-lg mb-1">{r.score}</div>
                          <div className="opacity-80">{r.description}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Equity Notes */}
            {equityNotes && (
              <section className="mt-6 p-4 bg-purple-50 border-l-4 border-purple-600 print:bg-white print:border-black">
                <h4 className="font-bold text-sm uppercase tracking-widest mb-2 text-purple-800 print:text-black">Equity Notes</h4>
                <p className="text-sm text-purple-900 print:text-black">{equityNotes}</p>
              </section>
            )}

            {/* Text Options */}
            {textOptions && textOptions.length > 0 && (
              <section className="mt-8 pt-8 border-t-2 border-[#1a1a1a] border-dashed print:border-black">
                <h3 className="font-['Oswald'] text-xl font-bold uppercase mb-4 print:font-mono print:text-lg">Text Selection</h3>
                <div className="space-y-4">
                  {textOptions.map((text, i) => (
                    <div key={i} className={cn(
                      "p-4 border-2 text-sm",
                      text.selected 
                        ? "border-green-600 bg-green-50 print:bg-white" 
                        : "border-[#1a1a1a] bg-white print:border-black"
                    )}>
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-bold">{text.title}</h4>
                        {text.selected && <span className="text-xs bg-green-600 text-white px-2 py-0.5 uppercase">Selected</span>}
                      </div>
                      <div className="text-xs opacity-70 mb-2">
                        <span>{text.source}</span>
                        {text.lexile && <span> • Lexile: {text.lexile}</span>}
                      </div>
                      {text.rationale && <p className="text-xs italic opacity-80 mb-2">{text.rationale}</p>}
                      {text.url && (
                        <a 
                          href={text.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 underline cursor-pointer print:text-black"
                          style={{ pointerEvents: 'auto' }}
                        >
                          <ExternalLink size={12} />
                          View Text
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Teacher Modifications */}
            {teacherModifications && teacherModifications.length > 0 && (
              <section className="mt-6 p-4 bg-amber-50 border border-amber-300 print:bg-white print:border-black">
                <h4 className="font-bold text-sm uppercase tracking-widest mb-2 text-amber-800 print:text-black">Optional Modifications</h4>
                <ul className="list-disc pl-5 text-sm text-amber-900 space-y-1 print:text-black">
                  {teacherModifications.map((mod, i) => <li key={i}>{mod}</li>)}
                </ul>
              </section>
            )}

            {/* Student Facing Materials Section - Each on its own page for print */}
            
            {/* PAGE BREAK: Exit Slip Worksheet */}
            <div className="print:break-before-page mt-12 pt-12 border-t-4 border-dashed border-[#1a1a1a] print:mt-0 print:pt-8 print:border-t-0">
                <div className="border-2 border-[#1a1a1a] p-8 bg-white shadow-sm relative print:border-2 print:border-black print:shadow-none print:min-h-[90vh]">
                    <div className="absolute top-4 right-4 text-xs font-mono border border-[#1a1a1a] p-1 print:border-black">Name: _________________</div>
                    <div className="absolute top-4 left-4 text-xs font-mono opacity-50">Exit Slip</div>
                    
                    <h3 className="text-center font-bold text-lg mt-8 mb-4 uppercase tracking-widest print:font-mono">{title || "Lesson"}</h3>
                    <p className="text-center text-sm mb-8 italic opacity-70">Exit Slip - Check for Understanding</p>
                    
                    <div className="space-y-6">
                        {exitSlip ? (
                          <div className="p-4 bg-[#f5f5f0] border border-[#1a1a1a] mb-6 print:bg-white">
                            <p className="font-medium text-sm">{exitSlip}</p>
                          </div>
                        ) : (
                          <div className="p-4 bg-[#f5f5f0] border border-[#1a1a1a] mb-6 print:bg-white">
                            <p className="font-medium text-sm">Respond to the prompt below:</p>
                          </div>
                        )}
                        
                        <div className="space-y-4">
                            <div className="h-16 border-b border-[#1a1a1a] opacity-50 print:border-black"></div>
                            <div className="h-16 border-b border-[#1a1a1a] opacity-50 print:border-black"></div>
                            <div className="h-16 border-b border-[#1a1a1a] opacity-50 print:border-black"></div>
                            <div className="h-16 border-b border-[#1a1a1a] opacity-50 print:border-black"></div>
                        </div>
                        
                        {rubric && rubric.length > 0 && (
                          <div className="mt-8 pt-4 border-t border-dashed border-[#1a1a1a]/30">
                            <p className="text-xs font-bold uppercase tracking-widest mb-2 opacity-60">Scoring Guide</p>
                            <div className="flex gap-2 text-xs">
                              {rubric.map((r, i) => (
                                <div key={i} className="flex-1 text-center p-2 border border-[#1a1a1a]/30">
                                  <span className="font-bold">{r.score}</span>: {r.description}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                    </div>
                </div>
            </div>

            {/* PAGE BREAK: Graphic Organizer */}
            <div className="print:break-before-page mt-8 print:mt-0 print:pt-8">
                <div className="border-2 border-[#1a1a1a] p-8 bg-white shadow-sm relative print:border-2 print:border-black print:shadow-none print:min-h-[90vh]">
                    <div className="absolute top-4 right-4 text-xs font-mono border border-[#1a1a1a] p-1 print:border-black">Name: _________________</div>
                    <div className="absolute top-4 left-4 text-xs font-mono opacity-50">Graphic Organizer</div>
                    
                    <h3 className="text-center font-bold text-lg mt-8 mb-8 uppercase tracking-widest print:font-mono">{title || "Lesson"} - Graphic Organizer</h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div className="border-2 border-[#1a1a1a] p-4 min-h-[200px] print:border-black">
                            <p className="font-bold text-sm mb-2 print:font-mono">Key Concept 1</p>
                            <div className="h-full"></div>
                        </div>
                        <div className="border-2 border-[#1a1a1a] p-4 min-h-[200px] print:border-black">
                            <p className="font-bold text-sm mb-2 print:font-mono">Key Concept 2</p>
                            <div className="h-full"></div>
                        </div>
                        <div className="col-span-2 border-2 border-[#1a1a1a] p-4 min-h-[150px] print:border-black">
                            <p className="font-bold text-sm mb-2 print:font-mono">Connection / Main Idea</p>
                            <div className="h-full"></div>
                        </div>
                        <div className="col-span-2 border-2 border-[#1a1a1a] p-4 min-h-[100px] print:border-black">
                            <p className="font-bold text-sm mb-2 print:font-mono">Evidence from Text</p>
                            <div className="h-full"></div>
                        </div>
                    </div>
                </div>
            </div>

            {/* PAGE BREAK: Sentence Frames (if supports exist) */}
            {supports && (supports.el?.length > 0 || supports.all?.length > 0) && (
              <div className="print:break-before-page mt-8 print:mt-0 print:pt-8">
                  <div className="border-2 border-[#1a1a1a] p-8 bg-white shadow-sm relative print:border-2 print:border-black print:shadow-none print:min-h-[90vh]">
                      <div className="absolute top-4 right-4 text-xs font-mono border border-[#1a1a1a] p-1 print:border-black">Name: _________________</div>
                      <div className="absolute top-4 left-4 text-xs font-mono opacity-50">Sentence Frames</div>
                      
                      <h3 className="text-center font-bold text-lg mt-8 mb-4 uppercase tracking-widest print:font-mono">Sentence Starters & Frames</h3>
                      <p className="text-center text-sm mb-8 italic opacity-70">Use these frames to help structure your responses</p>
                      
                      <div className="space-y-6">
                          {/* Dynamic frames from lesson supports */}
                          {extractedSentenceFrames.length > 0 ? (
                            extractedSentenceFrames.map((frame, i) => {
                              if (frame.startsWith('__purpose__:')) {
                                return (
                                  <p
                                    key={i}
                                    className="font-bold uppercase tracking-widest text-[10px] mt-3 mb-1 print:font-mono"
                                  >
                                    {frame.replace('__purpose__:', '')}
                                  </p>
                                );
                              }
                              return (
                                <div key={i} className="p-4 bg-[#f5f5f0] border-l-4 border-[#1a1a1a] print:bg-white">
                                  <p className="text-sm italic">{frame}</p>
                                </div>
                              );
                            })
                          ) : (
                            <>
                              <div className="p-4 bg-[#f5f5f0] border-l-4 border-[#1a1a1a] print:bg-white">
                                  <p className="font-medium text-sm mb-2">To introduce your claim:</p>
                                  <p className="text-sm italic">"Based on the text, I believe that _______________."</p>
                              </div>
                              <div className="p-4 bg-[#f5f5f0] border-l-4 border-[#1a1a1a] print:bg-white">
                                  <p className="font-medium text-sm mb-2">To provide evidence:</p>
                                  <p className="text-sm italic">"The author states, '_______________,' which shows that _______________."</p>
                              </div>
                              <div className="p-4 bg-[#f5f5f0] border-l-4 border-[#1a1a1a] print:bg-white">
                                  <p className="font-medium text-sm mb-2">To explain your reasoning:</p>
                                  <p className="text-sm italic">"This evidence supports my claim because _______________."</p>
                              </div>
                              <div className="p-4 bg-[#f5f5f0] border-l-4 border-[#1a1a1a] print:bg-white">
                                  <p className="font-medium text-sm mb-2">To make a connection:</p>
                                  <p className="text-sm italic">"This reminds me of _______________ because _______________."</p>
                              </div>
                            </>
                          )}
                      </div>
                  </div>
              </div>
            )}

            {/* PAGE BREAK: Text Sources Reference (if textOptions exist) */}
            {textOptions && textOptions.length > 0 && (
              <div className="print:break-before-page mt-8 print:mt-0 print:pt-8">
                  <div className="border-2 border-[#1a1a1a] p-8 bg-white shadow-sm relative print:border-2 print:border-black print:shadow-none print:min-h-[90vh]">
                      <div className="text-center mb-6">
                          <h4 className="font-['Oswald'] font-bold uppercase tracking-widest text-lg border-b-2 border-[#1a1a1a] inline-block pb-1 print:font-mono print:border-black">Text Sources & Audio Links</h4>
                      </div>
                      <p className="text-center text-sm mb-8 italic opacity-70">Scan QR codes with your phone or click links to access texts and audio versions</p>
                      
                      {/* Audio Access Note */}
                      <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded flex items-start gap-3 print:bg-white print:border-black">
                        <Volume2 size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
                        <div className="text-xs">
                          <p className="font-bold text-blue-800 mb-1">🔊 Audio Versions Available</p>
                          <p className="text-blue-700">Most text sources include built-in audio read-aloud. Look for the speaker icon on the source website, or use your browser's "Read Aloud" feature.</p>
                        </div>
                      </div>
                      
                      <div className="space-y-6">
                        {textOptions.map((text, i) => (
                          <div key={i} className="p-4 border border-[#1a1a1a] print:border-black flex gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <BookOpen size={16} className="text-[#1a1a1a] opacity-60" />
                                <h5 className="font-bold text-base">{text.title}</h5>
                              </div>
                              <p className="text-xs opacity-70 mb-2">{text.source} {text.lexile && `• Lexile: ${text.lexile}`}</p>
                              {text.url && (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <ExternalLink size={14} className="text-blue-600 flex-shrink-0" />
                                    <a 
                                      href={text.url} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="text-xs text-blue-600 underline hover:text-blue-800 break-all cursor-pointer"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {text.url}
                                    </a>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Volume2 size={14} className="text-green-600 flex-shrink-0" />
                                    <span className="text-xs text-green-700">Audio available on source site</span>
                                  </div>
                                </div>
                              )}
                              {text.rationale && (
                                <p className="text-xs italic mt-2 opacity-80">{text.rationale}</p>
                              )}
                            </div>
                            {text.url && (
                              <div className="flex-shrink-0 flex flex-col items-center">
                                <QRCodeSVG value={text.url} size={80} level="M" />
                                <p className="text-[8px] mt-1 opacity-50 uppercase tracking-widest">Scan to access</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                  </div>
              </div>
            )}

            {/* PAGE BREAK: Differentiation Map (resolved accommodations by phase) */}
            {lessonPackage?.accommodationsByPhase && Object.values(lessonPackage.accommodationsByPhase).some((arr) => arr && arr.length > 0) && (
              <div className="print:break-before-page mt-8 print:mt-0 print:pt-8">
                <div className="border-2 border-[#1a1a1a] p-8 bg-white shadow-sm relative print:border-2 print:border-black print:shadow-none print:min-h-[90vh]">
                  <div className="absolute top-4 left-4 text-xs font-mono opacity-50 flex items-center gap-1"><ShieldCheck size={12} /> Differentiation Map</div>
                  <h3 className="text-center font-bold text-lg mt-6 mb-2 uppercase tracking-widest print:font-mono">Differentiation Map</h3>
                  <p className="text-center text-sm mb-6 italic opacity-70">Curated accommodations grouped by lesson phase. Pull what fits today; archive what doesn&apos;t.</p>
                  <div className="space-y-5 text-sm">
                    {LESSON_PHASE_ORDER.map((phase) => {
                      const items = lessonPackage.accommodationsByPhase?.[phase] ?? [];
                      if (items.length === 0) return null;
                      return (
                        <div key={phase} className="border-l-4 border-[#1a1a1a] pl-3 print:border-black">
                          <h5 className="font-['Oswald'] font-bold uppercase tracking-widest text-xs mb-2 print:font-mono">{PHASE_DISPLAY[phase]}</h5>
                          <ul className="space-y-3 print:text-xs">
                            {items.map((a) => (
                              <li key={a.id} className="leading-relaxed">
                                <div className="font-bold">{a.name || a.id}</div>
                                <div className="opacity-80"><span className="font-bold">Teacher move:</span> {a.teacherPrompt}</div>
                                {a.studentMicrocopy && (
                                  <div className="opacity-80 italic">&ldquo;{a.studentMicrocopy}&rdquo;</div>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* PAGE BREAK: Misconception Alerts */}
            {lessonPackage?.misconceptions && lessonPackage.misconceptions.length > 0 && (
              <div className="print:break-before-page mt-8 print:mt-0 print:pt-8">
                <div className="border-2 border-[#1a1a1a] p-8 bg-white shadow-sm relative print:border-2 print:border-black print:shadow-none print:min-h-[90vh]">
                  <div className="absolute top-4 left-4 text-xs font-mono opacity-50 flex items-center gap-1"><AlertTriangle size={12} /> Misconception Alerts</div>
                  <h3 className="text-center font-bold text-lg mt-6 mb-2 uppercase tracking-widest print:font-mono">Likely Misconceptions</h3>
                  <p className="text-center text-sm mb-6 italic opacity-70">Anticipate, probe, and respond. Catch these before they harden into &ldquo;I&apos;m bad at this&rdquo; stories.</p>
                  <ul className="space-y-4 text-sm print:text-xs">
                    {lessonPackage.misconceptions.map((m) => (
                      <li key={m.id} className="border border-[#1a1a1a]/40 p-3 bg-[#fafafa] print:bg-white print:border-black">
                        <div className="font-bold mb-1">⚠ {m.misconception}</div>
                        <div className="mb-1"><span className="font-bold uppercase tracking-widest text-[10px]">Probe:</span> <em>{m.probe}</em></div>
                        {m.teacherMove && (
                          <div><span className="font-bold uppercase tracking-widest text-[10px]">Teacher move:</span> {m.teacherMove}</div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* PAGE BREAK: Bilingual Glossary */}
            {lessonPackage?.glossary && lessonPackage.glossary.length > 0 && (
              <div className="print:break-before-page mt-8 print:mt-0 print:pt-8">
                <div className="border-2 border-[#1a1a1a] p-8 bg-white shadow-sm relative print:border-2 print:border-black print:shadow-none print:min-h-[90vh]">
                  <div className="absolute top-4 left-4 text-xs font-mono opacity-50 flex items-center gap-1"><Languages size={12} /> Bilingual Glossary</div>
                  <h3 className="text-center font-bold text-lg mt-6 mb-2 uppercase tracking-widest print:font-mono">Bilingual Glossary</h3>
                  <p className="text-center text-sm mb-6 italic opacity-70">Pre-teach or hand to students who need home-language access.</p>
                  <table className="w-full text-sm print:text-xs border-collapse">
                    <thead>
                      <tr className="border-b-2 border-[#1a1a1a] print:border-black">
                        <th className="text-left p-2 font-['Oswald'] uppercase tracking-widest text-[10px]">Term</th>
                        <th className="text-left p-2 font-['Oswald'] uppercase tracking-widest text-[10px]">Lang</th>
                        <th className="text-left p-2 font-['Oswald'] uppercase tracking-widest text-[10px]">Definition</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lessonPackage.glossary.map((g) => (
                        <tr key={g.id} className="border-b border-[#1a1a1a]/20 align-top print:border-black">
                          <td className="p-2 font-bold">{g.term}</td>
                          <td className="p-2 uppercase font-mono text-xs">{g.language}</td>
                          <td className="p-2 leading-snug">{g.definition}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* PAGE BREAK: Citations / Evidence Base */}
            {lessonPackage?.citations && lessonPackage.citations.length > 0 && (
              <div className="print:break-before-page mt-8 print:mt-0 print:pt-8">
                <div className="border-2 border-[#1a1a1a] p-8 bg-white shadow-sm relative print:border-2 print:border-black print:shadow-none">
                  <div className="absolute top-4 left-4 text-xs font-mono opacity-50 flex items-center gap-1"><Quote size={12} /> Evidence Base</div>
                  <h3 className="text-center font-bold text-lg mt-6 mb-2 uppercase tracking-widest print:font-mono">Evidence Base</h3>
                  <p className="text-center text-sm mb-6 italic opacity-70">Research grounding the moves and scaffolds in this lesson.</p>
                  <ol className="list-decimal pl-6 space-y-2 text-sm print:text-xs">
                    {lessonPackage.citations.map((c) => (
                      <li key={c.id} className="leading-snug">
                        <span>{c.reference}</span>
                        {c.url && (
                          <a href={c.url} className="ml-1 text-blue-700 underline print:text-black" target="_blank" rel="noreferrer">
                            link
                          </a>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )}

            {/* PAGE BREAK: How to Use This Lesson Pack */}
            <div className="print:break-before-page mt-8 print:mt-0 print:pt-8">
                <div className="border-2 border-[#1a1a1a] p-8 bg-white shadow-sm relative print:border-2 print:border-black print:shadow-none">
                    <div className="text-center mb-6">
                        <h4 className="font-['Oswald'] font-bold uppercase tracking-widest text-lg border-b-2 border-[#1a1a1a] inline-block pb-1 print:font-mono print:border-black">How to Use This Lesson Pack</h4>
                    </div>
                    
                    <div className="space-y-6 text-sm">
                        <section>
                            <h5 className="font-bold uppercase tracking-widest text-xs mb-2 border-b border-[#1a1a1a]/30 pb-1">📚 Accessing Text Sources</h5>
                            <div className="space-y-3 pl-4">
                                <div>
                                    <p className="font-semibold">CommonLit</p>
                                    <p className="text-xs opacity-80">Free teacher account required. Sign up at commonlit.org to access full texts, audio versions, and guided reading features.</p>
                                </div>
                                <div>
                                    <p className="font-semibold">Newsela</p>
                                    <p className="text-xs opacity-80">Free teacher account required. Texts available at multiple Lexile levels. Sign up at newsela.com.</p>
                                </div>
                                <div>
                                    <p className="font-semibold">ReadWorks</p>
                                    <p className="text-xs opacity-80">Free account required. Includes audio support and comprehension questions. Visit readworks.org.</p>
                                </div>
                                <div>
                                    <p className="font-semibold">Project Gutenberg / Public Domain</p>
                                    <p className="text-xs opacity-80">No account needed. Free access to classic texts at gutenberg.org.</p>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h5 className="font-bold uppercase tracking-widest text-xs mb-2 border-b border-[#1a1a1a]/30 pb-1">🔊 Audio Versions</h5>
                            <p className="pl-4 text-xs opacity-80">
                                Most text sources include built-in audio read-aloud features. Look for the speaker/audio icon on the source website. 
                                For texts without audio, consider using browser extensions like "Read Aloud" or your device's built-in accessibility features.
                            </p>
                        </section>

                        <section>
                            <h5 className="font-bold uppercase tracking-widest text-xs mb-2 border-b border-[#1a1a1a]/30 pb-1">📱 QR Codes</h5>
                            <p className="pl-4 text-xs opacity-80">
                                Students can scan QR codes with their phone cameras to access texts directly. 
                                No special app needed on most modern smartphones — just point the camera at the code.
                            </p>
                        </section>

                        <section>
                            <h5 className="font-bold uppercase tracking-widest text-xs mb-2 border-b border-[#1a1a1a]/30 pb-1">🖨️ Printing Tips</h5>
                            <ul className="pl-4 text-xs opacity-80 list-disc pl-8 space-y-1">
                                <li>Each student worksheet starts on a new page for easy copying</li>
                                <li>Print the Exit Slip and Graphic Organizer as needed for your class size</li>
                                <li>The Sentence Frames page can be displayed or printed as a reference</li>
                                <li>Consider printing the Text Sources page for students without device access</li>
                            </ul>
                        </section>

                        <section>
                            <h5 className="font-bold uppercase tracking-widest text-xs mb-2 border-b border-[#1a1a1a]/30 pb-1">✏️ Customization</h5>
                            <p className="pl-4 text-xs opacity-80">
                                This lesson was designed with UDL principles and equity in mind. Feel free to modify materials based on your students' needs. 
                                The Teacher Modifications section includes suggested adaptations. Use the Teacher Notes space to add your own adjustments.
                            </p>
                        </section>
                    </div>
                </div>
            </div>

            {/* PAGE BREAK: Reading Passage Placeholder (for teachers to attach text) */}
            <div className="print:break-before-page mt-8 print:mt-0 print:pt-8">
                <div className="border-2 border-[#1a1a1a] border-dashed p-8 bg-[#fafafa] shadow-sm relative print:border-2 print:border-black print:shadow-none print:min-h-[85vh]">
                    <div className="absolute top-4 right-4 text-xs font-mono border border-[#1a1a1a] p-1 print:border-black">Name: _________________</div>
                    <div className="absolute top-4 left-4 text-xs font-mono opacity-50">Reading Passage</div>
                    
                    <h3 className="text-center font-bold text-lg mt-8 mb-4 uppercase tracking-widest print:font-mono">Reading Passage</h3>
                    <p className="text-center text-sm mb-8 italic opacity-70">Attach or paste the selected text here for student copies</p>
                    
                    <div className="border border-[#1a1a1a]/30 border-dashed min-h-[60vh] p-4 bg-white print:border-black">
                        <p className="text-xs text-center opacity-40 mt-8">
                            [Teacher: Print or copy the selected text from the source and attach here, 
                            or have students access digitally via the QR code on the Text Sources page]
                        </p>
                    </div>
                </div>
            </div>
        </div>
      </div>

      {/* Footer - appears at end of document */}
      <footer className="mt-16 pt-6 border-t border-[#1a1a1a] flex justify-between items-center text-xs opacity-60 uppercase tracking-widest print:border-black print:font-mono print:mt-8 print:pt-4">
        <span>Generated by Penny Pedagogy</span>
        <span>REF: {refId || 'DRAFT'} • {new Date().toLocaleDateString()}</span>
      </footer>
    </div>
  );
});

LessonPlan.displayName = "LessonPlan";

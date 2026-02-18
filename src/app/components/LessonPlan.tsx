import React, { forwardRef } from 'react';
import { cn } from '../../lib/utils';
import { PennyFrame } from './PennyFrame';
import { LessonPlanData } from '../../types';

export const LessonPlan = forwardRef<HTMLDivElement, LessonPlanData>(({ 
  title, 
  gradeLevel, 
  subject, 
  duration, 
  objectives, 
  materials, 
  procedure, 
  assessment 
}, ref) => {
  return (
    <div ref={ref} className="bg-[#f0ece2] text-[#1a1a1a] p-12 min-h-screen font-['DM_Sans'] relative overflow-hidden print:p-8 print:shadow-none print:bg-white print:text-black">
      {/* Background Texture for Screen View */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[url('https://www.transparenttextures.com/patterns/cardboard-flat.png')] print:hidden"></div>
      
      {/* VINTAGE REPORT STYLES FOR PRINT ONLY */}
      <style type="text/css" media="print">
        {`
          @page { size: portrait; margin: 1in; }
          body { font-family: 'Courier Prime', 'Courier New', monospace; color: #000; -webkit-print-color-adjust: exact; }
          h1, h2, h3, h4 { font-family: 'Courier Prime', 'Courier New', monospace; text-transform: uppercase; font-weight: bold; }
          .print-hidden { display: none !important; }
          .print-border { border: 2px solid #000 !important; }
          .print-header { border-bottom: 2px solid #000 !important; padding-bottom: 20px; margin-bottom: 20px; }
        `}
      </style>

      {/* Header Section */}
      <header className="border-b-4 border-[#1a1a1a] pb-6 mb-8 flex justify-between items-end print:border-b-2 print:border-black print:pb-4">
        <div>
            <h1 className="text-4xl font-['Oswald'] font-bold uppercase tracking-tighter mb-2 print:text-3xl print:font-mono">{title || "Untitled Lesson Plan"}</h1>
            <div className="flex gap-4 text-sm font-bold uppercase tracking-widest opacity-70 print:font-mono print:text-xs">
                <span>{subject}</span>
                <span>•</span>
                <span>{gradeLevel}</span>
                <span>•</span>
                <span>{duration}</span>
            </div>
        </div>
        <div className="text-right hidden sm:block">
            <div className="text-xs font-mono border border-[#1a1a1a] p-2 inline-block print:border-black">
                REF: {Math.random().toString(36).substring(7).toUpperCase()}
            </div>
        </div>
      </header>

      {/* Grid Layout for Content */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 print:block">
        
        {/* Left Column: Objectives & Materials */}
        <div className="md:col-span-1 space-y-8 print:mb-8">
            <section className="print:mb-6">
                <h3 className="font-['Oswald'] text-xl font-bold uppercase border-b-2 border-[#1a1a1a] mb-4 pb-1 print:font-mono print:text-lg print:border-black">Objectives</h3>
                <ul className="list-disc pl-5 space-y-2 text-sm leading-relaxed print:text-xs">
                    {objectives.map((obj, i) => (
                        <li key={i}>{obj}</li>
                    ))}
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
                <div className="space-y-6">
                    {procedure.map((step, i) => (
                        <div key={i} className="flex gap-4 group print:break-inside-avoid">
                            <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-[#1a1a1a] text-[#f0ece2] font-['Oswald'] font-bold rounded-none print:bg-black print:text-white print:w-6 print:h-6 print:text-xs">
                                {i + 1}
                            </div>
                            <div>
                                <h4 className="font-bold font-['Oswald'] text-lg mb-1 print:font-mono print:text-sm print:uppercase">{step.step}</h4>
                                <p className="text-sm leading-relaxed opacity-90 print:text-xs print:font-mono">{step.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="mt-8 pt-8 border-t-4 border-[#1a1a1a] print:border-t-2 print:border-black">
                <h3 className="font-['Oswald'] text-xl font-bold uppercase mb-4 print:font-mono print:text-lg">Assessment</h3>
                <p className="text-sm leading-relaxed p-4 bg-white/50 border-l-4 border-[#1a1a1a] italic print:bg-white print:border-black print:text-xs print:font-mono">
                    {assessment}
                </p>
            </section>

            {/* Student Facing Materials Section (New Page for Print) */}
            <div className="break-before-page mt-12 pt-12 border-t-4 border-dashed border-[#1a1a1a] print:block print:mt-0 print:pt-0 print:border-t-0">
                <div className="text-center mb-8">
                    <h2 className="text-2xl font-['Oswald'] font-bold uppercase tracking-widest border-b-2 border-[#1a1a1a] inline-block pb-2 print:font-mono print:text-xl print:border-black">Student Materials</h2>
                </div>
                
                {/* Mock Worksheet */}
                <div className="border border-[#1a1a1a] p-8 bg-white shadow-sm relative print:border-2 print:border-black print:shadow-none">
                    <div className="absolute top-4 right-4 text-xs font-mono border border-[#1a1a1a] p-1 print:border-black">Name: _________________</div>
                    <div className="absolute top-4 left-4 text-xs font-mono opacity-50">Worksheet 1.1</div>
                    
                    <h3 className="text-center font-bold text-lg mt-8 mb-8 uppercase tracking-widest print:font-mono">{title} - Activity Sheet</h3>
                    
                    <div className="space-y-8">
                        <div className="space-y-2">
                            <p className="font-bold text-sm print:font-mono">1. Observation</p>
                            <div className="h-24 border border-[#1a1a1a] opacity-50 border-dashed bg-[#f9f9f9] print:border-black print:bg-white"></div>
                        </div>
                        <div className="space-y-2">
                            <p className="font-bold text-sm print:font-mono">2. Hypothesis</p>
                            <div className="h-12 border-b border-[#1a1a1a] opacity-50 print:border-black"></div>
                            <div className="h-12 border-b border-[#1a1a1a] opacity-50 print:border-black"></div>
                        </div>
                         <div className="space-y-2">
                            <p className="font-bold text-sm print:font-mono">3. Diagram</p>
                            <div className="h-48 border border-[#1a1a1a] opacity-50 bg-[#f9f9f9] flex items-center justify-center text-xs text-gray-400 print:border-black print:bg-white">
                                Draw your diagram here
                            </div>
                        </div>
                    </div>
                </div>

                {/* Mock Text Source */}
                 <div className="mt-8 border border-[#1a1a1a] p-8 bg-[#fdfdfd] shadow-sm relative break-inside-avoid print:border-2 print:border-black print:shadow-none">
                    <div className="text-center mb-6">
                        <h4 className="font-['Oswald'] font-bold uppercase tracking-widest text-sm border-b border-[#1a1a1a] inline-block pb-1 print:font-mono print:border-black">Reading Material</h4>
                    </div>
                    <div className="columns-2 gap-8 text-xs leading-relaxed text-justify font-serif print:font-mono">
                        <p className="mb-4">
                            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
                        </p>
                        <p>
                            Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.
                        </p>
                    </div>
                </div>
            </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-16 pt-6 border-t border-[#1a1a1a] flex justify-between items-center text-xs opacity-60 uppercase tracking-widest print:border-black print:font-mono">
        <span>Generated by Penny Pedagogy</span>
        <span>{new Date().toLocaleDateString()}</span>
      </footer>
    </div>
  );
});

LessonPlan.displayName = "LessonPlan";

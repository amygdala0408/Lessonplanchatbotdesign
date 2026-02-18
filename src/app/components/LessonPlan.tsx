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
      
      {/* Header Section */}
      <header className="border-b-4 border-[#1a1a1a] pb-6 mb-8 flex justify-between items-end">
        <div>
            <h1 className="text-4xl font-['Oswald'] font-bold uppercase tracking-tighter mb-2">{title || "Untitled Lesson Plan"}</h1>
            <div className="flex gap-4 text-sm font-bold uppercase tracking-widest opacity-70">
                <span>{subject}</span>
                <span>•</span>
                <span>{gradeLevel}</span>
                <span>•</span>
                <span>{duration}</span>
            </div>
        </div>
        <div className="text-right hidden sm:block">
            <div className="text-xs font-mono border border-[#1a1a1a] p-2 inline-block">
                REF: {Math.random().toString(36).substring(7).toUpperCase()}
            </div>
        </div>
      </header>

      {/* Grid Layout for Content */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* Left Column: Objectives & Materials */}
        <div className="md:col-span-1 space-y-8">
            <section>
                <h3 className="font-['Oswald'] text-xl font-bold uppercase border-b-2 border-[#1a1a1a] mb-4 pb-1">Objectives</h3>
                <ul className="list-disc pl-5 space-y-2 text-sm leading-relaxed">
                    {objectives.map((obj, i) => (
                        <li key={i}>{obj}</li>
                    ))}
                </ul>
            </section>

            <section>
                <h3 className="font-['Oswald'] text-xl font-bold uppercase border-b-2 border-[#1a1a1a] mb-4 pb-1">Materials</h3>
                <ul className="space-y-2 text-sm">
                    {materials.map((mat, i) => (
                        <li key={i} className="flex items-start gap-2">
                            <span className="inline-block w-4 h-4 border border-[#1a1a1a] flex-shrink-0 mt-0.5"></span>
                            <span>{mat}</span>
                        </li>
                    ))}
                </ul>
            </section>

            <section className="bg-[#e6e2d6] p-4 border border-[#1a1a1a] mt-8">
                <h3 className="font-['Oswald'] text-sm font-bold uppercase mb-2">Teacher Notes</h3>
                <div className="h-32 border-b border-[#1a1a1a] border-dashed opacity-50 mb-2"></div>
                <div className="h-8 border-b border-[#1a1a1a] border-dashed opacity-50"></div>
            </section>
        </div>

        {/* Right Column: Procedure */}
        <div className="md:col-span-2 space-y-8">
            <section>
                <h3 className="font-['Oswald'] text-xl font-bold uppercase border-b-2 border-[#1a1a1a] mb-6 pb-1">Procedure</h3>
                <div className="space-y-6">
                    {procedure.map((step, i) => (
                        <div key={i} className="flex gap-4 group">
                            <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-[#1a1a1a] text-[#f0ece2] font-['Oswald'] font-bold rounded-none">
                                {i + 1}
                            </div>
                            <div>
                                <h4 className="font-bold font-['Oswald'] text-lg mb-1">{step.step}</h4>
                                <p className="text-sm leading-relaxed opacity-90">{step.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="mt-8 pt-8 border-t-4 border-[#1a1a1a]">
                <h3 className="font-['Oswald'] text-xl font-bold uppercase mb-4">Assessment</h3>
                <p className="text-sm leading-relaxed p-4 bg-white/50 border-l-4 border-[#1a1a1a] italic">
                    {assessment}
                </p>
            </section>

            {/* Student Facing Materials Section (New Page for Print) */}
            <div className="break-before-page mt-12 pt-12 border-t-4 border-dashed border-[#1a1a1a] print:block print:mt-0 print:pt-0 print:border-t-0">
                <div className="text-center mb-8">
                    <h2 className="text-2xl font-['Oswald'] font-bold uppercase tracking-widest border-b-2 border-[#1a1a1a] inline-block pb-2">Student Materials</h2>
                </div>
                
                {/* Mock Worksheet */}
                <div className="border border-[#1a1a1a] p-8 bg-white shadow-sm relative">
                    <div className="absolute top-4 right-4 text-xs font-mono border border-[#1a1a1a] p-1">Name: _________________</div>
                    <div className="absolute top-4 left-4 text-xs font-mono opacity-50">Worksheet 1.1</div>
                    
                    <h3 className="text-center font-bold text-lg mt-8 mb-8 uppercase tracking-widest">{title} - Activity Sheet</h3>
                    
                    <div className="space-y-8">
                        <div className="space-y-2">
                            <p className="font-bold text-sm">1. Observation</p>
                            <div className="h-24 border border-[#1a1a1a] opacity-50 border-dashed bg-[#f9f9f9]"></div>
                        </div>
                        <div className="space-y-2">
                            <p className="font-bold text-sm">2. Hypothesis</p>
                            <div className="h-12 border-b border-[#1a1a1a] opacity-50"></div>
                            <div className="h-12 border-b border-[#1a1a1a] opacity-50"></div>
                        </div>
                         <div className="space-y-2">
                            <p className="font-bold text-sm">3. Diagram</p>
                            <div className="h-48 border border-[#1a1a1a] opacity-50 bg-[#f9f9f9] flex items-center justify-center text-xs text-gray-400">
                                Draw your diagram here
                            </div>
                        </div>
                    </div>
                </div>

                {/* Mock Text Source */}
                 <div className="mt-8 border border-[#1a1a1a] p-8 bg-[#fdfdfd] shadow-sm relative break-inside-avoid">
                    <div className="text-center mb-6">
                        <h4 className="font-['Oswald'] font-bold uppercase tracking-widest text-sm border-b border-[#1a1a1a] inline-block pb-1">Reading Material</h4>
                    </div>
                    <div className="columns-2 gap-8 text-xs leading-relaxed text-justify font-serif">
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
      <footer className="mt-16 pt-6 border-t border-[#1a1a1a] flex justify-between items-center text-xs opacity-60 uppercase tracking-widest">
        <span>Generated by Penny Pedagogy</span>
        <span>{new Date().toLocaleDateString()}</span>
      </footer>
    </div>
  );
});

LessonPlan.displayName = "LessonPlan";

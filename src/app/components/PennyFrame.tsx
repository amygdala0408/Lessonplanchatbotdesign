import React from 'react';
import pennyImage from 'figma:asset/556b89ab76ff40690f55e66c7073a0353119496d.png';
import { cn } from '../../lib/utils';

export function PennyFrame({ className, size = "md" }: { className?: string, size?: "sm" | "md" | "lg" | "xl" }) {
  // Size mappings for consistent scaling
  const sizeClasses = {
    sm: "p-2 border-[6px]",
    md: "p-3 border-[8px]",
    lg: "p-5 border-[12px]",
    xl: "p-8 border-[16px]"
  };

  const innerBorderClasses = {
    sm: "border",
    md: "border-2",
    lg: "border-[3px]",
    xl: "border-4"
  };

  return (
    <div className={cn(
        "relative inline-block bg-[#f0f0f0] shadow-2xl", 
        "border-[#1a1a1a]", 
        sizeClasses[size], 
        className
    )}>
        {/* Frame Highlight/Bevel Effect (Top/Left light, Bottom/Right dark) */}
        <div className="absolute inset-0 border-t border-l border-white/20 pointer-events-none"></div>
        <div className="absolute inset-0 border-b border-r border-black/20 pointer-events-none"></div>

        {/* Matting (The white space between frame and picture) */}
        <div className="bg-[#e8e6df] h-full w-full shadow-[inset_2px_2px_8px_rgba(0,0,0,0.1)] flex flex-col">
            
            {/* The Picture Itself */}
            <div className={cn("relative border-[#1a1a1a] m-1 flex-grow", innerBorderClasses[size])}>
                <div className="relative w-full h-full overflow-hidden grayscale contrast-125 sepia-[0.1]">
                    <img 
                        src={pennyImage} 
                        alt="Penny Pedagogy" 
                        className="w-full h-full object-cover mix-blend-normal"
                    />
                    {/* Texture overlay for the photo */}
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/noise-lines.png')] opacity-10 pointer-events-none"></div>
                </div>
            </div>

            {/* Nameplate - Only for larger sizes */}
            {(size === 'lg' || size === 'xl') && (
                <div className="mt-4 mb-1 text-center">
                    <div className="inline-block border-2 border-[#1a1a1a] bg-[#1a1a1a] px-6 py-1 transform -rotate-1 shadow-md">
                        <span className="block text-[#f0ece2] font-['Oswald'] font-bold uppercase tracking-[0.2em] text-lg">
                            Penny Pedagogy
                        </span>
                    </div>
                    <div className="text-[10px] font-mono uppercase tracking-widest mt-2 opacity-60">
                        Est. 2024 • AI Instructor
                    </div>
                </div>
            )}
        </div>
    </div>
  );
}

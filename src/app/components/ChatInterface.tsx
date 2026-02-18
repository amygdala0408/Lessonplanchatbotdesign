import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User, Bot, Paperclip, Sparkles, RotateCcw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '../../lib/utils';
import { Message } from '../../types';

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (message: string) => void;
  isTyping: boolean;
  theme?: 'default' | 'coffee';
  onFinalize?: () => void;
  canFinalize?: boolean;
  onReset?: () => void;
}

export function ChatInterface({ messages, onSendMessage, isTyping, theme = 'default', onFinalize, canFinalize = false, onReset }: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const [isClient, setIsClient] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSendMessage(input);
      setInput('');
    }
  };

  return (
    <div className={cn(
        "flex flex-col h-full relative overflow-hidden shadow-[16px_16px_0px_0px_rgba(26,26,26,0.9)] border-4 transition-colors duration-500 max-w-4xl mx-auto w-full",
        theme === 'coffee' 
            ? "bg-[#3e3226] border-[#e8e6df]/10 shadow-[16px_16px_0px_0px_rgba(44,36,27,0.9)]" 
            : "bg-[#fdfdfd] border-[#1a1a1a] shadow-[16px_16px_0px_0px_rgba(26,26,26,0.9)]"
    )}>
      {/* Background Texture */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.04] bg-[url('https://www.transparenttextures.com/patterns/noise-lines.png')] z-0 mix-blend-multiply"></div>
      <div className="absolute inset-0 pointer-events-none opacity-[0.02] bg-[url('https://www.transparenttextures.com/patterns/paper.png')] z-0"></div>

      {/* Header */}
      <div className={cn(
          "p-6 border-b-4 z-10 flex items-center justify-between shadow-sm relative transition-colors duration-500",
          theme === 'coffee' 
            ? "bg-[#2c241b] border-[#e8e6df]/10 text-[#e8e6df]" 
            : "bg-[#e6e2d6] border-[#1a1a1a] text-[#1a1a1a]"
      )}>
        <div className="absolute inset-0 pointer-events-none opacity-[0.05] bg-[url('https://www.transparenttextures.com/patterns/cardboard-flat.png')]"></div>
        
        <div className="flex items-center gap-4 relative z-10">
            <div className={cn(
                "w-4 h-4 rotate-45 border-2 border-white shadow-[2px_2px_0px_0px_rgba(0,0,0,0.2)] transition-colors duration-500",
                theme === 'coffee' ? "bg-[#e8e6df]" : "bg-[#1a1a1a]"
            )}></div>
            <div>
                <h2 className="font-['Oswald'] text-xl font-bold uppercase tracking-widest leading-none">Conversation Log</h2>
                <div className="flex items-center gap-2 mt-1">
                    <span className="w-2 h-2 rounded-full bg-green-600 animate-pulse"></span>
                    <p className="text-[10px] font-mono opacity-60 uppercase tracking-widest">Active Session</p>
                </div>
            </div>
        </div>
        <div className="flex items-center gap-3 relative z-10">
          {onReset && (
            <button
              onClick={onReset}
              className={cn(
                "flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest border-2 px-3 py-1 transition-all hover:scale-105 active:scale-95",
                theme === 'coffee' 
                  ? "bg-[#3e3226] border-[#e8e6df]/20 text-[#e8e6df] hover:bg-[#4a3b2d]" 
                  : "bg-[#fdfdfd] border-[#1a1a1a] text-[#1a1a1a] hover:bg-[#f0f0f0]"
              )}
            >
              <RotateCcw size={12} />
              New
            </button>
          )}
          <div className={cn(
              "text-[10px] font-mono opacity-60 border-2 px-3 py-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)] transition-colors duration-500",
              theme === 'coffee' 
                  ? "bg-[#3e3226] border-[#e8e6df]/20 text-[#e8e6df]" 
                  : "bg-[#fdfdfd] border-[#1a1a1a] text-[#1a1a1a]"
          )}>
              SECURE • {new Date().toLocaleDateString()}
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className={cn(
          "flex-1 overflow-y-auto p-8 space-y-10 z-10 scrollbar-thin scrollbar-track-transparent transition-colors duration-500 relative",
          theme === 'coffee' 
            ? "bg-[#3e3226] scrollbar-thumb-[#e8e6df]/20" 
            : "bg-[#fdfdfd] scrollbar-thumb-[#1a1a1a]"
      )}>
        {/* Subtle grid lines background */}
        <div className="absolute inset-0 pointer-events-none" 
             style={{ 
                 backgroundImage: `linear-gradient(${theme === 'coffee' ? '#e8e6df' : '#1a1a1a'} 1px, transparent 1px)`, 
                 backgroundSize: '100% 40px', 
                 opacity: theme === 'coffee' ? 0.05 : 0.03 
             }}>
        </div>

        {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full opacity-50 text-center space-y-6 relative z-10">
                <div className={cn(
                    "w-24 h-24 border-4 rounded-full flex items-center justify-center shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)] transition-colors duration-500",
                    theme === 'coffee' 
                        ? "bg-[#2c241b] border-[#e8e6df]/20 text-[#e8e6df]" 
                        : "bg-[#e6e2d6] border-[#1a1a1a] text-[#1a1a1a]"
                )}>
                     <Bot className="w-12 h-12" />
                </div>
                <div className="max-w-xs">
                    <p className="font-['Oswald'] uppercase tracking-widest text-lg font-bold">System Ready</p>
                    <p className="font-serif italic mt-2">"Tell me about your students, and let's craft something wonderful together."</p>
                </div>
            </div>
        )}
        
        <AnimatePresence>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={cn(
                "flex gap-6 max-w-[85%] relative group",
                msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
              )}
            >
              <div className={cn(
                "w-12 h-12 border-2 flex items-center justify-center shrink-0 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative z-10 transition-colors duration-500",
                msg.role === 'user' 
                    ? (theme === 'coffee' ? "bg-[#e8e6df] text-[#2c241b] border-[#e8e6df]/20" : "bg-[#1a1a1a] text-[#e8e6df] border-[#1a1a1a]")
                    : (theme === 'coffee' ? "bg-[#2c241b] text-[#e8e6df] border-[#e8e6df]/20" : "bg-[#e6e2d6] text-[#1a1a1a] border-[#1a1a1a]")
              )}>
                 <div className="absolute inset-0 pointer-events-none opacity-20 bg-[url('https://www.transparenttextures.com/patterns/noise-lines.png')]"></div>
                {msg.role === 'user' ? <User size={20} /> : <Bot size={20} />}
              </div>
              
              <div className={cn(
                "p-6 text-base font-['DM_Sans'] leading-relaxed border-2 relative transition-colors duration-500",
                msg.role === 'user' 
                  ? (theme === 'coffee' 
                      ? "bg-[#e8e6df] text-[#2c241b] border-[#e8e6df]/20 shadow-[4px_4px_0px_0px_rgba(255,255,255,0.1)]" 
                      : "bg-[#1a1a1a] text-[#e8e6df] border-[#1a1a1a] shadow-[4px_4px_0px_0px_rgba(0,0,0,0.3)]")
                  : (theme === 'coffee'
                      ? "bg-[#4a3b2d] text-[#e8e6df] border-[#e8e6df]/10 shadow-[8px_8px_0px_0px_rgba(0,0,0,0.2)]"
                      : "bg-white text-[#1a1a1a] border-[#1a1a1a] shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)]")
              )}>
                {/* Texture for bubbles */}
                <div className={cn(
                    "absolute inset-0 pointer-events-none opacity-[0.05] mix-blend-multiply",
                    msg.role === 'user' ? "bg-[url('https://www.transparenttextures.com/patterns/stardust.png')]" : "bg-[url('https://www.transparenttextures.com/patterns/paper.png')]"
                )}></div>
                
                <div className="whitespace-pre-wrap relative z-10 prose prose-sm max-w-none prose-a:text-blue-500 prose-a:underline prose-a:font-medium hover:prose-a:text-blue-700">
                  <ReactMarkdown
                    components={{
                      a: ({ href, children }) => (
                        <a 
                          href={href} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-500 underline font-medium hover:text-blue-700"
                        >
                          {children}
                        </a>
                      ),
                      p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                      ul: ({ children }) => <ul className="list-disc pl-5 mb-2">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal pl-5 mb-2">{children}</ol>,
                      li: ({ children }) => <li className="mb-1">{children}</li>,
                      strong: ({ children }) => <strong className="font-bold">{children}</strong>,
                      em: ({ children }) => <em className="italic">{children}</em>,
                      h1: ({ children }) => <h1 className="text-xl font-bold mt-4 mb-2">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-lg font-bold mt-3 mb-2">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-base font-bold mt-2 mb-1">{children}</h3>,
                      code: ({ children }) => <code className="bg-black/10 px-1 py-0.5 rounded text-sm font-mono">{children}</code>,
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
                <span className={cn(
                    "text-[10px] opacity-50 mt-4 block font-mono uppercase tracking-widest pt-3 border-t border-dashed relative z-10 transition-colors duration-500",
                    msg.role === 'user' 
                        ? (theme === 'coffee' ? "border-[#2c241b]/30" : "border-[#e8e6df]/30")
                        : (theme === 'coffee' ? "border-[#e8e6df]/20" : "border-[#1a1a1a]/20")
                )}>
                  {isClient ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isTyping && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            className="flex gap-6 max-w-[80%]"
          >
             <div className={cn(
                 "w-12 h-12 border-2 flex items-center justify-center shrink-0 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-colors duration-500",
                 theme === 'coffee' 
                    ? "bg-[#2c241b] text-[#e8e6df] border-[#e8e6df]/20" 
                    : "bg-[#e6e2d6] text-[#1a1a1a] border-[#1a1a1a]"
             )}>
                <Bot size={20} />
             </div>
             <div className={cn(
                 "p-6 border-2 shadow-[6px_6px_0px_0px_rgba(0,0,0,0.1)] flex gap-2 items-center h-auto transition-colors duration-500",
                 theme === 'coffee' 
                    ? "bg-[#4a3b2d] border-[#e8e6df]/10" 
                    : "bg-white border-[#1a1a1a]"
             )}>
                <span className={cn("w-2.5 h-2.5 rounded-full animate-bounce [animation-delay:-0.3s]", theme === 'coffee' ? "bg-[#e8e6df]" : "bg-[#1a1a1a]")}></span>
                <span className={cn("w-2.5 h-2.5 rounded-full animate-bounce [animation-delay:-0.15s]", theme === 'coffee' ? "bg-[#e8e6df]" : "bg-[#1a1a1a]")}></span>
                <span className={cn("w-2.5 h-2.5 rounded-full animate-bounce", theme === 'coffee' ? "bg-[#e8e6df]" : "bg-[#1a1a1a]")}></span>
             </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className={cn(
          "p-8 border-t-4 z-10 relative shadow-[0_-10px_40px_rgba(0,0,0,0.05)] transition-colors duration-500",
          theme === 'coffee' 
            ? "bg-[#2c241b] border-[#e8e6df]/10" 
            : "bg-[#e6e2d6] border-[#1a1a1a]"
      )}>
        <div className="absolute inset-0 pointer-events-none opacity-[0.05] bg-[url('https://www.transparenttextures.com/patterns/cardboard-flat.png')]"></div>
        
        <form onSubmit={handleSubmit} className="relative flex items-end gap-4 z-10">
          <div className="flex-1 relative group">
            <div className="absolute inset-0 bg-[#1a1a1a] translate-x-1.5 translate-y-1.5 transition-transform group-focus-within:translate-x-2.5 group-focus-within:translate-y-2.5 pointer-events-none"></div>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              className={cn(
                  "relative w-full border-2 p-5 pr-14 focus:outline-none font-['DM_Sans'] text-lg shadow-[inset_2px_2px_10px_rgba(0,0,0,0.03)] transition-colors duration-500",
                  theme === 'coffee' 
                    ? "bg-[#3e3226] border-[#e8e6df]/20 text-[#e8e6df] placeholder:text-[#e8e6df]/40" 
                    : "bg-white border-[#1a1a1a] text-[#1a1a1a] placeholder:text-[#1a1a1a]/40"
              )}
            />
            <button 
                type="button"
                className={cn(
                    "absolute right-4 top-1/2 -translate-y-1/2 transition-colors z-20 hover:scale-110 active:scale-95",
                    theme === 'coffee' 
                        ? "text-[#e8e6df]/40 hover:text-[#e8e6df]" 
                        : "text-[#1a1a1a]/40 hover:text-[#1a1a1a]"
                )}
            >
                <Paperclip size={24} />
            </button>
          </div>
          <button
            type="submit"
            disabled={!input.trim()}
            className={cn(
                "h-[70px] px-10 font-['Oswald'] uppercase tracking-widest text-base font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[6px_6px_0px_0px_rgba(0,0,0,0.2)] active:translate-y-[2px] active:translate-x-[2px] active:shadow-none border-2 relative overflow-hidden",
                theme === 'coffee' 
                    ? "bg-[#e8e6df] text-[#2c241b] hover:bg-[#fff] border-[#e8e6df]/20" 
                    : "bg-[#1a1a1a] text-[#e8e6df] hover:bg-[#333] border-[#1a1a1a] hover:border-black"
            )}
          >
             <span className="relative z-10">Send</span>
             <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 pointer-events-none"></div>
          </button>
          
          {canFinalize && onFinalize && (
            <button
              type="button"
              onClick={onFinalize}
              className={cn(
                  "h-[70px] px-6 font-['Oswald'] uppercase tracking-widest text-sm font-bold transition-all shadow-[6px_6px_0px_0px_rgba(0,0,0,0.2)] active:translate-y-[2px] active:translate-x-[2px] active:shadow-none border-2 relative overflow-hidden flex items-center gap-2",
                  theme === 'coffee' 
                      ? "bg-green-700 text-white hover:bg-green-600 border-green-800" 
                      : "bg-green-600 text-white hover:bg-green-500 border-green-700"
              )}
            >
               <Sparkles size={18} />
               <span className="relative z-10">Finalize</span>
               <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 pointer-events-none"></div>
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

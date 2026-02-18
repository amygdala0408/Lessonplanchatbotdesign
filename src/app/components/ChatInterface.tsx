import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User, Bot, Paperclip } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Message } from '../../types';

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (message: string) => void;
  isTyping: boolean;
}

export function ChatInterface({ messages, onSendMessage, isTyping }: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    <div className="flex flex-col h-full bg-[#fdfdfd] relative overflow-hidden shadow-[16px_16px_0px_0px_rgba(26,26,26,0.9)] border-4 border-[#1a1a1a] max-w-4xl mx-auto w-full">
      {/* Background Texture */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.04] bg-[url('https://www.transparenttextures.com/patterns/noise-lines.png')] z-0 mix-blend-multiply"></div>
      <div className="absolute inset-0 pointer-events-none opacity-[0.02] bg-[url('https://www.transparenttextures.com/patterns/paper.png')] z-0"></div>

      {/* Header */}
      <div className="p-6 border-b-4 border-[#1a1a1a] bg-[#e6e2d6] text-[#1a1a1a] z-10 flex items-center justify-between shadow-sm relative">
        <div className="absolute inset-0 pointer-events-none opacity-[0.05] bg-[url('https://www.transparenttextures.com/patterns/cardboard-flat.png')]"></div>
        
        <div className="flex items-center gap-4 relative z-10">
            <div className="w-4 h-4 bg-[#1a1a1a] rotate-45 border-2 border-white shadow-[2px_2px_0px_0px_rgba(0,0,0,0.2)]"></div>
            <div>
                <h2 className="font-['Oswald'] text-xl font-bold uppercase tracking-widest leading-none">Conversation Log</h2>
                <div className="flex items-center gap-2 mt-1">
                    <span className="w-2 h-2 rounded-full bg-green-600 animate-pulse"></span>
                    <p className="text-[10px] font-mono opacity-60 uppercase tracking-widest">Active Session</p>
                </div>
            </div>
        </div>
        <div className="text-[10px] font-mono opacity-60 border-2 border-[#1a1a1a] px-3 py-1 bg-[#fdfdfd] shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)] relative z-10">
            SECURE • {new Date().toLocaleDateString()}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-8 space-y-10 z-10 scrollbar-thin scrollbar-thumb-[#1a1a1a] scrollbar-track-[#e6e2d6] bg-[#fdfdfd] relative">
        {/* Subtle grid lines background */}
        <div className="absolute inset-0 pointer-events-none" 
             style={{ 
                 backgroundImage: 'linear-gradient(#1a1a1a 1px, transparent 1px)', 
                 backgroundSize: '100% 40px', 
                 opacity: 0.03 
             }}>
        </div>

        {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full opacity-50 text-center space-y-6 relative z-10">
                <div className="w-24 h-24 border-4 border-[#1a1a1a] rounded-full flex items-center justify-center bg-[#e6e2d6] shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)]">
                     <Bot className="w-12 h-12 text-[#1a1a1a]" />
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
                "w-12 h-12 border-2 border-[#1a1a1a] flex items-center justify-center shrink-0 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative z-10",
                msg.role === 'user' ? "bg-[#1a1a1a] text-[#e8e6df]" : "bg-[#e6e2d6] text-[#1a1a1a]"
              )}>
                 <div className="absolute inset-0 pointer-events-none opacity-20 bg-[url('https://www.transparenttextures.com/patterns/noise-lines.png')]"></div>
                {msg.role === 'user' ? <User size={20} /> : <Bot size={20} />}
              </div>
              
              <div className={cn(
                "p-6 text-base font-['DM_Sans'] leading-relaxed border-2 border-[#1a1a1a] relative",
                msg.role === 'user' 
                  ? "bg-[#1a1a1a] text-[#e8e6df] shadow-[4px_4px_0px_0px_rgba(0,0,0,0.3)]" 
                  : "bg-white text-[#1a1a1a] shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)]"
              )}>
                {/* Texture for bubbles */}
                <div className={cn(
                    "absolute inset-0 pointer-events-none opacity-[0.05] mix-blend-multiply",
                    msg.role === 'user' ? "bg-[url('https://www.transparenttextures.com/patterns/stardust.png')]" : "bg-[url('https://www.transparenttextures.com/patterns/paper.png')]"
                )}></div>
                
                <p className="whitespace-pre-wrap relative z-10">{msg.content}</p>
                <span className={cn(
                    "text-[10px] opacity-50 mt-4 block font-mono uppercase tracking-widest pt-3 border-t border-dashed relative z-10",
                    msg.role === 'user' ? "border-[#e8e6df]/30" : "border-[#1a1a1a]/20"
                )}>
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
             <div className="w-12 h-12 border-2 border-[#1a1a1a] flex items-center justify-center shrink-0 bg-[#e6e2d6] text-[#1a1a1a] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <Bot size={20} />
             </div>
             <div className="p-6 bg-white border-2 border-[#1a1a1a] shadow-[6px_6px_0px_0px_rgba(0,0,0,0.1)] flex gap-2 items-center h-auto">
                <span className="w-2.5 h-2.5 bg-[#1a1a1a] rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-2.5 h-2.5 bg-[#1a1a1a] rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-2.5 h-2.5 bg-[#1a1a1a] rounded-full animate-bounce"></span>
             </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-8 border-t-4 border-[#1a1a1a] bg-[#e6e2d6] z-10 relative shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
        <div className="absolute inset-0 pointer-events-none opacity-[0.05] bg-[url('https://www.transparenttextures.com/patterns/cardboard-flat.png')]"></div>
        
        <form onSubmit={handleSubmit} className="relative flex items-end gap-4 z-10">
          <div className="flex-1 relative group">
            <div className="absolute inset-0 bg-[#1a1a1a] translate-x-1.5 translate-y-1.5 transition-transform group-focus-within:translate-x-2.5 group-focus-within:translate-y-2.5 pointer-events-none"></div>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              className="relative w-full bg-white border-2 border-[#1a1a1a] p-5 pr-14 focus:outline-none font-['DM_Sans'] placeholder:text-[#1a1a1a]/40 text-[#1a1a1a] text-lg shadow-[inset_2px_2px_10px_rgba(0,0,0,0.03)]"
            />
            <button 
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#1a1a1a]/40 hover:text-[#1a1a1a] transition-colors z-20 hover:scale-110 active:scale-95"
            >
                <Paperclip size={24} />
            </button>
          </div>
          <button
            type="submit"
            disabled={!input.trim()}
            className="h-[70px] px-10 bg-[#1a1a1a] text-[#e8e6df] font-['Oswald'] uppercase tracking-widest text-base font-bold hover:bg-[#333] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[6px_6px_0px_0px_rgba(0,0,0,0.2)] active:translate-y-[2px] active:translate-x-[2px] active:shadow-none border-2 border-[#1a1a1a] hover:border-black relative overflow-hidden"
          >
             <span className="relative z-10">Send</span>
             <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 pointer-events-none"></div>
          </button>
        </form>
      </div>
    </div>
  );
}

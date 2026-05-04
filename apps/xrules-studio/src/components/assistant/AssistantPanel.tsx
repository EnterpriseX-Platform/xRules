'use client';
// AI Assistant — floating bottom-right dock. Toggle with the Sparkles button or '?'/'a' shortcut.
// Calls POST /assistant/chat with the current project context.
import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Sparkles, Send, X, Bot, User } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { useProject } from '@/lib/store';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

interface Msg { role: 'user' | 'assistant'; content: string; ts: number }

export function AssistantPanel() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const projectId = useProject((s) => s.currentProjectId);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Global hotkey: cmd/ctrl + ; toggles panel
  useEffect(() => {
    const onKey = (e: any) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ';') {
        e.preventDefault();
        setOpen(v => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  const mut = useMutation({
    mutationFn: async (next: Msg[]) => {
      const res = await api.post<{ reply: string; provider: string; model: string }>('/assistant/chat', {
        projectId,
        messages: next.map(m => ({ role: m.role, content: m.content })),
      });
      return res;
    },
    onSuccess: (res) => {
      setMessages(prev => [...prev, { role: 'assistant', content: res.reply, ts: Date.now() }]);
    },
    onError: (err: any) => {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${err.message || err}.\n\nTip: set ANTHROPIC_API_KEY or OPENAI_API_KEY in the backend .env to enable the assistant.`,
        ts: Date.now(),
      }]);
    },
  });

  function send() {
    const text = draft.trim();
    if (!text || !projectId || mut.isPending) return;
    const next: Msg[] = [...messages, { role: 'user', content: text, ts: Date.now() }];
    setMessages(next);
    setDraft('');
    mut.mutate(next);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
      {/* Floating toggle */}
      <button
        className={cn(
          'fixed bottom-5 right-5 z-40 h-12 w-12 rounded-full shadow-lg border transition-all',
          'flex items-center justify-center',
          open ? 'bg-text text-bg border-text' : 'bg-accent text-white border-accent hover:scale-105',
        )}
        onClick={() => setOpen(v => !v)}
        title={open ? 'Close assistant (⌘;)' : 'Ask Assistant (⌘;)'}
      >
        {open ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 z-40 w-[380px] max-h-[70vh] card flex flex-col shadow-xl">
          <div className="px-3 py-2 border-b border-border flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            <span className="label-section">XRules Assistant</span>
            {!projectId && <span className="font-mono text-[9px] text-warn ml-auto">no project context</span>}
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[260px]">
            {messages.length === 0 && (
              <div className="text-center py-6 text-xs text-subtle">
                <Bot className="h-8 w-8 mx-auto mb-2 text-subtle/50" />
                <div>Ask anything about your project.</div>
                <div className="font-mono text-[10px] text-subtle/70 mt-2 space-y-0.5">
                  <div>"Generate a decision table for loan approval."</div>
                  <div>"What rules call my fraud-score rule?"</div>
                  <div>"Explain hit policy FIRST vs UNIQUE."</div>
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <Bubble key={i} m={m} />
            ))}
            {mut.isPending && (
              <div className="flex items-start gap-2">
                <div className="h-6 w-6 rounded-full bg-accent/15 flex items-center justify-center text-accent flex-shrink-0">
                  <Bot className="h-3 w-3" />
                </div>
                <div className="text-xs text-subtle font-mono pt-1.5">thinking…</div>
              </div>
            )}
          </div>

          <div className="border-t border-border p-2">
            <textarea
              className="w-full resize-none bg-transparent border-0 outline-none px-2 py-1.5 text-xs"
              rows={2}
              placeholder={projectId ? 'Ask anything…' : 'Pick a project first'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={!projectId || mut.isPending}
            />
            <div className="flex items-center justify-between px-1 pt-1">
              <span className="font-mono text-[9px] text-subtle">enter to send · shift+enter for newline</span>
              <button
                className="btn-primary text-xs disabled:opacity-50"
                disabled={!draft.trim() || !projectId || mut.isPending}
                onClick={send}
              >
                <Send className="h-3 w-3" /> Send
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Bubble({ m }: { m: Msg }) {
  const isUser = m.role === 'user';
  return (
    <div className={cn('flex items-start gap-2', isUser && 'flex-row-reverse')}>
      <div className={cn(
        'h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0',
        isUser ? 'bg-muted text-text' : 'bg-accent/15 text-accent',
      )}>
        {isUser ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
      </div>
      <div className={cn(
        'rounded px-2.5 py-1.5 text-xs leading-relaxed max-w-[280px] whitespace-pre-wrap break-words',
        isUser ? 'bg-muted' : 'border border-border bg-surface',
      )}>
        {renderContent(m.content)}
      </div>
    </div>
  );
}

// Lightweight markdown: render fenced ```json as a code block, the rest as paragraphs.
function renderContent(text: string) {
  const parts = text.split(/```(\w+)?\n([\s\S]*?)```/g);
  const out: React.ReactNode[] = [];
  for (let i = 0; i < parts.length; ) {
    const seg = parts[i];
    // Pattern: text, lang, code, text, lang, code, ...
    if (i % 3 === 0) {
      if (seg) out.push(<span key={`t${i}`}>{seg}</span>);
      i++;
    } else {
      const lang = parts[i] || '';
      const code = parts[i + 1] || '';
      out.push(
        <pre key={`c${i}`} className="bg-bg border border-border rounded p-2 my-1 font-mono text-[10px] overflow-x-auto">
          {lang && <div className="text-[9px] text-subtle uppercase mb-1">{lang}</div>}
          {code}
        </pre>
      );
      i += 2;
    }
  }
  return out;
}

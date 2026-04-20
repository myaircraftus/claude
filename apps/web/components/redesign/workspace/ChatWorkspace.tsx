"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  MessageSquare, Plus, Pin, Archive, Search, ChevronDown, Send,
  Plane, User, Sparkles, MoreHorizontal, Trash2,
  Clock, Copy, Share2, Mail, FileText, Settings,
  Bot, ChevronRight, PanelRightClose, PanelRightOpen,
  PenLine, Check, X, Wrench, Receipt, Users, BarChart2,
  ShieldCheck, ListChecks, PackageSearch, Zap
} from "lucide-react";
import {
  generateResponse, createThread, AIRCRAFT_DB, generateThreadTitle,
  type ChatThread, type ChatMessage, type ArtifactType, type AircraftContext
} from "./chatEngine";
import { ArtifactPanel } from "./ArtifactPanel";

/* ---- Mock threads ---- */
const INITIAL_THREADS: ChatThread[] = [
  {
    id: "thread-demo-1",
    title: "Oil Change Log · N12345",
    aircraft: "N12345",
    pinned: true,
    archived: false,
    scope: "aircraft",
    messages: [
      { id: "m1", role: "system", content: "Aircraft context loaded: N12345 (Cessna 172S Skyhawk SP).", timestamp: new Date(Date.now() - 86400000) },
      { id: "m2", role: "user", content: "Prepare a logbook entry for oil change", timestamp: new Date(Date.now() - 86400000 + 1000) },
      { id: "m3", role: "assistant", content: "I've drafted an **Oil Change** logbook entry for **N12345**. The entry is open in the workspace panel.\n\n**What I still need:**\n- Oil quantity and brand\n- Hobbs/tach at service", timestamp: new Date(Date.now() - 86400000 + 2000), artifact: "logbook-entry" },
    ],
    createdAt: new Date(Date.now() - 86400000),
    updatedAt: new Date(Date.now() - 86400000),
  },
  {
    id: "thread-demo-2",
    title: "WO: Left brake dragging · N67890",
    aircraft: "N67890",
    pinned: false,
    archived: false,
    scope: "work-order",
    workOrder: "WO-2026-0047",
    messages: [
      { id: "m4", role: "system", content: "Aircraft context loaded: N67890 (Piper PA-28-181 Archer III).", timestamp: new Date(Date.now() - 172800000) },
      { id: "m5", role: "user", content: "Create a work order for left brake dragging", timestamp: new Date(Date.now() - 172800000 + 1000) },
      { id: "m6", role: "assistant", content: "Work order **WO-2026-0047** created for **N67890**. Squawk set to: *Left brake dragging*.", timestamp: new Date(Date.now() - 172800000 + 2000), artifact: "work-order" },
    ],
    createdAt: new Date(Date.now() - 172800000),
    updatedAt: new Date(Date.now() - 172800000),
  },
  {
    id: "thread-demo-3",
    title: "Overdue Invoices",
    pinned: false,
    archived: false,
    scope: "general",
    messages: [
      { id: "m7", role: "system", content: "General thread — no aircraft scoped.", timestamp: new Date(Date.now() - 259200000) },
      { id: "m8", role: "user", content: "Show overdue invoices", timestamp: new Date(Date.now() - 259200000 + 1000) },
      { id: "m9", role: "assistant", content: "Here are **overdue invoices** across all customers:\n\n| Invoice | Customer | Amount | Due | Days Overdue |\n|---|---|---|---|---|\n| INV-2026-1987 | Horizon Flights Inc. | $3,450.00 | Mar 1, 2026 | 32 days |\n| INV-2026-2005 | Steve Williams | $875.00 | Mar 18, 2026 | 15 days |\n\n**Total outstanding: $4,325.00**", timestamp: new Date(Date.now() - 259200000 + 2000) },
    ],
    createdAt: new Date(Date.now() - 259200000),
    updatedAt: new Date(Date.now() - 259200000),
  },
];

/* ---- Quick-action chips for new chat welcome screen ---- */
const QUICK_ACTIONS = [
  { icon: FileText,    label: "Logbook Entry",        prompt: "Prepare a logbook entry for oil change",          color: "text-blue-600 bg-blue-50" },
  { icon: Wrench,      label: "New Work Order",        prompt: "Create a new work order",                         color: "text-amber-600 bg-amber-50" },
  { icon: Receipt,     label: "Generate Invoice",      prompt: "Generate an invoice for the current work order",  color: "text-green-600 bg-green-50" },
  { icon: BarChart2,   label: "Create Estimate",       prompt: "Create an estimate for annual inspection",        color: "text-purple-600 bg-purple-50" },
  { icon: PackageSearch, label: "Find a Part",         prompt: "Find alternator for this aircraft",               color: "text-orange-600 bg-orange-50" },
  { icon: Users,       label: "Customer List",         prompt: "List all customers",                              color: "text-indigo-600 bg-indigo-50" },
  { icon: Receipt,     label: "Overdue Invoices",      prompt: "Show overdue invoices",                           color: "text-red-600 bg-red-50" },
  { icon: ShieldCheck, label: "AD Compliance",         prompt: "Check AD compliance for this aircraft",           color: "text-teal-600 bg-teal-50" },
  { icon: ListChecks,  label: "Inspection Checklist",  prompt: "Open annual inspection checklist",               color: "text-cyan-600 bg-cyan-50" },
  { icon: Settings,    label: "Settings",              prompt: "Open settings",                                   color: "text-slate-600 bg-slate-50" },
];

export function ChatWorkspace() {
  /* ---- State ---- */
  const [threads, setThreads]           = useState<ChatThread[]>(INITIAL_THREADS);
  const [activeThreadId, setActiveThreadId] = useState(INITIAL_THREADS[0].id);
  const [selectedAircraft, setSelectedAircraft] = useState<string>("N12345");
  const [inputValue, setInputValue]     = useState("");
  const [showAircraftPicker, setShowAircraftPicker] = useState(false);
  const [artifact, setArtifact]         = useState<{ type: ArtifactType; data: any } | null>(null);
  const [showSidebar, setShowSidebar]   = useState(true);
  const [showArtifact, setShowArtifact] = useState(true);
  const [isTyping, setIsTyping]         = useState(false);
  const [threadMenu, setThreadMenu]     = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);

  const activeThread = threads.find((t) => t.id === activeThreadId);
  const ac           = AIRCRAFT_DB[selectedAircraft];

  // Is this a "new / empty" thread (only system message)?
  const isEmptyThread = (activeThread?.messages.filter(m => m.role !== "system").length ?? 0) === 0;

  /* ---- Scroll to bottom ---- */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeThread?.messages.length, isTyping]);

  /* ---- Send message ---- */
  const sendMessage = useCallback((overrideText?: string) => {
    const text = overrideText ?? inputValue;
    if (!text.trim() || !activeThread) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: text.trim(),
      timestamp: new Date(),
    };

    setThreads((prev) =>
      prev.map((t) =>
        t.id === activeThreadId
          ? { ...t, messages: [...t.messages, userMsg], updatedAt: new Date() }
          : t
      )
    );
    setInputValue("");
    setIsTyping(true);

    setTimeout(() => {
      const response = generateResponse(userMsg.content, ac);

      setThreads((prev) =>
        prev.map((t) =>
          t.id === activeThreadId
            ? { ...t, messages: [...t.messages, response], updatedAt: new Date() }
            : t
        )
      );

      if (response.artifact) {
        setArtifact({ type: response.artifact, data: response.artifactData });
        setShowArtifact(true);
      }

      // Smart auto-title from first user message
      setThreads((prev) =>
        prev.map((t) => {
          if (t.id === activeThreadId && t.title.includes("New Thread")) {
            return { ...t, title: generateThreadTitle(userMsg.content, selectedAircraft) };
          }
          return t;
        })
      );

      setIsTyping(false);
    }, 700 + Math.random() * 1000);
  }, [inputValue, activeThread, activeThreadId, ac, selectedAircraft]);

  /* ---- New thread ---- */
  const newThread = () => {
    const thread = createThread("aircraft", selectedAircraft);
    setThreads((prev) => [thread, ...prev]);
    setActiveThreadId(thread.id);
    setArtifact(null);
    inputRef.current?.focus();
  };

  /* ---- Keyboard ---- */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  /* ---- Render markdown-light ---- */
  const renderContent = (text: string) => {
    let html = text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br/>');

    if (html.includes('|')) {
      const lines = html.split('<br/>');
      let inTable = false;
      let tableHtml = '';
      const result: string[] = [];

      for (const line of lines) {
        if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
          if (line.replace(/[|\s-]/g, '').length === 0) continue;
          if (!inTable) {
            inTable = true;
            tableHtml = '<table class="w-full text-[12px] my-2 border border-border rounded"><thead><tr>';
            const cells = line.split('|').filter(Boolean);
            cells.forEach(c => { tableHtml += `<th class="px-2 py-1.5 text-left bg-muted/50 border-b border-border" style="font-weight:600">${c.trim()}</th>`; });
            tableHtml += '</tr></thead><tbody>';
          } else {
            tableHtml += '<tr>';
            const cells = line.split('|').filter(Boolean);
            cells.forEach(c => { tableHtml += `<td class="px-2 py-1.5 border-b border-border">${c.trim()}</td>`; });
            tableHtml += '</tr>';
          }
        } else {
          if (inTable) {
            tableHtml += '</tbody></table>';
            result.push(tableHtml);
            inTable = false;
            tableHtml = '';
          }
          result.push(line);
        }
      }
      if (inTable) { tableHtml += '</tbody></table>'; result.push(tableHtml); }
      html = result.join('<br/>');
    }
    return html;
  };

  return (
    <div className="h-full flex overflow-hidden">
      {/* ============ LEFT SIDEBAR — Thread List ============ */}
      {showSidebar && (
        <div className="w-[260px] bg-muted/30 border-r border-border flex flex-col shrink-0">
          {/* Header */}
          <div className="p-3 border-b border-border">
            <button
              onClick={newThread}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-white text-[13px] hover:bg-primary/90 transition-colors"
              style={{ fontWeight: 500 }}
            >
              <Plus className="w-4 h-4" /> New Chat
            </button>
          </div>

          {/* Search */}
          <div className="px-3 py-2">
            <div className="flex items-center gap-2 bg-white border border-border rounded-lg px-2.5 py-1.5">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search threads..."
                className="bg-transparent text-[12px] outline-none flex-1 placeholder:text-muted-foreground/50"
              />
            </div>
          </div>

          {/* Thread list */}
          <div className="flex-1 overflow-auto px-2 py-1 space-y-0.5">
            {/* Pinned */}
            {threads.filter((t) => t.pinned && !t.archived).length > 0 && (
              <>
                <div className="px-2 py-1.5 text-[10px] text-muted-foreground uppercase tracking-wider" style={{ fontWeight: 700 }}>Pinned</div>
                {threads.filter((t) => t.pinned && !t.archived).map((t) => (
                  <ThreadItem
                    key={t.id}
                    thread={t}
                    active={t.id === activeThreadId}
                    onClick={() => setActiveThreadId(t.id)}
                    menuOpen={threadMenu === t.id}
                    onToggleMenu={() => setThreadMenu(threadMenu === t.id ? null : t.id)}
                    onPin={() => setThreads(prev => prev.map(th => th.id === t.id ? { ...th, pinned: !th.pinned } : th))}
                    onArchive={() => setThreads(prev => prev.map(th => th.id === t.id ? { ...th, archived: true } : th))}
                    onDelete={() => { setThreads(prev => prev.filter(th => th.id !== t.id)); if (activeThreadId === t.id) setActiveThreadId(threads[0]?.id); }}
                    onRename={(title) => setThreads(prev => prev.map(th => th.id === t.id ? { ...th, title } : th))}
                  />
                ))}
              </>
            )}

            {/* Recent */}
            <div className="px-2 py-1.5 text-[10px] text-muted-foreground uppercase tracking-wider" style={{ fontWeight: 700 }}>Recent</div>
            {threads.filter((t) => !t.pinned && !t.archived).map((t) => (
              <ThreadItem
                key={t.id}
                thread={t}
                active={t.id === activeThreadId}
                onClick={() => setActiveThreadId(t.id)}
                menuOpen={threadMenu === t.id}
                onToggleMenu={() => setThreadMenu(threadMenu === t.id ? null : t.id)}
                onPin={() => setThreads(prev => prev.map(th => th.id === t.id ? { ...th, pinned: !th.pinned } : th))}
                onArchive={() => setThreads(prev => prev.map(th => th.id === t.id ? { ...th, archived: true } : th))}
                onDelete={() => { setThreads(prev => prev.filter(th => th.id !== t.id)); if (activeThreadId === t.id && threads.length > 1) setActiveThreadId(threads.find(th => th.id !== t.id)!.id); }}
                onRename={(title) => setThreads(prev => prev.map(th => th.id === t.id ? { ...th, title } : th))}
              />
            ))}
          </div>
        </div>
      )}

      {/* ============ CENTER — Chat Panel ============ */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top context bar */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-border bg-white shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowSidebar(!showSidebar)} className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground">
              <MessageSquare className="w-4 h-4" />
            </button>

            {/* Aircraft selector */}
            <div className="relative">
              <button
                onClick={() => setShowAircraftPicker(!showAircraftPicker)}
                className="flex items-center gap-2 bg-primary/5 hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Plane className="w-4 h-4 text-primary" />
                <div className="text-left">
                  <div className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{ac.tailNumber}</div>
                  <div className="text-[10px] text-muted-foreground">{ac.make} {ac.model}</div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              </button>

              {showAircraftPicker && (
                <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-border rounded-xl shadow-xl z-50 py-1">
                  {Object.values(AIRCRAFT_DB).map((a) => (
                    <button
                      key={a.tailNumber}
                      onClick={() => { setSelectedAircraft(a.tailNumber); setShowAircraftPicker(false); }}
                      className={`w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors ${a.tailNumber === selectedAircraft ? "bg-primary/5" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{a.tailNumber}</div>
                          <div className="text-[11px] text-muted-foreground">{a.make} {a.model} &middot; {a.owner}</div>
                        </div>
                        {a.tailNumber === selectedAircraft && <div className="w-2 h-2 rounded-full bg-primary" />}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Aircraft quick info */}
            <div className="hidden lg:flex items-center gap-4 text-[11px] text-muted-foreground ml-2">
              <span>TT: <span style={{ fontWeight: 500 }} className="text-foreground">{ac.totalTime}</span></span>
              <span>Owner: <span style={{ fontWeight: 500 }} className="text-foreground">{ac.owner}</span></span>
              <span>{ac.maintenanceProgram}</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowArtifact(!showArtifact)}
              className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground"
              title={showArtifact ? "Hide workspace" : "Show workspace"}
            >
              {showArtifact ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Messages or Welcome screen */}
        <div className="flex-1 overflow-auto">
          {isEmptyThread ? (
            /* ---- Welcome / empty state ---- */
            <div className="max-w-2xl mx-auto px-4 py-10 flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center mb-4 shadow-lg">
                <Bot className="w-7 h-7 text-white" />
              </div>
              <h2 className="text-foreground mb-1" style={{ fontWeight: 700 }}>AI Command Center</h2>
              <p className="text-[13px] text-muted-foreground mb-8 max-w-sm">
                Everything you need, one conversation. Work orders, invoices, logbook entries, parts, customers — just ask.
              </p>

              {/* Quick action grid */}
              <div className="w-full grid grid-cols-2 gap-2.5 mb-6">
                {QUICK_ACTIONS.map((qa) => (
                  <button
                    key={qa.label}
                    onClick={() => sendMessage(qa.prompt)}
                    className="flex items-center gap-3 text-left px-4 py-3 rounded-xl border border-border bg-white hover:border-primary/30 hover:shadow-sm transition-all group"
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${qa.color}`}>
                      <qa.icon className="w-4 h-4" />
                    </div>
                    <span className="text-[12px] text-foreground" style={{ fontWeight: 500 }}>{qa.label}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Zap className="w-3 h-3" />
                <span>Or type anything below — I understand natural language</span>
              </div>
            </div>
          ) : (
            /* ---- Message thread ---- */
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
              {activeThread?.messages.map((msg) => (
                <div key={msg.id}>
                  {msg.role === "system" ? (
                    <div className="flex items-center justify-center py-2">
                      <span className="text-[11px] text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">{msg.content}</span>
                    </div>
                  ) : msg.role === "user" ? (
                    <div className="flex justify-end">
                      <div className="max-w-[80%] bg-primary text-white px-4 py-3 rounded-2xl rounded-br-md">
                        <div className="text-[13px] leading-relaxed">{msg.content}</div>
                        <div className="text-[10px] text-white/50 mt-1 text-right">
                          {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0">
                        <Sparkles className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="bg-white border border-border rounded-2xl rounded-tl-md px-4 py-3 shadow-sm">
                          <div
                            className="text-[13px] leading-relaxed prose-sm [&_strong]:text-foreground [&_em]:text-primary/80 [&_table]:border-collapse"
                            dangerouslySetInnerHTML={{ __html: renderContent(msg.content) }}
                          />
                          {/* Artifact chip */}
                          {msg.artifact && (
                            <button
                              onClick={() => { setArtifact({ type: msg.artifact!, data: msg.artifactData }); setShowArtifact(true); }}
                              className="mt-3 flex items-center gap-2 bg-primary/5 hover:bg-primary/10 px-3 py-2 rounded-lg transition-colors"
                            >
                              <FileText className="w-3.5 h-3.5 text-primary" />
                              <span className="text-[12px] text-primary" style={{ fontWeight: 500 }}>
                                Open {msg.artifact.replace(/-/g, " ")} in workspace
                              </span>
                              <ChevronRight className="w-3 h-3 text-primary/50" />
                            </button>
                          )}
                          {/* Action buttons */}
                          {msg.actions && (
                            <div className="flex gap-2 mt-3 flex-wrap">
                              {msg.actions.map((a, i) => (
                                <button
                                  key={i}
                                  className={`text-[11px] px-3 py-1.5 rounded-lg transition-colors ${
                                    a.variant === "primary"
                                      ? "bg-primary text-white hover:bg-primary/90"
                                      : a.variant === "secondary"
                                      ? "border border-border hover:bg-muted"
                                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                  }`}
                                  style={{ fontWeight: 500 }}
                                >
                                  {a.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1 ml-1">
                          {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Typing indicator */}
              {isTyping && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4 text-primary" />
                  </div>
                  <div className="bg-white border border-border rounded-2xl rounded-tl-md px-4 py-3 shadow-sm">
                    <div className="flex gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-primary/30 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="w-2 h-2 rounded-full bg-primary/30 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-2 h-2 rounded-full bg-primary/30 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-border bg-white px-4 py-3 shrink-0">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-2 bg-muted/50 rounded-xl border border-border px-3 py-2 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything — invoices, work orders, parts, logbook, estimates, customers, settings…"
                className="flex-1 bg-transparent text-[13px] outline-none resize-none min-h-[20px] max-h-[120px] placeholder:text-muted-foreground/50"
                rows={1}
                style={{ lineHeight: "1.5" }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!inputValue.trim()}
                className="p-2 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center justify-between mt-1.5 px-1">
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span>Press <kbd className="px-1 py-0.5 bg-white border border-border rounded text-[9px]">Enter</kbd> to send</span>
                <span><kbd className="px-1 py-0.5 bg-white border border-border rounded text-[9px]">Shift+Enter</kbd> for new line</span>
              </div>
              <div className="text-[10px] text-muted-foreground">
                Context: <span style={{ fontWeight: 500 }}>{selectedAircraft}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ============ RIGHT — Artifact Panel ============ */}
      {showArtifact && artifact && (
        <div className="w-[400px] shrink-0">
          <ArtifactPanel
            type={artifact.type}
            data={artifact.data}
            onClose={() => setArtifact(null)}
          />
        </div>
      )}
    </div>
  );
}

/* ============================================================= */
/*  Thread List Item with inline rename                           */
/* ============================================================= */
function ThreadItem({ thread, active, onClick, menuOpen, onToggleMenu, onPin, onArchive, onDelete, onRename }: {
  thread: ChatThread;
  active: boolean;
  onClick: () => void;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onPin: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [nameValue, setNameValue] = useState(thread.title);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) {
      setNameValue(thread.title);
      setTimeout(() => renameRef.current?.select(), 50);
    }
  }, [renaming, thread.title]);

  const submitRename = () => {
    if (nameValue.trim()) onRename(nameValue.trim());
    setRenaming(false);
  };

  const ScopeIcon = thread.scope === "aircraft" ? Plane
    : thread.scope === "work-order" ? FileText
    : thread.scope === "customer" ? User
    : MessageSquare;

  return (
    <div className="relative">
      <button
        onClick={onClick}
        className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors group ${
          active ? "bg-white shadow-sm border border-border" : "hover:bg-white/60"
        }`}
      >
        <div className="flex items-start gap-2">
          <ScopeIcon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
          <div className="flex-1 min-w-0">
            {renaming ? (
              <input
                ref={renameRef}
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onBlur={submitRename}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") submitRename();
                  if (e.key === "Escape") setRenaming(false);
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-full text-[12px] border border-primary rounded px-1.5 py-0.5 outline-none bg-white"
                style={{ fontWeight: 500 }}
              />
            ) : (
              <div className="text-[12px] text-foreground truncate" style={{ fontWeight: active ? 600 : 400 }}>
                {thread.title}
              </div>
            )}
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {thread.updatedAt.toLocaleDateString()} &middot; {thread.messages.length} msgs
            </div>
          </div>
          <div
            role="button"
            onClick={(e) => { e.stopPropagation(); onToggleMenu(); }}
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-muted rounded transition-opacity cursor-pointer shrink-0"
          >
            <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        </div>
        {thread.pinned && <Pin className="absolute top-2 right-2 w-2.5 h-2.5 text-primary/40" />}
      </button>

      {menuOpen && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-border rounded-lg shadow-xl z-50 py-1">
          <button onClick={() => { setRenaming(true); onToggleMenu(); onClick(); }}
            className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-muted flex items-center gap-2">
            <PenLine className="w-3 h-3" /> Rename
          </button>
          <button onClick={() => { onPin(); onToggleMenu(); }}
            className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-muted flex items-center gap-2">
            <Pin className="w-3 h-3" /> {thread.pinned ? "Unpin" : "Pin"}
          </button>
          <button onClick={() => { onArchive(); onToggleMenu(); }}
            className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-muted flex items-center gap-2">
            <Archive className="w-3 h-3" /> Archive
          </button>
          <button onClick={() => onToggleMenu()}
            className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-muted flex items-center gap-2">
            <Share2 className="w-3 h-3" /> Share Thread
          </button>
          <button onClick={() => onToggleMenu()}
            className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-muted flex items-center gap-2">
            <Mail className="w-3 h-3" /> Email Summary
          </button>
          <button onClick={() => onToggleMenu()}
            className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-muted flex items-center gap-2">
            <Copy className="w-3 h-3" /> Copy Link
          </button>
          <div className="border-t border-border my-1" />
          <button onClick={() => { onDelete(); onToggleMenu(); }}
            className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-muted text-destructive flex items-center gap-2">
            <Trash2 className="w-3 h-3" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

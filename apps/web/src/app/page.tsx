"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Bot,
  User,
  Send,
  Terminal,
  ShieldCheck,
  FolderPlus,
  ListFilter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Activity,
  History,
  RefreshCw,
  Cpu,
  Mic,
  MicOff,
  Volume2,
  Play,
  Square,
  ShieldAlert,
  AppWindow,
  FileCode,
  StopCircle,
  Camera,
  Copy,
  Code,
  Globe,
} from "lucide-react";

interface MessageItem {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  planSteps?: Array<{ toolId: string; success: boolean; verified: boolean; data?: any }>;
  pendingConfirmation?: {
    taskId: string;
    actions: Array<{ toolId: string; args: any; riskLevel: string }>;
  };
}

interface AuditItem {
  id: string;
  toolId: string;
  riskLevel: string;
  approved: boolean;
  resultStatus: string;
  durationMs: number;
  createdAt: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<MessageItem[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hello! I am your AI Local PC Controller (v2.0). I execute secure, verified OS actions on your Windows host. You can type or use the push-to-talk microphone to issue commands!",
    },
  ]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [systemHealth, setSystemHealth] = useState<{
    status: string;
    database: string;
    hostAgent: string;
  } | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditItem[]>([]);
  const [showAuditModal, setShowAuditModal] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const fetchHealth = async () => {
    try {
      const res = await fetch("/api/health");
      if (res.ok) {
        const data = await res.json();
        setSystemHealth(data);
      }
    } catch {
      setSystemHealth({
        status: "disconnected",
        database: "error",
        hostAgent: "disconnected",
      });
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch("/api/audit");
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setAuditLogs(data.logs);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async (textToSend?: string) => {
    const text = textToSend || input;
    if (!text.trim() || loading) return;

    const userMsg: MessageItem = {
      id: Date.now().toString(),
      role: "user",
      content: text,
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          message: text,
        }),
      });

      const data = await res.json();

      if (data.success) {
        if (data.conversationId) setConversationId(data.conversationId);

        let pendingConfirmation = undefined;
        if (data.taskId && (data.decision?.type === "ask_confirmation" || data.decision?.plan?.steps)) {
          const actions =
            data.decision.actions ||
            data.decision.plan?.steps ||
            [];
          pendingConfirmation = {
            taskId: data.taskId,
            actions,
          };
          setActiveTaskId(data.taskId); // track for Stop button
        }

        const assistantMsg: MessageItem = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.message,
          planSteps: data.results,
          pendingConfirmation,
        };

        setMessages((prev) => [...prev, assistantMsg]);
        fetchAuditLogs();
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: `❌ Error: ${data.error || "Failed to process request"}`,
          },
        ]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: `❌ Network error: ${err?.message || "Could not reach server"}`,
        },
      ]);
    } finally {
      setLoading(false);
      setActiveTaskId(null);
    }
  };

  // Stop a running task mid-execution
  const handleStopTask = async () => {
    if (!activeTaskId) return;
    try {
      await fetch(`/api/tasks/${activeTaskId}/stop`, { method: "POST" });
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), role: "assistant" as const, content: "🛑 Execution stopped by user." },
      ]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setActiveTaskId(null);
    }
  };

  const handleApproveAction = async (msgId: string, taskId: string, actions: any[]) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actions }),
      });
      const data = await res.json();

      if (data.success) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? {
                  ...m,
                  pendingConfirmation: undefined,
                  content: data.message,
                  planSteps: data.results,
                }
              : m
          )
        );
        fetchAuditLogs();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelAction = async (msgId: string, taskId: string) => {
    try {
      await fetch(`/api/tasks/${taskId}/cancel`, { method: "POST" });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                pendingConfirmation: undefined,
                content: "🛑 Action was cancelled by user.",
              }
            : m
        )
      );
    } catch (err) {
      console.error(err);
    }
  };

  // Push-to-Talk Audio Recording with Deepgram STT
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());

        if (audioBlob.size > 0) {
          setLoading(true);
          try {
            const res = await fetch("/api/voice/stt", {
              method: "POST",
              headers: { "Content-Type": "audio/webm" },
              body: audioBlob,
            });
            const data = await res.json();
            if (data.success && data.transcript) {
              handleSend(data.transcript);
            }
          } catch (e) {
            console.error("STT Error:", e);
          } finally {
            setLoading(false);
          }
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone Access Error:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Text-to-Speech Playback with Deepgram Aura TTS
  const speakText = async (text: string) => {
    if (isPlayingAudio) return;
    setIsPlayingAudio(true);
    try {
      const res = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => setIsPlayingAudio(false);
        audio.onerror = () => setIsPlayingAudio(false);
        await audio.play();
      } else {
        setIsPlayingAudio(false);
      }
    } catch (e) {
      console.error(e);
      setIsPlayingAudio(false);
    }
  };

  return (
    <div className="flex flex-col h-screen max-h-screen bg-[#090d16] text-slate-100 font-sans">
      {/* Header Bar */}
      <header className="h-16 border-b border-slate-800 bg-[#0d1322]/80 backdrop-blur-md px-6 flex items-center justify-between z-10">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-cyan-500/10 rounded-lg border border-cyan-500/20 text-cyan-400">
            <Cpu className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-white tracking-wide flex items-center gap-2">
              AI Local PC Controller
              <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-mono">
                v2.0 Phase 2
              </span>
            </h1>
            <p className="text-xs text-slate-400">Secure Host OS Automation & Voice Gateway</p>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center space-x-3 text-xs">
          <div className="flex items-center space-x-2 bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-800">
            <Activity className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400">Host Agent:</span>
            {systemHealth?.hostAgent === "connected" ? (
              <span className="text-emerald-400 font-medium flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                Connected (8765)
              </span>
            ) : (
              <span className="text-rose-400 font-medium">Disconnected</span>
            )}
          </div>

          <div className="flex items-center space-x-2 bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-800">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400">Database:</span>
            {systemHealth?.database === "connected" ? (
              <span className="text-emerald-400 font-medium">SQLite OK</span>
            ) : (
              <span className="text-amber-400 font-medium">Connecting...</span>
            )}
          </div>

          <button
            onClick={() => {
              fetchAuditLogs();
              setShowAuditModal(true);
            }}
            className="flex items-center space-x-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 px-3 py-1.5 rounded-lg border border-cyan-500/30 transition-all"
          >
            <History className="w-3.5 h-3.5" />
            <span>Audit Logs</span>
          </button>
        </div>
      </header>

      {/* Main Chat Feed */}
      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 flex flex-col justify-between max-w-4xl mx-auto w-full p-6">
          {/* Messages List */}
          <div className="flex-1 overflow-y-auto space-y-6 pr-2">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex space-x-4 ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 rounded-lg bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0 mt-1">
                    <Bot className="w-5 h-5" />
                  </div>
                )}

                <div
                  className={`max-w-2xl rounded-2xl p-4 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-cyan-600 text-white rounded-br-none shadow-lg shadow-cyan-900/20"
                      : "bg-[#131b2e] border border-slate-800 text-slate-200 rounded-bl-none shadow-md"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>

                  {/* Text to Speech Button for Assistant Messages */}
                  {msg.role === "assistant" && msg.content && (
                    <div className="mt-2 flex items-center justify-end">
                      <button
                        onClick={() => speakText(msg.content)}
                        disabled={isPlayingAudio}
                        className="text-slate-400 hover:text-cyan-300 p-1 rounded transition-colors text-xs flex items-center gap-1"
                        title="Speak response (Deepgram Aura TTS)"
                      >
                        <Volume2 className={`w-3.5 h-3.5 ${isPlayingAudio ? "text-cyan-400 animate-pulse" : ""}`} />
                        <span>Listen</span>
                      </button>
                    </div>
                  )}

                  {/* Confirmation Modal / Card for High-Risk Actions */}
                  {msg.pendingConfirmation && (
                    <div className="mt-4 p-4 rounded-xl bg-amber-950/40 border border-amber-500/40 space-y-3">
                      <div className="flex items-center space-x-2 text-amber-400 font-semibold text-xs uppercase tracking-wider">
                        <ShieldAlert className="w-4 h-4" />
                        <span>Security Authorization Required</span>
                      </div>
                      <p className="text-xs text-slate-300">
                        The requested action requires explicit confirmation before executing on the OS:
                      </p>

                      <div className="space-y-1.5 font-mono text-xs">
                        {msg.pendingConfirmation.actions.map((act, idx) => (
                          <div
                            key={idx}
                            className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 flex justify-between items-center"
                          >
                            <span className="text-amber-300 font-bold">{act.toolId}</span>
                            <span className="px-1.5 py-0.5 text-[10px] rounded uppercase bg-rose-500/20 text-rose-300 border border-rose-500/40 font-semibold">
                              {act.riskLevel || "high"}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center space-x-2 pt-2">
                        <button
                          onClick={() =>
                            handleApproveAction(
                              msg.id,
                              msg.pendingConfirmation!.taskId,
                              msg.pendingConfirmation!.actions
                            )
                          }
                          className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2 rounded-lg text-xs transition-colors shadow-lg"
                        >
                          ✓ Allow & Execute
                        </button>
                        <button
                          onClick={() =>
                            handleCancelAction(msg.id, msg.pendingConfirmation!.taskId)
                          }
                          className="flex-1 bg-rose-600/80 hover:bg-rose-600 text-white font-medium py-2 rounded-lg text-xs transition-colors"
                        >
                          ✕ Deny / Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Plan Steps Visualizer */}
                  {msg.planSteps && msg.planSteps.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-2">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Executed OS Actions
                      </p>
                      {msg.planSteps.map((step, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/80 text-xs font-mono"
                        >
                          <div className="flex items-center space-x-2">
                            <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                            <span className="text-cyan-300 font-semibold">{step.toolId}</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            {step.success ? (
                              <span className="text-emerald-400 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                {step.verified ? "Verified" : "Success"}
                              </span>
                            ) : (
                              <span className="text-rose-400 flex items-center gap-1">
                                <XCircle className="w-3.5 h-3.5" />
                                Failed
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0 mt-1">
                    <User className="w-5 h-5" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex space-x-4 justify-start items-center">
                <div className="w-8 h-8 rounded-lg bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0 mt-1">
                  <Bot className="w-5 h-5 animate-spin" />
                </div>
                <div className="bg-[#131b2e] border border-slate-800 text-slate-400 rounded-2xl rounded-bl-none p-4 text-sm flex items-center space-x-3">
                  <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                  <span>Evaluating policy & executing actions...</span>
                  {activeTaskId && (
                    <button
                      onClick={handleStopTask}
                      className="ml-2 flex items-center gap-1.5 bg-rose-600/80 hover:bg-rose-600 text-white text-xs px-2.5 py-1 rounded-lg transition-all"
                      title="Stop current task execution"
                    >
                      <StopCircle className="w-3.5 h-3.5" />
                      Stop
                    </button>
                  )}
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick Preset Chips */}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => handleSend("List the files in my Downloads folder")}
              disabled={loading}
              className="flex items-center space-x-1.5 text-xs bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 px-3 py-1.5 rounded-full transition-all"
            >
              <ListFilter className="w-3.5 h-3.5 text-cyan-400" />
              <span>List Downloads folder</span>
            </button>
            <button
              onClick={() => handleSend("List the active running processes on my computer")}
              disabled={loading}
              className="flex items-center space-x-1.5 text-xs bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 px-3 py-1.5 rounded-full transition-all"
            >
              <Cpu className="w-3.5 h-3.5 text-indigo-400" />
              <span>List running processes</span>
            </button>
            <button
              onClick={() => handleSend("Launch Notepad")}
              disabled={loading}
              className="flex items-center space-x-1.5 text-xs bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 px-3 py-1.5 rounded-full transition-all"
            >
              <AppWindow className="w-3.5 h-3.5 text-amber-400" />
              <span>Launch Notepad</span>
            </button>
            <button
              onClick={() => handleSend("Create a folder called Test on my Desktop")}
              disabled={loading}
              className="flex items-center space-x-1.5 text-xs bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 px-3 py-1.5 rounded-full transition-all"
            >
              <FolderPlus className="w-3.5 h-3.5 text-emerald-400" />
              <span>Create Test folder</span>
            </button>
            <button
              onClick={() => handleSend("Take a screenshot of my desktop")}
              disabled={loading}
              className="flex items-center space-x-1.5 text-xs bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 px-3 py-1.5 rounded-full transition-all"
            >
              <Camera className="w-3.5 h-3.5 text-pink-400" />
              <span>Capture Screen</span>
            </button>
            <button
              onClick={() => handleSend("Read text from my clipboard")}
              disabled={loading}
              className="flex items-center space-x-1.5 text-xs bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 px-3 py-1.5 rounded-full transition-all"
            >
              <Copy className="w-3.5 h-3.5 text-purple-400" />
              <span>Read Clipboard</span>
            </button>
            <button
              onClick={() => handleSend("Check git version in terminal")}
              disabled={loading}
              className="flex items-center space-x-1.5 text-xs bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 px-3 py-1.5 rounded-full transition-all"
            >
              <Code className="w-3.5 h-3.5 text-yellow-400" />
              <span>Git Version</span>
            </button>
          </div>

          {/* Input Box with Voice Push-to-Talk */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="mt-3 flex items-center space-x-2 bg-[#111827] p-2 rounded-2xl border border-slate-800 focus-within:border-cyan-500/50 shadow-xl transition-all"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the AI or hold mic to control your PC..."
              disabled={loading}
              className="flex-1 bg-transparent px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
            />

            {/* Push-to-Talk Mic Button */}
            <button
              type="button"
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              className={`p-2.5 rounded-xl transition-all shrink-0 ${
                isRecording
                  ? "bg-rose-600 text-white animate-pulse ring-2 ring-rose-400"
                  : "bg-slate-800 hover:bg-slate-700 text-slate-300"
              }`}
              title="Push-to-Talk: Hold to speak"
            >
              {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 text-white p-2.5 rounded-xl transition-all disabled:text-slate-600 shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </main>
      </div>

      {/* Audit Log Modal */}
      {showAuditModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <History className="w-5 h-5 text-cyan-400" />
                Audit Log History
              </h2>
              <button
                onClick={() => setShowAuditModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-xs">
              {auditLogs.length === 0 ? (
                <p className="text-slate-500 text-center py-8">No audit logs recorded yet.</p>
              ) : (
                auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="bg-[#1e293b]/60 border border-slate-800 rounded-lg p-3 flex justify-between items-center"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-cyan-400 font-bold">{log.toolId}</span>
                        <span
                          className={`px-1.5 py-0.5 text-[10px] rounded uppercase font-semibold ${
                            log.riskLevel === "safe" || log.riskLevel === "low"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                              : log.riskLevel === "medium"
                              ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                          }`}
                        >
                          {log.riskLevel}
                        </span>
                      </div>
                      <p className="text-slate-400 text-[11px] mt-1">
                        {new Date(log.createdAt).toLocaleString()} •{" "}
                        {log.durationMs ? `${log.durationMs}ms` : "N/A"}
                      </p>
                    </div>

                    <div className="text-right">
                      <span
                        className={`font-semibold ${
                          log.resultStatus === "success"
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }`}
                      >
                        {log.resultStatus?.toUpperCase() || "PENDING"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

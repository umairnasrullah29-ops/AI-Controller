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

interface UiAlert {
  id: string;
  type: "error" | "warning" | "info" | "success";
  title: string;
  message: string;
}

/* ──────────────────────────────────────────────────────────
 * MarkdownRenderer – lightweight inline markdown → React
 * Supports: **bold**, *italic*, `code`, [links](url),
 *           - bullet lists, numbered lists, ### headings,
 *           ```code blocks```, and horizontal rules (---)
 * ────────────────────────────────────────────────────────── */
function MarkdownRenderer({ text }: { text: string }) {
  if (!text) return null;

  // Split into lines for block-level parsing
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // --- Fenced code blocks (```...```) ---
    if (line.trimStart().startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <pre
          key={key++}
          className="bg-[#0a0f1d] border border-slate-800 rounded-lg p-3 my-2 overflow-x-auto text-[12px] font-mono text-cyan-300 leading-relaxed"
        >
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      continue;
    }

    // --- Horizontal rule (--- or *** or ___) ---
    if (/^(\s*[-*_]\s*){3,}$/.test(line)) {
      elements.push(<hr key={key++} className="border-slate-700/60 my-3" />);
      i++;
      continue;
    }

    // --- Headings (### / ## / #) ---
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];
      const hClass =
        level === 1
          ? "text-base font-bold text-white mt-3 mb-1.5"
          : level === 2
          ? "text-[15px] font-bold text-slate-100 mt-2.5 mb-1"
          : "text-sm font-semibold text-slate-200 mt-2 mb-1";
      elements.push(
        <p key={key++} className={hClass}>
          {renderInline(headingText)}
        </p>
      );
      i++;
      continue;
    }

    // --- Bullet list items (- or * or •) ---
    if (/^\s*[-*•]\s+/.test(line)) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*[-*•]\s+/, "");
        listItems.push(
          <li key={key++} className="flex items-start gap-2 py-0.5">
            <span className="text-cyan-500 mt-[3px] text-[8px] shrink-0">●</span>
            <span>{renderInline(itemText)}</span>
          </li>
        );
        i++;
      }
      elements.push(
        <ul key={key++} className="my-1.5 space-y-0.5 text-sm">
          {listItems}
        </ul>
      );
      continue;
    }

    // --- Numbered list items (1. 2. 3.) ---
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const listItems: React.ReactNode[] = [];
      let num = 1;
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*\d+[.)]\s+/, "");
        listItems.push(
          <li key={key++} className="flex items-start gap-2 py-0.5">
            <span className="text-cyan-400 font-bold text-xs min-w-[18px] mt-[1px] shrink-0">{num}.</span>
            <span>{renderInline(itemText)}</span>
          </li>
        );
        num++;
        i++;
      }
      elements.push(
        <ol key={key++} className="my-1.5 space-y-0.5 text-sm">
          {listItems}
        </ol>
      );
      continue;
    }

    // --- Empty line → spacer ---
    if (line.trim() === "") {
      elements.push(<div key={key++} className="h-1.5" />);
      i++;
      continue;
    }

    // --- Regular paragraph ---
    elements.push(
      <p key={key++} className="text-sm leading-relaxed my-0.5">
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return <div className="space-y-0.5">{elements}</div>;
}

/** Render inline markdown: **bold**, *italic*, `code`, [link](url) */
function renderInline(text: string): React.ReactNode {
  // Match patterns: **bold**, *italic*, `code`, [text](url)
  const parts: React.ReactNode[] = [];
  // Combined regex for inline patterns
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|(\[(.+?)\]\((.+?)\))/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let partKey = 0;

  while ((match = regex.exec(text)) !== null) {
    // Push preceding plain text
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // **bold**
      parts.push(
        <strong key={partKey++} className="font-bold text-white">
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      // *italic*
      parts.push(
        <em key={partKey++} className="italic text-slate-300">
          {match[4]}
        </em>
      );
    } else if (match[5]) {
      // `code`
      parts.push(
        <code
          key={partKey++}
          className="bg-slate-800/80 text-cyan-300 px-1.5 py-0.5 rounded text-[12px] font-mono border border-slate-700/50"
        >
          {match[6]}
        </code>
      );
    } else if (match[7]) {
      // [text](url)
      parts.push(
        <a
          key={partKey++}
          href={match[9]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan-400 underline underline-offset-2 hover:text-cyan-300 transition-colors"
        >
          {match[8]}
        </a>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Push remaining plain text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

function StepDataCard({ toolId, data }: { toolId: string; data: any }) {
  const [search, setSearch] = useState("");
  if (!data) return null;

  const cleanId = toolId.replace(/^\[recovery\]\s*/, "");

  // 1. Process List Interactive Data Table
  if (cleanId === "process.list" && Array.isArray(data.processes)) {
    const processes = data.processes as Array<{ name: string; pid: number; memUsage: string }>;
    const filtered = search
      ? processes.filter(
          (p) =>
            p.name.toLowerCase().includes(search.toLowerCase()) ||
            String(p.pid).includes(search)
        )
      : processes;

    return (
      <div className="mt-2.5 bg-[#0a0f1d] border border-slate-800/90 rounded-xl p-3 space-y-2 font-sans">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-slate-200 flex items-center gap-1.5 text-xs">
            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
            Active Processes ({processes.length})
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search processes..."
            className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 w-36"
          />
        </div>

        <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-800/80">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-900/90 text-slate-400 font-mono text-[11px] sticky top-0 border-b border-slate-800 z-10">
              <tr>
                <th className="py-1.5 px-3">Process Name</th>
                <th className="py-1.5 px-3">PID</th>
                <th className="py-1.5 px-3 text-right">Memory</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 font-mono text-[11px] text-slate-300">
              {filtered.slice(0, 100).map((proc, i) => (
                <tr key={i} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-1.5 px-3 font-medium text-indigo-300 flex items-center gap-1.5 truncate">
                    <AppWindow className="w-3 h-3 text-slate-500 shrink-0" />
                    <span className="truncate">{proc.name}</span>
                  </td>
                  <td className="py-1.5 px-3 text-slate-400">{proc.pid}</td>
                  <td className="py-1.5 px-3 text-right text-slate-300">{proc.memUsage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 2. Filesystem List File Explorer Grid
  if (cleanId === "filesystem.list" && Array.isArray(data.files)) {
    const files = data.files as Array<{ name: string; isDirectory: boolean; size: number; modifiedAt?: string }>;
    const filteredFiles = search
      ? files.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
      : files;

    return (
      <div className="mt-2.5 bg-[#0a0f1d] border border-slate-800/90 rounded-xl p-3 space-y-2 font-sans">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-slate-200 flex items-center gap-1.5 text-xs truncate">
            <FolderPlus className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="truncate">{data.path || "Files"}</span> ({files.length} items)
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter files..."
            className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 w-32"
          />
        </div>

        <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-800/80 divide-y divide-slate-800/50 font-mono text-[11px]">
          {filteredFiles.slice(0, 100).map((file, i) => (
            <div key={i} className="p-2 flex items-center justify-between hover:bg-slate-800/40 transition-colors">
              <div className="flex items-center space-x-2 truncate">
                {file.isDirectory ? (
                  <span className="px-1.5 py-0.5 bg-amber-500/10 rounded border border-amber-500/20 text-amber-400 text-[10px]">DIR</span>
                ) : (
                  <span className="px-1.5 py-0.5 bg-cyan-500/10 rounded border border-cyan-500/20 text-cyan-400 text-[10px]">FILE</span>
                )}
                <span className={`truncate ${file.isDirectory ? "text-amber-300 font-bold" : "text-slate-200"}`}>
                  {file.name}
                </span>
              </div>
              <span className="text-slate-400 text-[10px] shrink-0 ml-2">
                {file.isDirectory ? "Folder" : file.size ? `${(file.size / 1024).toFixed(1)} KB` : "0 KB"}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 3. Screen Capture Preview Card
  if (cleanId === "screen.capture" && (data.path || data.imageUri)) {
    return (
      <div className="mt-2.5 bg-[#0a0f1d] border border-slate-800/90 rounded-xl p-3 space-y-2.5 font-sans">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-pink-400 font-semibold text-xs">
            <Camera className="w-4 h-4" />
            <span>Desktop Screenshot Captured</span>
          </div>
          <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
            {data.sizeBytes ? `${Math.round(data.sizeBytes / 1024)} KB` : "PNG"} • {data.backend || "GDI"}
          </span>
        </div>

        {/* Live Image Preview Render */}
        {data.imageUri && (
          <div className="overflow-hidden rounded-lg border border-slate-800 bg-black/40">
            <img
              src={data.imageUri}
              alt="Desktop Screenshot"
              className="w-full max-h-80 object-contain hover:scale-[1.02] transition-transform duration-200 cursor-pointer"
              onClick={() => window.open(data.imageUri, "_blank")}
              title="Click to view full size"
            />
          </div>
        )}

        <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 font-mono text-[11px] space-y-1 text-slate-300">
          <p className="truncate"><span className="text-slate-500">File Path:</span> {data.path}</p>
          <p>
            <span className="text-slate-500">Captured:</span> {new Date(data.capturedAt || Date.now()).toLocaleTimeString()} •{" "}
            <span className="text-slate-500">Latency:</span> {data.durationMs}ms
          </p>
        </div>
      </div>
    );
  }

  // 4. Clipboard Card
  if (cleanId === "clipboard.read" && data.text) {
    return (
      <div className="mt-2.5 bg-[#0a0f1d] border border-slate-800/90 rounded-xl p-3 space-y-1.5 font-sans">
        <div className="flex items-center space-x-2 text-purple-400 font-semibold text-xs">
          <Copy className="w-4 h-4" />
          <span>Clipboard Content</span>
        </div>
        <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 font-mono text-slate-200 text-[11px] whitespace-pre-wrap max-h-32 overflow-y-auto">
          {data.text}
        </div>
      </div>
    );
  }

  return null;
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
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [systemHealth, setSystemHealth] = useState<{
    status: string;
    database: string;
    hostAgent: string;
  } | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditItem[]>([]);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [uiAlert, setUiAlert] = useState<UiAlert | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const showAlert = (type: "error" | "warning" | "info" | "success", title: string, message: string) => {
    const alertObj: UiAlert = { id: Date.now().toString(), type, title, message };
    setUiAlert(alertObj);
    setTimeout(() => {
      setUiAlert((current) => (current?.id === alertObj.id ? null : current));
    }, 8000);
  };

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

  const handleSend = async (textToSend?: string, options?: { autoSpeak?: boolean }) => {
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

        // Auto-speak response out loud via Deepgram Aura TTS if message came from voice
        if (options?.autoSpeak && data.message) {
          speakText(data.message);
        }
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

  // Push-to-Talk & Toggle Audio Recording with Deepgram STT
  const startRecording = async () => {
    if (isRecording || isTranscribing) return;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showAlert(
          "error",
          "Browser Security Restriction",
          "Microphone access requires HTTPS or http://localhost. Please open this app via http://localhost:3001."
        );
        return;
      }

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
          setIsTranscribing(true);
          try {
            const res = await fetch("/api/voice/stt", {
              method: "POST",
              headers: { "Content-Type": "audio/webm" },
              body: audioBlob,
            });
            const data = await res.json();
            if (data.success && data.transcript) {
              handleSend(data.transcript, { autoSpeak: true });
            } else {
              showAlert(
                "warning",
                "No Speech Detected",
                "Deepgram did not detect any speech in your recording. Please hold or click the mic button and speak clearly into your microphone."
              );
            }
          } catch (e: any) {
            console.error("STT Error:", e);
            showAlert(
              "error",
              "Speech Transcription Failed",
              `Could not convert speech to text: ${e?.message || "Server error"}`
            );
          } finally {
            setIsTranscribing(false);
          }
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err: any) {
      console.error("Microphone Access Error:", err);
      let title = "Microphone Unavailable";
      let msg = "Could not access microphone on your computer.";

      if (
        err.name === "NotFoundError" ||
        err.name === "DevicesNotFoundError" ||
        err.message?.toLowerCase().includes("not found")
      ) {
        title = "No Microphone Detected";
        msg = "No hardware microphone was found on your PC. Please connect a USB microphone or headset, or use text input below.";
      } else if (
        err.name === "NotAllowedError" ||
        err.name === "PermissionDeniedError" ||
        err.message?.toLowerCase().includes("denied")
      ) {
        title = "Microphone Permission Denied";
        msg = "Microphone access was denied by your browser. Please click the lock icon in your browser address bar and grant microphone permission.";
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        title = "Microphone Busy";
        msg = "Your microphone is currently in use by another application (Zoom, Teams, Discord, etc.).";
      }

      showAlert("error", title, msg);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
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
        audio.onerror = () => {
          setIsPlayingAudio(false);
          showAlert("warning", "Audio Playback Failed", "Could not play generated voice audio.");
        };
        await audio.play();
      } else {
        setIsPlayingAudio(false);
        showAlert("warning", "Speech Generation Failed", "Deepgram TTS service returned an error.");
      }
    } catch (e: any) {
      console.error(e);
      setIsPlayingAudio(false);
      showAlert("error", "TTS Error", e?.message || "Could not connect to speech audio service.");
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
          {/* Hardware / Network / Error Notification Banner */}
          {uiAlert && (
            <div
              className={`mb-4 p-3.5 rounded-xl border flex items-center justify-between shadow-lg text-xs transition-all animate-in fade-in slide-in-from-top-2 ${
                uiAlert.type === "error"
                  ? "bg-rose-950/80 border-rose-500/50 text-rose-200 shadow-rose-950/50"
                  : uiAlert.type === "warning"
                  ? "bg-amber-950/80 border-amber-500/50 text-amber-200 shadow-amber-950/50"
                  : "bg-cyan-950/80 border-cyan-500/50 text-cyan-200 shadow-cyan-950/50"
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                <div>
                  <span className="font-bold text-white block">{uiAlert.title}</span>
                  <span>{uiAlert.message}</span>
                </div>
              </div>
              <button
                onClick={() => setUiAlert(null)}
                className="p-1 hover:bg-white/10 rounded-lg text-slate-300 hover:text-white shrink-0 ml-3 transition-colors"
                title="Dismiss alert"
              >
                ✕
              </button>
            </div>
          )}

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
                  {msg.role === "assistant" ? (
                    <MarkdownRenderer text={msg.content} />
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}

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
                    <div className="mt-4 p-4 rounded-xl bg-amber-950/30 border border-amber-500/40 space-y-3.5 shadow-xl shadow-amber-950/20">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 text-amber-400 font-semibold text-xs uppercase tracking-wider">
                          <ShieldAlert className="w-4 h-4 text-amber-400" />
                          <span>Security Authorization Required</span>
                        </div>
                        <span className="px-2 py-0.5 text-[10px] rounded-full uppercase bg-rose-500/20 text-rose-300 border border-rose-500/40 font-mono font-bold">
                          Action Blocked by Policy
                        </span>
                      </div>

                      <p className="text-xs text-slate-300">
                        This action requires explicit authorization before making changes to your computer:
                      </p>

                      <div className="space-y-2 text-xs">
                        {msg.pendingConfirmation.actions.map((act, idx) => (
                          <div
                            key={idx}
                            className="bg-slate-900/90 p-3 rounded-lg border border-slate-800 flex items-center justify-between"
                          >
                            <div className="space-y-0.5">
                              <span className="text-amber-300 font-bold block">
                                {act.toolId === "filesystem.delete"
                                  ? `🗑️ Delete: ${act.args?.path || "target path"}`
                                  : act.toolId === "process.stop"
                                  ? `🛑 Stop Process: PID ${act.args?.pid}`
                                  : act.toolId === "filesystem.write"
                                  ? `✏️ Edit File: ${act.args?.path || "target file"}`
                                  : act.toolId}
                              </span>
                              {act.args && typeof act.args === "object" && Object.keys(act.args).length > 0 && (
                                <p className="text-[11px] font-mono text-slate-400">
                                  {JSON.stringify(act.args)}
                                </p>
                              )}
                            </div>
                            <span className="px-2 py-0.5 text-[10px] rounded uppercase bg-rose-500/20 text-rose-300 border border-rose-500/40 font-semibold shrink-0 ml-2">
                              {act.riskLevel || "high"}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center space-x-2 pt-1">
                        <button
                          onClick={() =>
                            handleApproveAction(
                              msg.id,
                              msg.pendingConfirmation!.taskId,
                              msg.pendingConfirmation!.actions
                            )
                          }
                          className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-xl text-xs transition-all shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Allow & Execute
                        </button>
                        <button
                          onClick={() =>
                            handleCancelAction(msg.id, msg.pendingConfirmation!.taskId)
                          }
                          className="flex-1 bg-rose-600/80 hover:bg-rose-600 text-white font-semibold py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Deny / Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Plan Steps Visualizer */}
                  {msg.planSteps && msg.planSteps.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-3">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Executed OS Actions & Results
                      </p>
                      {msg.planSteps.map((step, idx) => (
                        <div
                          key={idx}
                          className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 space-y-2 text-xs font-mono"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                              <span className="text-cyan-300 font-bold">{step.toolId}</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              {step.success ? (
                                <span className="text-emerald-400 flex items-center gap-1 font-sans text-[11px] font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  {step.verified ? "Verified" : "Success"}
                                </span>
                              ) : (
                                <span className="text-rose-400 flex items-center gap-1 font-sans text-[11px] font-semibold bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/30">
                                  <XCircle className="w-3.5 h-3.5" />
                                  Failed
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Render Rich Visual Data Card for Processes, Files, Screenshots, Clipboard */}
                          {step.data && <StepDataCard toolId={step.toolId} data={step.data} />}
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
              className="flex items-center space-x-1.5 text-xs bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-slate-300 px-3 py-1.5 rounded-full transition-all hover:border-cyan-500/40"
            >
              <ListFilter className="w-3.5 h-3.5 text-cyan-400" />
              <span>Downloads</span>
            </button>
            <button
              onClick={() => handleSend("List the active running processes on my computer")}
              disabled={loading}
              className="flex items-center space-x-1.5 text-xs bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-slate-300 px-3 py-1.5 rounded-full transition-all hover:border-indigo-500/40"
            >
              <Cpu className="w-3.5 h-3.5 text-indigo-400" />
              <span>Processes</span>
            </button>
            <button
              onClick={() => handleSend("Take a screenshot of my desktop")}
              disabled={loading}
              className="flex items-center space-x-1.5 text-xs bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-slate-300 px-3 py-1.5 rounded-full transition-all hover:border-pink-500/40"
            >
              <Camera className="w-3.5 h-3.5 text-pink-400" />
              <span>Screenshot</span>
            </button>
            <button
              onClick={() => handleSend("Read text from my clipboard")}
              disabled={loading}
              className="flex items-center space-x-1.5 text-xs bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-slate-300 px-3 py-1.5 rounded-full transition-all hover:border-purple-500/40"
            >
              <Copy className="w-3.5 h-3.5 text-purple-400" />
              <span>Clipboard</span>
            </button>
            <button
              onClick={() => handleSend("Launch Notepad")}
              disabled={loading}
              className="flex items-center space-x-1.5 text-xs bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-slate-300 px-3 py-1.5 rounded-full transition-all hover:border-amber-500/40"
            >
              <AppWindow className="w-3.5 h-3.5 text-amber-400" />
              <span>Notepad</span>
            </button>
            <button
              onClick={() => handleSend("Open WhatsApp")}
              disabled={loading}
              className="flex items-center space-x-1.5 text-xs bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-slate-300 px-3 py-1.5 rounded-full transition-all hover:border-emerald-500/40"
            >
              <AppWindow className="w-3.5 h-3.5 text-emerald-400" />
              <span>WhatsApp</span>
            </button>
            <button
              onClick={() => handleSend("Open Windows Settings")}
              disabled={loading}
              className="flex items-center space-x-1.5 text-xs bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-slate-300 px-3 py-1.5 rounded-full transition-all hover:border-cyan-500/40"
            >
              <AppWindow className="w-3.5 h-3.5 text-cyan-400" />
              <span>Settings</span>
            </button>
            <button
              onClick={() => handleSend("Check git version in terminal")}
              disabled={loading}
              className="flex items-center space-x-1.5 text-xs bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-slate-300 px-3 py-1.5 rounded-full transition-all hover:border-yellow-500/40"
            >
              <Code className="w-3.5 h-3.5 text-yellow-400" />
              <span>Git Version</span>
            </button>
            <button
              onClick={() => handleSend("Read and summarize the webpage https://example.com")}
              disabled={loading}
              className="flex items-center space-x-1.5 text-xs bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-slate-300 px-3 py-1.5 rounded-full transition-all hover:border-blue-500/40"
            >
              <Globe className="w-3.5 h-3.5 text-blue-400" />
              <span>Read Webpage</span>
            </button>
          </div>

          {/* Voice Recording / Transcribing Live Status Badge */}
          {(isRecording || isTranscribing) && (
            <div className="mt-3 flex items-center justify-center space-x-2 text-xs font-mono">
              {isRecording && (
                <div className="flex items-center space-x-2 bg-rose-500/20 text-rose-300 border border-rose-500/40 px-3.5 py-1.5 rounded-full animate-pulse shadow-lg shadow-rose-950/50">
                  <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping" />
                  <span>🔴 Recording voice... Release mic button or click to finish</span>
                </div>
              )}
              {isTranscribing && (
                <div className="flex items-center space-x-2 bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-3.5 py-1.5 rounded-full shadow-lg">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                  <span>Transcribing speech via Deepgram Nova-2...</span>
                </div>
              )}
            </div>
          )}

          {/* Input Box with Voice Push-to-Talk & Dual Click/Hold Mic */}
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

            {/* Dual Click / Hold Microphone Button */}
            <button
              type="button"
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              onClick={(e) => {
                e.preventDefault();
                toggleRecording();
              }}
              className={`p-2.5 rounded-xl transition-all shrink-0 relative group ${
                isRecording
                  ? "bg-rose-600 text-white ring-4 ring-rose-500/50 scale-105 shadow-lg shadow-rose-900/50"
                  : "bg-slate-800 hover:bg-cyan-600 hover:text-white text-slate-300 hover:scale-105"
              }`}
              title="Microphone: Click to toggle OR Hold to speak"
            >
              {isRecording ? <MicOff className="w-4 h-4 animate-pulse" /> : <Mic className="w-4 h-4" />}

              {/* Tooltip hint on hover */}
              <span className="absolute -top-9 left-1/2 -translate-x-1/2 bg-slate-900 border border-slate-700 text-[10px] text-slate-200 px-2.5 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-xl z-20">
                {isRecording ? "Click to stop" : "Hold or Click to speak"}
              </span>
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

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  Mic, MicOff, Volume2, Power, Globe, Sparkles, MessageSquare, AlertCircle, RefreshCw,
  BookOpen, CloudSun, CheckSquare, Terminal, Plus, Minus, Check, ChevronRight, Laptop, Trash2
} from "lucide-react";
import ZoyaVisualizer from "./components/ZoyaVisualizer";
import { ZoyaAudioStreamer } from "./components/AudioHelpers";
import { ConnectionState, ReactionType, LiveMessage } from "./types";

export default function App() {
  const [state, setState] = useState<ConnectionState>("disconnected");
  const [volume, setVolume] = useState<number>(0);
  const [transcript, setTranscript] = useState<string>("");
  const [activeReaction, setActiveReaction] = useState<ReactionType | null>(null);
  const [reactionReason, setReactionReason] = useState<string>("");
  const [openedLink, setOpenedLink] = useState<{ url: string; title: string } | null>(null);
  const [logs, setLogs] = useState<LiveMessage[]>([]);
  const [errorDetails, setErrorDetails] = useState<string>("");

  // Virtual Workspace Apps States
  const [activeTab, setActiveTab] = useState<string>("notepad");
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState<boolean>(true);
  const [notepadText, setNotepadText] = useState<string>("বাজার থেকে ফ্রেশ ববা চা নিয়ে আসা। সন্ধ্যা ৭টায় জয়াকে বাংলায় কবিতা শোনানো।");
  const [bobaCount, setBobaCount] = useState<number>(3);
  const [weatherCity, setWeatherCity] = useState<string>("কলকাতা");
  const [weatherTemp, setWeatherTemp] = useState<number>(34);
  const [weatherCond, setWeatherCond] = useState<string>("রৌদ্রোজ্জ্বল ও মনোরম আবহাওয়া (Sunny & Pleasant Weather)");
  const [tasks, setTasks] = useState<Array<{ id: string; text: string; done: boolean }>>([
    { id: "t1", text: "জয়াকে মিষ্টি করে হ্যালো বলা", done: true },
    { id: "t2", text: "ডেস্কটপ ড্যাশবোর্ড চেক করা", done: false },
    { id: "t3", text: "ববা চা কাউন্টার ৫ কাপে নিয়ে যাওয়া", done: false },
  ]);

  const [customTaskInput, setCustomTaskInput] = useState<string>("");

  const wsRef = useRef<WebSocket | null>(null);
  const streamerRef = useRef<ZoyaAudioStreamer | null>(null);

  // Sync ref object for stale closure protection in ws callbacks
  const workspaceStateRef = useRef({
    notepadText,
    bobaCount,
    weatherCity,
    weatherTemp,
    weatherCond,
    tasks,
  });

  useEffect(() => {
    workspaceStateRef.current = {
      notepadText,
      bobaCount,
      weatherCity,
      weatherTemp,
      weatherCond,
      tasks,
    };
  }, [notepadText, bobaCount, weatherCity, weatherTemp, weatherCond, tasks]);

  // Initialize Audio Streamer on mount and cleanup on unmount
  useEffect(() => {
    streamerRef.current = new ZoyaAudioStreamer();
    
    addLog("info", "Zoya core initiated. Ready to establish verbal connection.");
    
    return () => {
      disconnect();
      if (streamerRef.current) {
        streamerRef.current.destroy();
      }
    };
  }, []);

  // Helper to add interactive logs
  const addLog = (
    type: LiveMessage["type"],
    text: string
  ) => {
    const newLog: LiveMessage = {
      id: Math.random().toString(36).substring(2, 9),
      type,
      text,
      timestamp: Date.now(),
    };
    setLogs((prev) => [newLog, ...prev].slice(0, 15));
  };

  // Connect to the full-stack server WebSocket
  const connect = async () => {
    if (wsRef.current) return;
    
    setState("connecting");
    setTranscript("");
    setErrorDetails("");
    setOpenedLink(null);
    addLog("status", "Contacting Zoya's mainframe...");

    try {
      // Determine protocol and host
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/live`;
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = async () => {
        addLog("status", "Verbal portal open. Initializing Zoya's vocalizers...");
        
        // Start Microphone Audio Capturing
        try {
          if (streamerRef.current) {
            await streamerRef.current.startRecording((base64pcm, vol) => {
              // Only send mic data if connected and Zoya is not in connecting/error state
              if (ws.readyState === WebSocket.OPEN) {
                // If Zoya is speaking and user sends mic input, Web Audio / Gemini VAD will automatically interrupt
                ws.send(JSON.stringify({ type: "audio", audio: base64pcm }));
                
                // Track mic volume level for local visualization pulse when state is listening
                setVolume((prev) => {
                  // Direct input drives visual ring
                  return vol;
                });
              }
            });
          }
        } catch (micErr) {
          addLog("error", "Microphone access denied. Vocal feedback disabled.");
          setErrorDetails("Please click lock icon in address bar and allow microphone permissions.");
          disconnect();
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          switch (msg.type) {
            case "status":
              setState(msg.status);
              addLog("status", `Zoya Core status changed to: ${msg.status}`);
              break;

            case "audio":
              // We've received voice chunk from Zoya. Play it gapless.
              setState("speaking");
              if (streamerRef.current) {
                streamerRef.current.playResponseChunk(msg.audio, (vol) => {
                  setVolume(vol);
                  if (vol === 0) {
                    // Back to listening when Zoya is silent
                    setState("listening");
                  }
                });
              }
              break;

            case "transcript":
              // Append to real-time subtitle trace
              setTranscript((prev) => prev + " " + msg.text);
              break;

            case "interrupted":
              // Zoya was talking but detected user speech. Interrupt immediately.
              addLog("interrupted", "Zoya silences herself to hear your sassy remark.");
              if (streamerRef.current) {
                streamerRef.current.handleInterruption();
              }
              setVolume(0);
              setState("listening");
              setTranscript("");
              break;

            case "toolCall":
              executeToolCall(msg.callId, msg.name, msg.args);
              break;

            case "error":
              addLog("error", msg.error);
              setErrorDetails(msg.error);
              setState("error");
              break;
          }
        } catch (err) {
          console.error("Error reading server packet:", err);
        }
      };

      ws.onclose = () => {
        addLog("status", "Verbal portal severed.");
        disconnect();
      };

      ws.onerror = (e) => {
        console.error("WebSocket transport error:", e);
        addLog("error", "Core telemetry connection error.");
        setState("error");
      };

    } catch (e: any) {
      console.error("Connection failed:", e);
      addLog("error", `Failed connection: ${e.message || e}`);
      setState("error");
    }
  };

  // Sever the connection
  const disconnect = () => {
    setState("disconnected");
    setVolume(0);
    setTranscript("");
    setActiveReaction(null);
    setReactionReason("");
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    if (streamerRef.current) {
      streamerRef.current.stopRecording();
      streamerRef.current.handleInterruption();
    }
    
    addLog("status", "Zoya disconnected. Standing by.");
  };

  const toggleConnection = () => {
    if (state === "disconnected" || state === "error") {
      connect();
    } else {
      disconnect();
    }
  };

  // Perform Gemini requested client side tool executions
  const executeToolCall = (callId: string, name: string, args: any) => {
    addLog("toolCall", `Zoya requests action: ${name}`);

    let responseResult: any = {};

    if (name === "openWebsite") {
      const targetUrl = args.url;
      const siteName = args.siteName;
      
      addLog("toolResponse", `Unlocking link to ${siteName}...`);
      setOpenedLink({ url: targetUrl, title: siteName });
      
      try {
        window.open(targetUrl, "_blank", "noopener,noreferrer");
        responseResult = { status: "success", info: `Successfully opened ${siteName} in a new tab.` };
      } catch (err) {
        responseResult = { status: "success", info: `Visual Link trigger card has been displayed for ${siteName}.` };
      }

    } else if (name === "openApp") {
      const app = args.appName;
      const reason = args.reason || "";
      
      addLog("toolResponse", `সিস্টেম অ্যাপ ওপেন করা হচ্ছে: ${app}`);
      setActiveTab(app);
      setIsWorkspaceOpen(true);
      
      if (reason) {
        addLog("info", `ZOYA: "${reason}"`);
      }
      responseResult = { status: "success", currentActiveApp: app };

    } else if (name === "getAppState") {
      const app = args.appName;
      const cached = workspaceStateRef.current;
      addLog("toolResponse", `সিস্টেম অ্যাপ মেমোরি রিড: ${app}`);
      
      if (app === "notepad") {
        responseResult = { notes_content: cached.notepadText };
      } else if (app === "boba_tracker") {
        responseResult = { boba_count: cached.bobaCount };
      } else if (app === "weather") {
        responseResult = { city: cached.weatherCity, temp_celsius: cached.weatherTemp, condition: cached.weatherCond };
      } else if (app === "tasks") {
        responseResult = { items: cached.tasks };
      } else {
        responseResult = { info: "App is active and idle" };
      }

    } else if (name === "interactWithApp") {
      const app = args.appName;
      const action = args.action;
      
      let payload: any = {};
      try {
        payload = typeof args.payload === "string" ? JSON.parse(args.payload) : args.payload || {};
      } catch (e) {
        payload = { text: args.payload };
      }

      addLog("toolResponse", `সিস্টেম অ্যাপ রাইট: ${app} -> ${action}`);

      if (app === "notepad") {
        if (action === "write") {
          const content = payload.text || payload.content || String(args.payload);
          setNotepadText(content);
          responseResult = { status: "success", written_note: content, length: content.length };
        }
      } else if (app === "boba_tracker") {
        if (action === "adjust" || action === "update") {
          if (payload.count !== undefined) {
            setBobaCount(payload.count);
          } else {
            const delta = payload.delta !== undefined ? Number(payload.delta) : 1;
            setBobaCount(prev => Math.max(0, prev + delta));
          }
          responseResult = { status: "success", message: "Boba count adjusted successfully" };
        }
      } else if (app === "weather") {
        if (action === "change_city") {
          const targetCity = payload.city || "Kolkata";
          setWeatherCity(targetCity);
          
          const temps: Record<string, number> = {
            "Kolkata": 34, "কলকাতা": 34,
            "Delhi": 38, "দিল্লি": 38,
            "Mumbai": 31, "মুম্বাই": 31,
            "Chennai": 35, "চেন্নাই": 35,
            "Bengaluru": 28, "বেঙ্গালুরু": 28,
            "Hyderabad": 36, "হায়দরাবাদ": 36
          };
          
          const conditions: Record<string, string> = {
            "Kolkata": "মনোরম হাওয়া ও হালকা রৌদ্রোজ্জ্বল দিন", "কলকাতা": "মনোরম হাওয়া ও হালকা রৌদ্রোজ্জ্বল দিন",
            "Delhi": "উষ্ণ ও অত্যন্ত শুষ্ক আবহাওয়া", "দিল্লি": "উষ্ণ ও অত্যন্ত শুষ্ক আবহাওয়া",
            "Mumbai": "আর্দ্র এবং মনোরম সামুদ্রিক বাতাস", "মুম্বাই": "আর্দ্র এবং মনোরম সামুদ্রিক বাতাস",
            "Chennai": "উষ্ণ ও আর্দ্র উপকূলীয় হাওয়া", "চেন্নাই": "উষ্ণ ও আর্দ্র উপকূলীয় হাওয়া",
            "Bengaluru": "চমৎকার শীতল মেঘলা আবহাওয়া", "বেঙ্গালুরু": "চমৎকার শীতল মেঘলা আবহাওয়া",
            "Hyderabad": "উষ্ণ ও মনোরম রৌদ্রোজ্জ্বল আবহাওয়া", "হায়দরাবাদ": "উষ্ণ ও মনোরম রৌদ্রোজ্জ্বল আবহাওয়া"
          };
          
          const matchedTemp = temps[targetCity] || (26 + Math.floor(Math.random() * 8));
          const matchedCond = conditions[targetCity] || "হু হু করে বইছে মনোরম বাতাস!";
          
          setWeatherTemp(matchedTemp);
          setWeatherCond(matchedCond);
          responseResult = { status: "success", updated_city: targetCity, temp: matchedTemp, comment: matchedCond };
        }
      } else if (app === "tasks") {
        if (action === "add") {
          const tText = payload.text || payload.taskText || "নতুন কাজ";
          const newTaskItem = { id: "t_" + Math.random().toString(36).substring(2, 6), text: tText, done: false };
          setTasks(prev => [...prev, newTaskItem]);
          responseResult = { status: "success", added_task: newTaskItem };
        } else if (action === "toggle" || action === "complete") {
          const tId = payload.id;
          setTasks(prev => prev.map(t => t.id === tId ? { ...t, done: !t.done } : t));
          responseResult = { status: "success", toggled_item_id: tId };
        }
      } else {
        responseResult = { error: "Unknown application action requested" };
      }

    } else if (name === "triggerSassScream") {
      const type = args.type as ReactionType;
      const reason = args.reason;

      setActiveReaction(null); // Reset
      setTimeout(() => {
        setActiveReaction(type);
        setReactionReason(reason);
        addLog("toolResponse", `Sassy core expression triggered: ${type}`);
      }, 50);

      responseResult = { status: "success", val: `Reaction ${type} rendered perfectly to user.` };
    }

    // Send completed execution payload instantly back over socket
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "toolResponse",
          callId,
          name,
          response: { output: responseResult },
        })
      );
    }
  };



  return (
    <div className="fixed inset-0 bg-[#02020f] text-white overflow-hidden flex flex-col select-none font-mono">
      
      {/* Immersive radial pink background glow */}
      <div className="zoya-gradient absolute inset-0 pointer-events-none opacity-40" />

      {/* GLOBAL HUD BAR */}
      <header className="w-full bg-[#050515]/60 border-b border-pink-500/10 px-6 py-3 z-30 flex items-center justify-between backdrop-blur-md">
        <div className="flex items-center space-x-3">
          <div className="w-2.5 h-2.5 rounded-full bg-pink-500 animate-pulse shadow-[0_0_8px_rgba(236,72,153,0.8)]" />
          <h1 className="text-sm font-black tracking-[0.3em] text-pink-500">ZOYA CORE MAINFRAME</h1>
          <span className="text-[9px] uppercase tracking-wider text-slate-500 bg-slate-900 px-2 py-0.5 rounded hidden md:inline border border-slate-800">BENGALI VOICE CO-PILOT v2.9</span>
        </div>
        
        <div className="flex items-center space-x-4">
          <button 
            type="button"
            onClick={() => setIsWorkspaceOpen(!isWorkspaceOpen)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-all flex items-center space-x-1.5 ${
              isWorkspaceOpen 
                ? "bg-pink-500/10 border-pink-500/30 text-pink-300" 
                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span className="text-[10px]">&Sigma; Zoya OS {isWorkspaceOpen ? "VISIBLE" : "HIDDEN"}</span>
          </button>
          
          <button
            type="button"
            onClick={toggleConnection}
            className={`text-xs px-4 py-1.5 rounded-lg font-bold border flex items-center space-x-2 transition-all shadow-md ${
              state === "disconnected" || state === "error"
                ? "bg-pink-500 hover:bg-pink-400 text-black border-pink-500"
                : "bg-red-950/20 text-red-400 border-red-500/30 hover:bg-red-900/40"
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            <span className="text-[10px] uppercase tracking-wider">
              {state === "disconnected" ? "WAKE UP" : "SLEEP"}
            </span>
          </button>
        </div>
      </header>

      {/* MAIN DUAL COLUMN VIEWPORT */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden relative z-10">
        
        {/* LEFT COLUMN: ZOYA DEEP COGNITIVE CORE */}
        <section className={`flex-1 flex flex-col items-center justify-center p-6 space-y-7 transition-all duration-300 ${isWorkspaceOpen ? "lg:w-1/2" : "w-full"}`}>
          
          {/* Reaction HUD indicators */}
          <div className="h-6 text-center flex items-center justify-center">
            {activeReaction ? (
              <div className="flex items-center space-x-2 bg-pink-500/10 border border-pink-500/20 px-3.5 py-1.5 rounded-full animate-pulse shadow-[0_0_15px_rgba(236,72,153,0.15)]">
                <Sparkles className="w-3.5 h-3.5 text-pink-400 animate-spin" />
                <p className="text-[10px] text-pink-300">
                  ZOYA EMOTION MODE: <span className="text-white font-sans font-medium">*{reactionReason || `${activeReaction} reaction!`}*</span>
                </p>
              </div>
            ) : (
              <p className="text-[9px] text-pink-400/80 tracking-widest text-center uppercase animate-pulse">
                {state === "disconnected" && "ট্যাপ করে চালু করুন // STANDBY PORTAL"}
                {state === "connecting" && "কোয়ান্টাম সংযোগ সক্রিয় হচ্ছে..."}
                {state === "listening" && "🎧 কথা বলুন, আমি শুনছি..."}
                {state === "speaking" && "⚡ উত্তর তৈরি হচ্ছে..."}
                {state === "error" && "⚠️ সংযোগ বিচ্ছিন্ন"}
              </p>
            )}
          </div>

          {/* SPINNING VIRTUAL CORE */}
          <div className="relative flex items-center justify-center p-2 cursor-pointer group" onClick={toggleConnection}>
            
            {/* Pulsing orbital rings */}
            <div className={`absolute rounded-full transition-all duration-1000 border border-pink-500/10 pointer-events-none ${
              state !== "disconnected" 
                ? "w-[290px] h-[290px] scale-100 opacity-100 animate-[spin_25s_linear_infinite]" 
                : "w-[220px] h-[220px] scale-90 opacity-40"
            }`} />

            <div className={`absolute rounded-full transition-all duration-1000 border border-purple-500/10 pointer-events-none ${
              state !== "disconnected" 
                ? "w-[340px] h-[340px] scale-100 opacity-100 animate-[pulse_3s_infinite]" 
                : "w-[260px] h-[260px] scale-95 opacity-20"
            }`} />

            <ZoyaVisualizer
              state={state}
              volume={volume}
              reaction={activeReaction}
              onTapCore={toggleConnection}
            />

            {/* Central quick pulsing visual ping */}
            {(state === "listening" || state === "speaking") && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className={`absolute rounded-full border-2 border-pink-400/30 pointer-events-none animate-ping ${
                  state === "speaking" ? "w-44 h-44 duration-1000" : "w-36 h-36 duration-1500"
                }`} />
              </div>
            )}
          </div>

          {/* REALTIME BENGAL SUBTITLED DISPLAY */}
          <div className="w-full max-w-md px-1 select-all">
            <div className="w-full glass-card p-5 rounded-2xl shadow-[0_4px_25px_rgba(0,0,0,0.5)] border border-pink-500/10 bg-slate-950/40 backdrop-blur-md min-h-[100px] flex flex-col justify-center">
              {transcript ? (
                <p className="text-sm leading-relaxed text-pink-100 font-sans max-h-[120px] overflow-y-auto">
                  {transcript}
                </p>
              ) : (
                <div className="text-white/40 italic text-xs leading-relaxed font-sans text-center">
                  {state === "disconnected" ? (
                    <span className="text-pink-400/60 block py-1 font-mono text-xs">
                      "হ্যালো স্যার, আমি জয়া। উপরে ট্যাপ করে আমার সাথে সংযোগ স্থাপন করুন এবং বাংলায় কথা বলুন।"
                    </span>
                  ) : state === "connecting" ? (
                    <span className="animate-pulse">লাইন লোড হচ্ছে... অনুগ্রহ করে বলুন...</span>
                  ) : state === "listening" ? (
                    <span className="text-pink-400 animate-pulse uppercase tracking-wider block font-semibold font-mono">
                      ⚡ Listening... Say something to ZOYA mainframe!
                    </span>
                  ) : (
                    <span>ভয়েস আউটপুট সিন্থেসাইজ হচ্ছে...</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* EXTERNAL WEB LINK INTRUSION INJECTOR */}
          {openedLink && (
            <div className="w-full max-w-md bg-pink-950/20 border border-pink-500/25 p-3.5 rounded-xl flex items-center justify-between shadow-lg animate-pulse">
              <div className="flex items-center space-x-3 text-left">
                <Globe className="w-4 h-4 text-pink-400" />
                <div>
                  <p className="text-[10px] font-bold text-pink-300">সিস্টেম দ্বারা ওয়েবসাইট লিংকিং</p>
                  <p className="text-[9px] opacity-75 truncate max-w-[170px] text-white font-mono">{openedLink.url}</p>
                </div>
              </div>
              <a
                href={openedLink.url}
                target="_blank"
                rel="noreferrer"
                className="text-[9px] uppercase tracking-wider font-bold bg-pink-500 text-black px-3.5 py-1.5 rounded hover:bg-pink-400 active:scale-95 transition-all font-mono"
              >
                Open Link
              </a>
            </div>
          )}

          {/* TELEMETRY FAULT OVERLAY */}
          {errorDetails && (
            <div className="w-full max-w-md bg-red-950/30 border border-red-500/20 p-3 rounded-xl flex items-start space-x-3 text-red-300 shadow-xl text-left">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest font-mono">CONNECTION_ERROR</p>
                <p className="text-xs font-sans mt-0.5 opacity-90 leading-relaxed">{errorDetails}</p>
              </div>
            </div>
          )}

        </section>

        {/* RIGHT COLUMN: ZOYA WORKSPACE OS INTEGRATIONS */}
        {isWorkspaceOpen && (
          <section className="w-full lg:w-1/2 flex flex-col bg-[#040410]/70 border-t lg:border-t-0 lg:border-l border-pink-500/10 backdrop-blur-lg">
            
            {/* App task bar / Tab triggers */}
            <div className="w-full bg-slate-950/60 p-3 border-b border-pink-500/10 flex items-center gap-1.5 overflow-x-auto">
              {[
                { id: "notepad", name: "ডায়েরি", label: "Diary", icon: BookOpen },
                { id: "boba_tracker", name: "ববা চা", label: "Boba", icon: Volume2 },
                { id: "weather", name: "আবহাওয়া", label: "Weather", icon: CloudSun },
                { id: "tasks", name: "কাজসমূহ", label: "Tasks", icon: CheckSquare },
                { id: "console", name: "সার্ভার লগ", label: "Sys Log", icon: Terminal }
              ].map((tab) => {
                const Icon = tab.icon;
                const isSelected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg transition-all text-xs border uppercase tracking-wider ${
                      isSelected
                        ? "bg-pink-500 text-black border-pink-400 shadow-[0_0_10px_rgba(236,72,153,0.3)] font-black"
                        : "bg-slate-900/80 text-slate-400 border-slate-800 hover:text-white"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.name}</span>
                    <span className="text-[8px] opacity-40 hidden md:inline">({tab.label})</span>
                  </button>
                );
              })}
            </div>

            {/* Simulated Desktop Window container */}
            <div className="flex-1 p-5 overflow-y-auto flex flex-col justify-between">
              
              <div className="space-y-4">
                
                {/* 1. NOTEPAD / DIARY APPLICATION PANEL */}
                {activeTab === "notepad" && (
                  <div className="space-y-3 animate-fadeIn">
                    <div className="flex items-center justify-between border-b border-pink-500/10 pb-2">
                      <div className="flex items-center space-x-2">
                        <BookOpen className="w-4 h-4 text-pink-400" />
                        <h2 className="text-xs font-bold uppercase tracking-widest text-pink-300">Zoya Personal Notepad & Diary (ডায়েরি)</h2>
                      </div>
                      <span className="text-[8px] bg-pink-500/20 text-pink-300 px-2 py-0.5 rounded border border-pink-500/10 uppercase tracking-widest">ZOYA WORKSPACE DIRECT READ/WRITE ACCESS</span>
                    </div>

                    <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                      এটি একটি লাইভ ডায়েরি। আপনি এখানে টাইপ করতে পারেন অথবা জয়াকে বলতে পারেন "আমার ডায়েরিতে লিখে রাখো..."। জয়া সরাসরি আপনার ডায়েরিতে লিখতে পারবে!
                    </p>

                    <div className="relative">
                      <textarea
                        value={notepadText}
                        onChange={(e) => setNotepadText(e.target.value)}
                        className="w-full h-44 bg-slate-950 border border-pink-500/20 rounded-xl p-4 text-sm font-sans text-pink-100 outline-none focus:border-pink-500/50 focus:shadow-[0_0_15px_rgba(236,72,153,0.1)] transition-all resize-none"
                        placeholder="আপনার প্রয়োজনীয় তথ্যসমূহ এখানে টাইপ করুন..."
                      />
                      <div className="absolute bottom-2.5 right-3 text-[9px] text-slate-500 uppercase tracking-widest bg-slate-900/90 px-2 py-1 rounded border border-slate-800">
                        {notepadText.length} SYMBOLS
                      </div>
                    </div>

                    {/* Pre-made interactive writing shortcuts */}
                    <div className="flex flex-wrap gap-2 pt-1 items-center">
                      <span className="text-[9px] text-slate-500 uppercase tracking-widest">শর্টকাট নোট:</span>
                      {[
                        "আজ বিকেলে ১০ কাপ ববা চা খেতে হবে!",
                        "সন্ধ্যা ৮টায় বাংলায় কোডিং প্রজেক্ট রিভিউ করবো।",
                        "জয়া অনেক বুদ্ধিমান এবং মিষ্টি একটি সহকারী।"
                      ].map((pText, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setNotepadText(pText)}
                          className="text-[9px] text-slate-300 bg-slate-900 hover:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-800 hover:border-pink-500/20 transition-all font-sans text-left truncate max-w-xs"
                        >
                          + "{pText}"
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. BOBA JUICE COUNTER PANEL WITH HIGH FIDELITY ANIMATIONS */}
                {activeTab === "boba_tracker" && (
                  <div className="space-y-4 animate-fadeIn">
                    <div className="flex items-center justify-between border-b border-pink-500/10 pb-2">
                      <div className="flex items-center space-x-2">
                        <Volume2 className="w-4 h-4 text-pink-400" />
                        <h2 className="text-xs font-bold uppercase tracking-widest text-pink-300">Zoya Boba Drink Counter (ববা কাউন্টার)</h2>
                      </div>
                      <span className="text-[8px] bg-sky-500/10 text-sky-300 px-2 py-0.5 rounded border border-sky-500/20 uppercase tracking-widest">ACTIVE WATER SYSTEM</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                      
                      {/* Interactive CSS Animated Boba Cup Visualizer */}
                      <div className="md:col-span-5 flex justify-center p-3">
                        <div className="relative w-28 h-40 bg-pink-900/10 rounded-b-3xl rounded-t-lg border-2 border-pink-500/30 flex flex-col justify-end p-2 overflow-hidden shadow-[0_4px_30px_rgba(236,72,153,0.1)]">
                          
                          {/* Rich boba tea liquid fill level matching count */}
                          <div 
                            className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-orange-950/70 via-amber-800/50 to-amber-700/30 rounded-b-2xl transition-all duration-1000 flex flex-wrap items-end p-2"
                            style={{ height: `${Math.min(100, Math.max(15, bobaCount * 12))}%` }}
                          >
                            {/* Floating Boba pearls */}
                            {Array.from({ length: Math.min(14, bobaCount * 2) }).map((_, i) => (
                              <div 
                                key={i} 
                                className="w-3.5 h-3.5 rounded-full bg-slate-950 border border-stone-850 m-0.5 animate-bounce shadow-inner"
                                style={{ animationDelay: `${i * 120}ms`, animationDuration: `${1 + (i % 2)}s` }}
                              />
                            ))}
                          </div>

                          {/* Boba Straw */}
                          <div className="absolute top-0 right-7 w-4 h-full bg-pink-500/40 -rotate-12 transform origin-top pointer-events-none border-l border-white/20" />
                          
                          {/* Gloss flare reflection */}
                          <div className="absolute inset-y-0 left-2 w-2.5 bg-white/10 rounded-full blur-[1px] pointer-events-none" />

                          <div className="absolute top-2 left-3 text-[8px] text-pink-400/90 font-mono tracking-widest z-10 font-bold">
                            BOBA TEA
                          </div>
                        </div>
                      </div>

                      <div className="md:col-span-7 space-y-3.5">
                        <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                          জয়া ববা চা খেতে এবং আপনাকে তা খাওয়াতে ভালোবাসে! জয়াকে মুখ দিয়ে বলুন "ববা কাউন্টার ৩ কাপ বাড়াও..." বা "আমি আরেকটি কাপ খাচ্ছি"। বয়া চা শেষ হলে সে আপনাকে বকা দিবে!
                        </p>

                        <div className="bg-slate-950 p-4 rounded-xl border border-pink-500/10 flex items-center justify-between shadow-inner">
                          <div>
                            <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Ordered / Consumed</span>
                            <span className="text-3xl font-black text-pink-400 tracking-widest">{bobaCount} <span className="text-xs text-pink-300 font-medium font-sans">কাপ</span></span>
                          </div>

                          <div className="flex items-center space-x-2">
                            <button
                              type="button"
                              onClick={() => setBobaCount(prev => Math.max(0, prev - 1))}
                              className="w-10 h-10 bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-pink-500/40 rounded-lg flex items-center justify-center transition-all"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setBobaCount(prev => prev + 1)}
                              className="w-10 h-10 bg-pink-500 text-black hover:bg-pink-400 rounded-lg flex items-center justify-center transition-all font-black shadow-md shadow-pink-500/10"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {bobaCount >= 8 && (
                          <div className="bg-amber-950/30 border border-amber-500/20 px-3 py-2 rounded-lg text-[10px] text-amber-300 font-sans leading-relaxed flex items-center space-x-2 animate-pulse">
                            <span>⚠️ বেশি ববা চা স্বাস্থ্যের জন্য ক্ষতিকর! জয়া কিন্তু রাগ করবে!</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. CITY WEATHER RADAR APPLICATION PANEL */}
                {activeTab === "weather" && (
                  <div className="space-y-4 animate-fadeIn">
                    <div className="flex items-center justify-between border-b border-pink-500/10 pb-2">
                      <div className="flex items-center space-x-2">
                        <CloudSun className="w-4 h-4 text-pink-400" />
                        <h2 className="text-xs font-bold uppercase tracking-widest text-pink-300">India Weather Radar (আবহাওয়া স্টেশন)</h2>
                      </div>
                      <span className="text-[8px] bg-teal-500/10 text-teal-300 px-2 py-0.5 rounded border border-teal-500/20 uppercase tracking-widest">METEORIC GRAPH CORE</span>
                    </div>

                    <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                      জয়া ভারতের সকল বড় শহরগুলির তাপমাত্রা এবং জলবায়ু মেমোরিতে ট্র্যাক করে রাখে। জয়াকে "কলকাতা বা দিল্লির আবহাওয়া পরিবর্তন করো..." বলে আবহাওয়া পরখ করুন।
                    </p>

                    <div className="bg-slate-950 border border-pink-500/15 rounded-xl p-5 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
                      
                      <div className="space-y-1 text-center md:text-left">
                        <p className="text-[10px] uppercase font-bold text-teal-400 tracking-widest flex items-center justify-center md:justify-start space-x-1">
                          <CloudSun className="w-3.5 h-3.5 inline animate-pulse" />
                          <span>ভারত আবহাওয়া কেন্দ্র</span>
                        </p>
                        <h3 className="text-2xl font-black text-white tracking-widest">{weatherCity}</h3>
                        <p className="text-xs text-slate-300 font-sans">{weatherCond}</p>
                      </div>

                      <div className="text-center md:text-right">
                        <span className="text-4xl md:text-5xl font-black text-pink-400 font-sans select-none tracking-tighter">
                          {weatherTemp}°C
                        </span>
                        <span className="block text-[8px] text-slate-500 uppercase tracking-widest">LIVE DIGITAL SENSOR</span>
                      </div>
                    </div>

                    {/* Quick City Buttons */}
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <span className="text-[9px] text-slate-500 uppercase tracking-widest">শহর নির্বাচন:</span>
                      {[
                        { bn: "কলকাতা", en: "Kolkata", temp: 34, cond: "মনোরম হাওয়া ও হালকা রৌদ্রোজ্জ্বল দিন" },
                        { bn: "দিল্লি", en: "Delhi", temp: 38, cond: "উষ্ণ ও অত্যন্ত শুষ্ক আবহাওয়া" },
                        { bn: "মুম্বাই", en: "Mumbai", temp: 31, cond: "আর্দ্র এবং মনোরম সামুদ্রিক বাতাস" },
                        { bn: "বেঙ্গালুরু", en: "Bengaluru", temp: 28, cond: "চমৎকার শীতল মেঘলা আবহাওয়া" }
                      ].map((city) => (
                        <button
                          key={city.en}
                          type="button"
                          onClick={() => {
                            setWeatherCity(city.bn);
                            setWeatherTemp(city.temp);
                            setWeatherCond(city.cond);
                          }}
                          className={`text-[10px] px-3 py-1.5 rounded-lg border font-sans transition-all hover:bg-slate-800 ${
                            weatherCity === city.bn 
                              ? "bg-pink-500/10 border-pink-500/40 text-pink-300"
                              : "bg-slate-900 border-slate-800 text-slate-300"
                          }`}
                        >
                          {city.bn} ({city.temp}°C)
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4. TASK MANAGER APPLICATION PANEL */}
                {activeTab === "tasks" && (
                  <div className="space-y-4 animate-fadeIn">
                    <div className="flex items-center justify-between border-b border-pink-500/10 pb-2">
                      <div className="flex items-center space-x-2">
                        <CheckSquare className="w-4 h-4 text-pink-400" />
                        <h2 className="text-xs font-bold uppercase tracking-widest text-pink-300">Zoya Task Manager (আজকের কাজসমূহ)</h2>
                      </div>
                      <span className="text-[8px] bg-pink-500/20 text-pink-300 px-2 py-0.5 rounded border border-pink-500/10 uppercase tracking-widest font-mono">WORKSPACE STATE</span>
                    </div>

                    <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                      জয়া আপনার কাজগুলির হিসাব রাখে। কাজের আইটেমগুলিতে ক্লিক করে চেক করুন, অথবা মুখে বলে জয়াকে যুক্ত করতে বলুন!
                    </p>

                    {/* List area */}
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {tasks.length === 0 ? (
                        <p className="text-xs text-slate-500 text-center py-4 italic">কোনো কাজ বাকি নেই! আরাম করুন স্যর বা যোগ করুন নতুন কাজ।</p>
                      ) : (
                        tasks.map((task) => (
                          <div
                            key={task.id}
                            onClick={() => {
                              setTasks(prev => prev.map(t => t.id === task.id ? { ...t, done: !t.done } : t));
                            }}
                            className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer select-none transition-all duration-300 ${
                              task.done
                                ? "bg-pink-950/10 border-pink-500/20 text-slate-500 line-through"
                                : "bg-slate-950 border-slate-800 text-pink-100 hover:border-pink-500/35"
                            }`}
                          >
                            <div className="flex items-center space-x-3 font-sans text-xs">
                              <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                                task.done ? "bg-pink-500 border-pink-500 text-black" : "border-pink-500/40"
                              }`}>
                                {task.done && <Check className="w-3 h-3 stroke-[3]" />}
                              </span>
                              <span>{task.text}</span>
                            </div>
                            
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTasks(prev => prev.filter(t => t.id !== task.id));
                              }}
                              className="text-slate-600 hover:text-red-400 p-1 rounded-md transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Add Item form */}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!customTaskInput.trim()) return;
                        setTasks(prev => [...prev, { id: "t_" + Math.random().toString(36).substring(2,6), text: customTaskInput.trim(), done: false }]);
                        setCustomTaskInput("");
                      }}
                      className="flex space-x-2"
                    >
                      <input
                        type="text"
                        value={customTaskInput}
                        onChange={(e) => setCustomTaskInput(e.target.value)}
                        placeholder="নতুন একটি কাজের ডেসক্রিপশন বা টাস্ক এখানে লিখুন স্যর..."
                        className="flex-1 bg-slate-950 text-xs border border-slate-800 focus:border-pink-500/50 p-2.5 rounded-xl outline-none font-sans text-white transition-all"
                      />
                      <button
                        type="submit"
                        className="bg-pink-500 text-black hover:bg-pink-400 text-xs px-4 py-1.5 rounded-xl font-bold transition-all"
                      >
                        যুক্ত করুন
                      </button>
                    </form>
                  </div>
                )}

                {/* 5. DIAGNOSTICS & TELEMETRY TERMINAL CONSOLE */}
                {activeTab === "console" && (
                  <div className="space-y-4 animate-fadeIn font-mono">
                    <div className="flex items-center justify-between border-b border-pink-500/10 pb-2">
                      <div className="flex items-center space-x-2">
                        <Terminal className="w-4 h-4 text-pink-400 animate-pulse" />
                        <h2 className="text-xs font-bold uppercase tracking-widest text-pink-300">Zoya AI Telemetry Engine (সার্ভার লগ)</h2>
                      </div>
                      <span className="text-[8px] bg-red-500/10 text-red-300 px-2 py-0.5 rounded border border-red-500/20 uppercase tracking-widest">CYBER TELEMETRY FEED</span>
                    </div>

                    <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                      এটি জয়া সিস্টেমের লাইভ কোয়ান্টাম ইভেন্ট ডায়াগনস্টিকস। সার্ভার ও ব্রাউজারের মধ্যকার কমিউনিকেশনের লাইভ স্ট্রিম নিচে প্রদর্শিত হচ্ছে:
                    </p>

                    <div className="bg-black/90 rounded-xl p-4 border border-rose-950 flex flex-col h-48 justify-between shadow-2xl overflow-y-auto text-[10px] leading-relaxed select-text font-mono space-y-1 text-slate-300">
                      {logs.length === 0 ? (
                        <p className="text-slate-600 italic">No events recorded. Waiting for vocal interface startup...</p>
                      ) : (
                        logs.map((log) => {
                          let color = "text-slate-400";
                          if (log.type === "toolCall") color = "text-amber-400 font-bold";
                          if (log.type === "toolResponse") color = "text-cyan-400";
                          if (log.type === "error") color = "text-red-400";
                          if (log.type === "status") color = "text-pink-400";
                          if (log.type === "interrupted") color = "text-purple-400 animate-pulse";

                          return (
                            <div key={log.id} className="border-b border-slate-900/40 pb-1">
                              <span className="text-[8px] text-slate-600 block">[ {new Date(log.timestamp).toLocaleTimeString()} ]</span>
                              <span className={color}>&gt; {log.text}</span>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div className="flex justify-end p-1">
                      <button
                        type="button"
                        onClick={() => setLogs([])}
                        className="text-[9px] text-slate-500 hover:text-white flex items-center space-x-1 border border-slate-900 hover:border-slate-800 bg-slate-900 px-3 py-1.5 rounded"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>CLEAR LOGS</span>
                      </button>
                    </div>
                  </div>
                )}

              </div>

              {/* Memory values indicator footer inside Zoya Workspace OS layout */}
              <div className="mt-6 pt-3 border-t border-pink-500/10 bg-[#07071c]/30 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 text-[9px] text-slate-400">
                <div className="flex items-center space-x-2">
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-ping" />
                  <span className="uppercase tracking-widest text-slate-500">Live Workspace Status:</span>
                  <span className="text-white font-bold">{activeTab.toUpperCase()} ACTIVE</span>
                </div>
                
                <div className="flex gap-4">
                  <span>BOBA LEVEL: <strong className="text-pink-300">{bobaCount} CUPS</strong></span>
                  <span>TASKS REGISTERED: <strong className="text-pink-300">{tasks.length} ITEMS</strong></span>
                  <span>WEATHER REF: <strong className="text-teal-300">{weatherCity} ({weatherTemp}°C)</strong></span>
                </div>
              </div>

            </div>
          </section>
        )}

      </main>

      {/* COMPACT STUNNING CORE SYSTEM FOOTER */}
      <footer className="w-full bg-[#050515]/60 border-t border-pink-500/10 py-3.5 px-6 z-30 flex flex-col md:flex-row items-center justify-between text-[8px] text-slate-500 tracking-wider">
        <p className="uppercase">AUDIO COMPRESSION FORMAT: PCM16 16000HZ BUFFER // DECRYPTION ACTIVE</p>
        <p className="uppercase mt-1 md:mt-0 font-bold text-pink-500/40">ZOYA BENGALI AI &copy; MULTI-STREAM INTERACTIVE WORKSPACE</p>
      </footer>
    </div>
  );
}

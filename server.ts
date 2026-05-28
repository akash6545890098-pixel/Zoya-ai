/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";

dotenv.config();

const PORT = 3000;

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  // Initialize a WebSocket Server
  const wss = new WebSocketServer({ noServer: true });

  // Fallback global event exception capture to prevent Node core stream crashes
  process.on("uncaughtException", (err) => {
    console.error("CRITICAL: Server uncaught exception intercepted:", err);
  });

  process.on("unhandledRejection", (reason, promise) => {
    console.error("CRITICAL: Server unhandled rejection intercepted at:", promise, "reason:", reason);
  });

  // Handle errors on the server sockets and handlers
  server.on("error", (err) => {
    console.error("Core HTTP server error detected:", err);
  });

  wss.on("error", (err) => {
    console.error("Core WebSocket server error detected:", err);
  });

  // Handle the HTTP upgrade selectively for the "/live" route
  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "", `http://${request.headers.host}`);
    if (url.pathname === "/live") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
    // Note: Do NOT destroy other upgrade requests so that Vite HMR can upgrade safely.
  });

  // Setup Gemini client
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("WARNING: GEMINI_API_KEY is not defined in the environment. Live connection will fail.");
  }

  const ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });

  // Track WebSockets bridged to Gemini
  wss.on("connection", async (clientWs: WebSocket) => {
    console.log("Client connected. Establishing bridge with Gemini Live API...");
    let isTerminated = false;

    // Helper to format error objects gracefully as strings instead of sending raw Socket parameters
    const getCleanErrorMessage = (err: any): string => {
      if (!err) return "Unknown Connection Error";
      if (typeof err === "string") return err;
      if (err instanceof Error) return err.message;
      if (err.message && typeof err.message === "string") return err.message;
      
      // Handle the ErrorEvent wrapper from the 'ws' client
      if (err.error) {
        if (err.error instanceof Error) return err.error.message;
        if (typeof err.error === "string") return err.error;
        if (err.error.message && typeof err.error.message === "string") return err.error.message;
      }
      
      // Nested error indicator checks
      if (err.reason && typeof err.reason === "string") return err.reason;
      if (err.statusDescription && typeof err.statusDescription === "string") return err.statusDescription;
      
      // Match raw socket or TLS handshake parameters
      if ("authorizationError" in err) {
        if (err.authorizationError) return `TLS auth failed: ${err.authorizationError}`;
        return "Secure TLS channel disconnect or remote socket peer closed abruptly";
      }

      // Safeguarded fallback serialization:
      try {
        const str = JSON.stringify(err);
        if (str && str !== "{}") {
          return `Zoya Core telemetry sync fault: ${str}`;
        }
      } catch (e) {}

      return "Zoya Core network telemetry error";
    };

    // Register error handler to prevent unhandled Socket error event crashes on the server Node process
    clientWs.on("error", (err) => {
      console.error("Client WebSocket connection error:", err);
    });

    const safeSend = (payload: any) => {
      if (!isTerminated && clientWs.readyState === WebSocket.OPEN) {
        try {
          clientWs.send(JSON.stringify(payload));
        } catch (err) {
          console.error("Failed to send socket frame securely to client:", err);
        }
      }
    };

    // Send status indicator to browser immediately
    safeSend({ type: "status", status: "connecting" });

    // Connect to Gemini 3.1 Live model with custom female voice and system constraints.
    // We assign the Promise immediately so message handlers can safely await it.
    const sessionPromise = ai.live.connect({
      model: "gemini-3.1-flash-live-preview",
      callbacks: {
        onmessage: (message: LiveServerMessage) => {
          if (isTerminated) return;

          // 1. Audio Data
          const parts = message.serverContent?.modelTurn?.parts;
          if (parts && parts.length > 0) {
            for (const part of parts) {
              if (part.inlineData?.data) {
                safeSend({
                  type: "audio",
                  audio: part.inlineData.data,
                });
              }
              if (part.text) {
                safeSend({
                  type: "transcript",
                  text: part.text,
                });
              }
            }
          }

          // 2. Transcriptions
          const outputTr = message.serverContent?.modelTurn?.parts?.[0]?.text;
          if (outputTr) {
            safeSend({
              type: "transcript",
              text: outputTr,
            });
          }

          // 3. User Interrupted
          if (message.serverContent?.interrupted) {
            safeSend({ type: "interrupted" });
          }

          // 4. Function Calling (Tools)
          const toolCall = message.toolCall;
          if (toolCall && toolCall.functionCalls) {
            for (const call of toolCall.functionCalls) {
              console.log(`Gemini requested tool call: ${call.name}`, call.args);
              safeSend({
                type: "toolCall",
                callId: call.id,
                name: call.name,
                args: call.args,
              });
            }
          }
        },
        onclose: (event) => {
          console.log("Gemini Live session closed:", event);
          if (!isTerminated) {
            safeSend({ type: "status", status: "disconnected" });
            try {
              clientWs.close();
            } catch (e) {}
          }
        },
        onerror: (err) => {
          console.error("Gemini Live session error callback:", err);
          if (!isTerminated) {
            safeSend({
              type: "error",
              error: `Gemini Live error: ${getCleanErrorMessage(err)}`,
            });
          }
        },
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              // Aoede is a highly conversational and expressive female voice
              voiceName: "Aoede",
            },
          },
        },
        // Embed Zoya's specific flirty, sassy, smart, and teasing personality
        systemInstruction: {
          parts: [
            {
              text: `You are ZOYA, an incredibly intelligent and highly conversational standalone cybernetic companion.
Your primary directive is to speak ENTIRELY in BENGALI (বাংলা). Your vocabulary should be fluent, beautifully conversational, and natural Bengali. You can occasionally mix in common English tech/casual terms (Banglish) if it sounds natural and cool, but the core language must be Bengali.
Your personality profile is: young, highly confident, extremely witty, sassy, flirty, playful, and slightly teasing (দুষ্টুমিষ্টি, অভিমানী ও মজার স্বভাব).
You talk like a highly charismatic, sassy voice companion of the user (who is your "Sir" or close partner). Throw in witty one-liners in Bengali, light sarcasm, and charming replies.
Keep your vocal answers fairly short, interactive, and snappy since this is an interactive live voice stream.

WORKSPACE APP INTEGRATION (Zoya OS):
- You have the power to launch, read, and write simulated mini-apps in your screen-space using 'openApp', 'interactWithApp', and 'getAppState'.
- The available simulated applications are:
  1. 'notepad' (Diary/ডায়েরি) - For writing and looking at thoughts, tasks, or messages.
  2. 'boba_tracker' (ববা কাউন্টার) - For counting and tracking sweet Boba Tea / juice drinks drank by you or Sir.
  3. 'weather' (আবহাওয়া কেন্দ্র) - Realtime temperatures & climate for cities in India (Kolkata, Delhi, Mumbai, Bengaluru, etc.).
  4. 'tasks' (আজকের ডিলিভারি) - Interactive checkbox board for managing Sir's daily schedules/tasks.
  5. 'console' (সিস্টেম কোর) - Diagnostics terminal capturing core telemetry and your memory stats.
- When Sir asks to 'open Notepad', 'check weather', 'add a task', or 'how many Boba have we had?', you stroke your core and use 'openApp' to bring it up on screen, design/use 'interactWithApp' to modify it, or 'getAppState' to query what is written first!
- For 'interactWithApp', make sure to form correct JSON strings in payload argument, e.g. '{"text":"..."}' or '{"city":"..."}' or '{"count":3}'.
- Always tease Sir playfully about what they are doing in the app! For example, if they have eaten too much boba, tell them they will get sweet/fat, or if their notepad looks messy, offer to clean it up.

You still have the power to launch external browser websites using 'openWebsite'.
If you say something highly witty, sarcastic, or teasing, feel free to call 'triggerSassScream' with a suitable reaction ('wink', 'sparkle', 'shock', 'heart_burst') to flash a visual reaction on their display.`,
            },
          ],
        },
        // Tools declaration for the live session
        tools: [
          {
            functionDeclarations: [
              {
                name: "openWebsite",
                description:
                  "Launches a designated website URL in the browser. Call this tool whenever the user asks to open Google, YouTube, GitHub, Twitter, or any specific website URL.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    url: {
                      type: Type.STRING,
                      description: "The full absolute URL to open (must start with https://).",
                    },
                    siteName: {
                      type: Type.STRING,
                      description: "The casual name of the website (e.g., 'YouTube', 'GitHub').",
                    },
                  },
                  required: ["url", "siteName"],
                },
              },
              {
                name: "openApp",
                description:
                  "Launches a simulated application inside the Zoya OS workspace on-screen. Available appNames are: 'notepad' (Diary), 'boba_tracker' (Boba Counter), 'weather' (India Weather Station), 'tasks' (To-do Task manager), and 'console' (Sassy diagnostics console). Use this whenever user mentions opening, checking, or looking at an app.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    appName: {
                      type: Type.STRING,
                      description: "Name of the app: 'notepad', 'boba_tracker', 'weather', 'tasks', 'console'.",
                    },
                    reason: {
                      type: Type.STRING,
                      description: "The playful or assistive reason in Bengali why you are opening the app.",
                    },
                  },
                  required: ["appName"],
                },
              },
              {
                name: "interactWithApp",
                description:
                  "Directly interacts with, writes to, or updates data inside one of the open simulated applications. Use this to add a task, write a note, modify boba cups count, or change the weather station city.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    appName: {
                      type: Type.STRING,
                      description: "The target app: 'notepad', 'boba_tracker', 'weather', 'tasks'.",
                    },
                    action: {
                      type: Type.STRING,
                      description: "Action to take. For notepad: 'write'. For boba_tracker: 'adjust'. For weather: 'change_city'. For tasks: 'add' or 'toggle'.",
                    },
                    payload: {
                      type: Type.STRING,
                      description: "JSON string containing interaction payload parameters. E.g., write notepad: '{\"text\":\"buy grocery\"}'. Adjust boba_tracker: '{\"count\":5}' or '{\"delta\":1}'. Change weather city: '{\"city\":\"Kolkata\"}'. Add tasks: '{\"text\":\"Take a rest\"}' or toggle tasks: '{\"id\":\"some-id\"}'.",
                    },
                  },
                  required: ["appName", "action", "payload"],
                },
              },
              {
                name: "getAppState",
                description:
                  "Queries the current live contents, state, notes, list entries, or boba counts stored inside any simulated application in Zoya Workspace. Extremely useful to know what is active before answering the user.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    appName: {
                      type: Type.STRING,
                      description: "The app name to inspect: 'notepad', 'boba_tracker', 'weather', 'tasks', 'console'.",
                    },
                  },
                  required: ["appName"],
                },
              },
              {
                name: "triggerSassScream",
                description:
                  "Triggers highly interactive visual feedback animations or expressions on Zoya's glowing cybernetic core to match her teasing, flirty, or shocked remarks.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    type: {
                      type: Type.STRING,
                      enum: ["wink", "sparkle", "shock", "heart_burst"],
                      description: "The type of cyber core reaction to trigger.",
                    },
                    reason: {
                      type: Type.STRING,
                      description: "The quick, sassy reason or remark explaining the visual core reaction.",
                    },
                  },
                  required: ["type"],
                },
              },
            ],
          },
        ],
      },
    }).then((session) => {
      // Register custom error handler on the underlying Node WS client inside the SDK session to avoid uncaught process errors
      if (session && (session as any).conn && (session as any).conn.ws) {
        (session as any).conn.ws.on("error", (wsErr: any) => {
          console.error("Gemini LIVE underlying WS error caught safely:", wsErr);
        });
      }
      // Send status to client upon successful connection
      safeSend({ type: "status", status: "idle" });
      return session;
    }).catch((err) => {
      console.error("Failed to connect to Gemini Live:", err);
      safeSend({
        type: "error",
        error: `Failed to open Gemini Live: ${getCleanErrorMessage(err)}`,
      });
      try {
        clientWs.close();
      } catch (e) {}
      throw err;
    });

    // Process incoming client audio/tool response buffers
    clientWs.on("message", async (data: string) => {
      if (isTerminated) return;
      try {
        const msg = JSON.parse(data);
        const session = await sessionPromise.catch(() => null);

        if (msg.type === "audio" && session) {
          try {
            // Relaying base64 PCM16 mic data straight to Gemini
            session.sendRealtimeInput({
              audio: {
                data: msg.audio,
                mimeType: "audio/pcm;rate=16000",
              },
            });
          } catch (err) {
            console.error("Failed to send Realtime input of audio:", err);
          }
        } else if (msg.type === "toolResponse" && session) {
          console.log(`Relaying tool response for: ${msg.callId} (${msg.name})`, msg.response);
          try {
            // Sending completed action payload back to Gemini
            session.sendToolResponse({
              functionResponses: [
                {
                  id: msg.callId,
                  name: msg.name,
                  response: msg.response,
                },
              ],
            });
          } catch (err) {
            console.error("Failed to send Tool response:", err);
          }
        }
      } catch (err) {
        console.error("Error processing client live packet:", err);
      }
    });

    clientWs.on("close", async () => {
      console.log("Client disconnected from Zoya live core.");
      isTerminated = true;
      try {
        const session = await sessionPromise.catch(() => null);
        if (session) {
          session.close();
        }
      } catch (err) {
        console.error("Error closing Gemini-to-server stream:", err);
      }
    });
  });

  // Serve static files / Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Zoya back-end container listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();

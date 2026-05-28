/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// PCM 16-bit to Base64 utility
export function pcmToBase64(float32Array: Float32Array): string {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  let offset = 0;
  for (let i = 0; i < float32Array.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    const pcmSample = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(offset, pcmSample, true); // Little endian
  }
  
  // Convert buffer to binary string
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert Base64 raw PCM16 (24kHz) to Float32Array
export function base64ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const len = binary.length;
  const buffer = new ArrayBuffer(len);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0;
  }
  return float32;
}

export class ZoyaAudioStreamer {
  private inputAudioCtx: AudioContext | null = null;
  private outputAudioCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  
  private activeSources: AudioBufferSourceNode[] = [];
  private nextStartTime = 0;
  
  // Callback functions
  private onInputAudioChunk: ((base64Pcm: string, volume: number) => void) | null = null;
  private onOutputVolumeChange: ((volume: number) => void) | null = null;

  constructor() {}

  // Get or create Input AudioContext (16000Hz)
  private getInputCtx(): AudioContext {
    if (!this.inputAudioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.inputAudioCtx = new AudioCtxClass({ sampleRate: 16000 });
    }
    if (this.inputAudioCtx.state === "suspended") {
      this.inputAudioCtx.resume();
    }
    return this.inputAudioCtx;
  }

  // Get or create Output AudioContext (24000Hz)
  private getOutputCtx(): AudioContext {
    if (!this.outputAudioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.outputAudioCtx = new AudioCtxClass({ sampleRate: 24000 });
    }
    if (this.outputAudioCtx.state === "suspended") {
      this.outputAudioCtx.resume();
    }
    return this.outputAudioCtx;
  }

  // Start recording from Microphone (downsampled to 16kHz)
  public async startRecording(
    onChunk: (base64Pcm: string, volume: number) => void
  ): Promise<void> {
    this.onInputAudioChunk = onChunk;
    const ctx = this.getInputCtx();

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.micSource = ctx.createMediaStreamSource(this.micStream);
      // ScriptProcessor is extremely robust for inline audio processing
      this.scriptProcessor = ctx.createScriptProcessor(2048, 1, 1);

      this.micSource.connect(this.scriptProcessor);
      this.scriptProcessor.connect(ctx.destination);

      this.scriptProcessor.onaudioprocess = (e) => {
        if (!this.onInputAudioChunk) return;
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Calculate Root Mean Square (RMS) volume level
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        const volume = Math.min(100, Math.round(rms * 400)); // Scaled level
        
        // Convert to PCM16 and base64
        const base64PCM = pcmToBase64(inputData);
        this.onInputAudioChunk(base64PCM, volume);
      };
    } catch (err) {
      console.error("Error accessing user microphone:", err);
      this.stopRecording();
      throw err;
    }
  }

  // Stop recording mic
  public stopRecording(): void {
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor.onaudioprocess = null;
      this.scriptProcessor = null;
    }
    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }
    this.onInputAudioChunk = null;
  }

  // Queue up and play 24kHz raw audio chunk from Gemini with accurate scheduling (sync)
  public playResponseChunk(
    base64Pcm: string,
    onVolume: (volume: number) => void
  ): void {
    this.onOutputVolumeChange = onVolume;
    const ctx = this.getOutputCtx();
    const float32Data = base64ToFloat32(base64Pcm);
    if (float32Data.length === 0) return;

    // Calculate RMS volume level of the response audio
    let sum = 0;
    for (let i = 0; i < float32Data.length; i++) {
      sum += float32Data[i] * float32Data[i];
    }
    const rms = Math.sqrt(sum / float32Data.length);
    const volume = Math.min(100, Math.round(rms * 350));
    this.onOutputVolumeChange(volume);

    // Create a 24000Hz buffer to hold Float32 PCM values
    const buffer = ctx.createBuffer(1, float32Data.length, 24000);
    buffer.copyToChannel(float32Data, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const currentTime = ctx.currentTime;
    
    // Gapless audio buffer scheduling algorithm
    if (this.nextStartTime < currentTime) {
      this.nextStartTime = currentTime + 0.03; // 30ms latency padding to avoid stutter
    }

    source.start(this.nextStartTime);
    const startTimeStamp = this.nextStartTime;
    this.nextStartTime += buffer.duration;

    this.activeSources.push(source);

    // Fade out or report volume decays when the chunk completes playing
    source.onended = () => {
      const idx = this.activeSources.indexOf(source);
      if (idx > -1) {
        this.activeSources.splice(idx, 1);
      }
      if (this.activeSources.length === 0 && this.onOutputVolumeChange) {
        this.onOutputVolumeChange(0); // Zero speaking volume when done
      }
    };
  }

  // Cancel and stop all currently playing audio sources (interruption)
  public handleInterruption(): void {
    console.log("Interruption requested. Terminating current playbacks.");
    this.activeSources.forEach((source) => {
      try {
        source.stop();
      } catch (err) {
        // Source already terminated or not started yet
      }
    });
    this.activeSources = [];
    this.nextStartTime = 0;
    if (this.onOutputVolumeChange) {
      this.onOutputVolumeChange(0);
    }
  }

  // Shut down both Input and Output streams cleanly
  public async destroy(): Promise<void> {
    this.stopRecording();
    this.handleInterruption();
    
    if (this.inputAudioCtx) {
      await this.inputAudioCtx.close();
      this.inputAudioCtx = null;
    }
    if (this.outputAudioCtx) {
      await this.outputAudioCtx.close();
      this.outputAudioCtx = null;
    }
    this.onOutputVolumeChange = null;
  }
}

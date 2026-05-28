/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from "react";
import { ConnectionState, ReactionType } from "../types";

interface ZoyaVisualizerProps {
  state: ConnectionState;
  volume: number; // 0 to 100
  reaction: ReactionType | null;
  onTapCore?: () => void;
}

export default function ZoyaVisualizer({
  state,
  volume,
  reaction,
  onTapCore,
}: ZoyaVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const phaseRef = useRef<number>(0);
  const stateRef = useRef<ConnectionState>(state);
  const volumeRef = useRef<number>(volume);
  const reactionRef = useRef<ReactionType | null>(reaction);

  // Mouse tracking context for realistic 3D parallax head movements
  const mouseRef = useRef({ x: 0, y: 0 });
  const currentRotRef = useRef({ yaw: 0, pitch: 0 });

  // Volumetric 3D Particle drift system (with depth of field)
  const ambientParticlesRef = useRef<Array<{
    x: number;
    y: number;
    z: number; // Depth scaling
    r: number;
    speedX: number;
    speedY: number;
    alpha: number;
    color: string;
    pulseSpeed: number;
    angle: number;
  }>>([]);

  // Reactive burst particles
  const particlesRef = useRef<Array<{
    x: number;
    y: number;
    z: number;
    r: number;
    vx: number;
    vy: number;
    alpha: number;
    color: string;
    type?: string;
  }>>([]);

  // Eyes Blinking State Control
  const blinkTimerRef = useRef<number>(0);
  const blinkRatioRef = useRef<number>(0); // 0 = fully open, 1 = fully closed

  // Sync refs to avoid stale closures inside the high-performance animation loop
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    reactionRef.current = reaction;
  }, [reaction]);

  // Track global pointer/mouse movements to align her gaze & face angles
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      
      // Calculate normalized coords (-1.0 to 1.0)
      const dx = (e.clientX - cx) / cx;
      const dy = (e.clientY - cy) / cy;
      
      mouseRef.current = {
        x: Math.max(-1, Math.min(1, dx)),
        y: Math.max(-1, Math.min(1, dy)),
      };
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches && e.touches[0]) {
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const dx = (e.touches[0].clientX - cx) / cx;
        const dy = (e.touches[0].clientY - cy) / cy;
        mouseRef.current = {
          x: Math.max(-1, Math.min(1, dx)),
          y: Math.max(-1, Math.min(1, dy)),
        };
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove);
    };
  }, []);

  // Reactive expressions particles
  useEffect(() => {
    if (!reaction) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cx = canvas.width / (2 * (window.devicePixelRatio || 1));
    const cy = canvas.height / (2 * (window.devicePixelRatio || 1)) - 10;

    const colors: { [key in ReactionType]: string[] } = {
      wink: ["#fef08a", "#fbbf24", "#fef3c7"],
      sparkle: ["#fbbf24", "#ffffff", "#fed7aa", "#fcd34d"],
      shock: ["#fbbf24", "#f43f5e", "#ffffff"],
      heart_burst: ["#f43f5e", "#fda4af", "#ff007f", "#ffe4e6"],
    };

    const reactionColors = colors[reaction];
    const particleCount = reaction === "shock" || reaction === "heart_burst" ? 45 : 20;

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 5.5;
      particlesRef.current.push({
        x: cx + (Math.random() - 0.5) * 50,
        y: cy + (Math.random() - 0.5) * 30,
        z: Math.random() * 1.5 + 0.5,
        r: Math.random() * 2.5 + 1.2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        alpha: 1.0,
        color: reactionColors[Math.floor(Math.random() * reactionColors.length)],
        type: reaction === "heart_burst" ? "heart" : "sparkle",
      });
    }
  }, [reaction]);

  // Handle ambient particle spawning (infinite 3D depth system)
  const syncAmbientParticles = (cx: number, cy: number) => {
    const list = ambientParticlesRef.current;
    if (list.length >= 25) return;

    const colors = ["rgba(254, 215, 170, 0.45)", "rgba(251, 113, 133, 0.35)", "rgba(255, 255, 255, 0.4)"];
    for (let i = list.length; i < 25; i++) {
      list.push({
        x: (Math.random() - 0.5) * 400 + cx,
        y: (Math.random() - 0.5) * 400 + cy,
        z: Math.random() * 2.5 + 0.6, // depth: higher z means further away
        r: Math.random() * 3 + 1,
        speedX: (Math.random() - 0.5) * 0.45,
        speedY: -0.2 - Math.random() * 0.5, // drift slowly upwards
        alpha: 0.2 + Math.random() * 0.6,
        color: colors[Math.floor(Math.random() * colors.length)],
        pulseSpeed: 0.01 + Math.random() * 0.02,
        angle: Math.random() * Math.PI * 2,
      });
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    const resize = () => {
      const parent = canvas.parentElement;
      const sizeVal = parent ? parent.offsetWidth : 380;
      const dpr = window.devicePixelRatio || 1;
      
      canvas.width = sizeVal * dpr;
      canvas.height = sizeVal * dpr;
      canvas.style.width = `${sizeVal}px`;
      canvas.style.height = `${sizeVal}px`;
      
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;
      
      const cx = width / 2;
      const cy = height / 2;

      ctx.clearRect(0, 0, width, height);

      phaseRef.current += 0.035;
      const phase = phaseRef.current;
      const state = stateRef.current;
      const volumeVal = volumeRef.current;
      const activeReaction = reactionRef.current;

      // Update pointer 3D parallax angles (slewed with inertia)
      const targetYaw = mouseRef.current.x * 0.18; // cap horizontal head turn range
      const targetPitch = mouseRef.current.y * 0.12; // cap vertical head turn range
      
      currentRotRef.current.yaw += (targetYaw - currentRotRef.current.yaw) * 0.08;
      currentRotRef.current.pitch += (targetPitch - currentRotRef.current.pitch) * 0.08;

      const yaw = currentRotRef.current.yaw;
      const pitch = currentRotRef.current.pitch;

      // Eye blinking calculation
      blinkTimerRef.current += 1;
      if (blinkTimerRef.current > 160) {
        const blinkProgress = blinkTimerRef.current - 160;
        if (blinkProgress <= 4) {
          blinkRatioRef.current = blinkProgress / 4; 
        } else if (blinkProgress <= 8) {
          blinkRatioRef.current = 1 - (blinkProgress - 4) / 4; 
        } else {
          blinkRatioRef.current = 0;
          blinkTimerRef.current = Math.floor(Math.random() * 50); 
        }
      }

      const isListening = state === "listening";
      const isSpeaking = state === "speaking";
      const breatheShiftY = Math.sin(phase * 1.0) * 2.8;
      const headTiltAngle = Math.sin(phase * 0.65) * 0.015 + (isListening ? 0.025 : 0) + yaw * 0.08;

      // Setup ambient particles database
      syncAmbientParticles(cx, cy);

      // --- 1. RENDER 3D DEPTH PARTICLES (Far Background) ---
      const sortedAmbients = ambientParticlesRef.current;
      sortedAmbients.forEach((p) => {
        p.x += p.speedX;
        p.y += p.speedY;
        p.angle += p.pulseSpeed;
        
        // Wrap edges gracefully
        if (p.y < cy - 200) {
          p.y = cy + 200;
          p.x = (Math.random() - 0.5) * 360 + cx;
        }
        if (p.x < cx - 200 || p.x > cx + 200) {
          p.speedX = -p.speedX;
        }

        const currentAlpha = p.alpha * (0.3 + Math.abs(Math.sin(p.angle)) * 0.7);
        const zScale = 1 / p.z; // depth multiplication (further away looks smaller/dimmer)
        
        ctx.save();
        ctx.fillStyle = p.color;
        
        // Draw with 3D depth of field blur effect
        ctx.globalAlpha = currentAlpha * zScale;
        if (p.z > 2.0) {
          ctx.filter = `blur(${Math.min(5, (p.z - 1.5) * 2.5)}px)`;
        }
        
        ctx.beginPath();
        // Shift position relative to global camera parallax
        const px = p.x - yaw * 11 * zScale;
        const py = p.y - pitch * 7 * zScale;
        ctx.arc(px, py, p.r * zScale * 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // --- 2. AMBIENT BACKGROUND GLOW ---
      ctx.save();
      const glowGrad = ctx.createRadialGradient(cx, cy - 15, 10, cx, cy - 15, 180);
      if (state === "speaking") {
        glowGrad.addColorStop(0, "rgba(254, 215, 170, 0.22)");
        glowGrad.addColorStop(0.4, "rgba(251, 113, 133, 0.09)");
        glowGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
      } else if (state === "listening") {
        glowGrad.addColorStop(0, "rgba(254, 215, 170, 0.18)");
        glowGrad.addColorStop(0.5, "rgba(251, 113, 133, 0.06)");
        glowGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
      } else {
        glowGrad.addColorStop(0, "rgba(254, 215, 170, 0.12)");
        glowGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
      }
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(cx, cy - 15, 180, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // --- Volumetric Lighting Helper ---
      const drawVolumetricArc = (
        sx: number,
        sy: number,
        r: number,
        baseColor: string,
        lightDirectionX = -0.3,
        lightDirectionY = -0.4
      ) => {
        // Base structure
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = baseColor;
        ctx.fill();

        // 3D Soft Ambient Occlusion and Specular highlights
        const radGrad = ctx.createRadialGradient(
          sx + r * lightDirectionX,
          sy + r * lightDirectionY,
          r * 0.05,
          sx,
          sy,
          r
        );
        radGrad.addColorStop(0, "rgba(255, 255, 255, 0.48)");
        radGrad.addColorStop(0.2, "rgba(255, 255, 255, 0.12)");
        radGrad.addColorStop(0.65, "rgba(0, 0, 0, 0)");
        radGrad.addColorStop(1, "rgba(0, 0, 0, 0.42)"); // shadow cast
        
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = radGrad;
        ctx.fill();
      };

      // Transform coordinate system with 3D perspective tracking
      ctx.save();
      // Apply base 3D camera pan, idle sway and bounce
      ctx.translate(cx + yaw * 14, cy - 10 + breatheShiftY + pitch * 10);
      ctx.rotate(headTiltAngle);

      // --- COLOR PALETTE (Realistic rendering textures) ---
      const bunnyYellow = "#fed868";
      const fabricShadow = "#d9ab2b";
      const hairBrownDark = "#3a1f10";
      const hairBrownLight = "#654128";
      const beautifulSkin = "#fdf2ea";
      const cuteBlush = "rgba(251, 113, 133, 0.55)";

      // --- 3. BACK BUNNY HOOD OUTER CAP & SHADOWED SWAYING EARS ---
      // Draw Left Ear (3D Pan & Sway)
      ctx.save();
      ctx.translate(-38 + yaw * 5, -58 + pitch * 4);
      // Extra spring movement from speaking/vibrations
      ctx.rotate(-0.38 + Math.sin(phase * 0.6) * 0.02 + yaw * 0.12 + (volumeVal * 0.003));
      
      // Outer shadow of Left Ear
      ctx.fillStyle = "rgba(0,0,0,0.1)";
      ctx.beginPath();
      ctx.moveTo(-16, 12);
      ctx.quadraticCurveTo(-40, -46, -44, -90);
      ctx.quadraticCurveTo(-46, -108, -26, -112);
      ctx.quadraticCurveTo(-8, -108, -3, -90);
      ctx.quadraticCurveTo(2, -46, 14, 12);
      ctx.closePath();
      ctx.fill();

      // Outer Ear Volumetric Render
      const leftEarGrad = ctx.createLinearGradient(-30, -90, 10, 10);
      leftEarGrad.addColorStop(0, bunnyYellow);
      leftEarGrad.addColorStop(0.4, "#fedc7e");
      leftEarGrad.addColorStop(1, fabricShadow);
      ctx.fillStyle = leftEarGrad;
      ctx.beginPath();
      ctx.moveTo(-15, 10);
      ctx.quadraticCurveTo(-38, -48, -42, -92);
      ctx.quadraticCurveTo(-44, -108, -26, -112);
      ctx.quadraticCurveTo(-10, -110, -5, -92);
      ctx.quadraticCurveTo(0, -48, 12, 10);
      ctx.closePath();
      ctx.fill();

      // Inner Ear (Lovely curved pink 3D shaded)
      const leftInnerEarGrad = ctx.createLinearGradient(-25, -60, 5, 5);
      leftInnerEarGrad.addColorStop(0, "#fda4af");
      leftInnerEarGrad.addColorStop(1, "#f43f5e");
      ctx.fillStyle = leftInnerEarGrad;
      ctx.beginPath();
      ctx.moveTo(-10, 8);
      ctx.quadraticCurveTo(-28, -40, -32, -84);
      ctx.quadraticCurveTo(-34, -98, -22, -101);
      ctx.quadraticCurveTo(-11, -99, -8, -84);
      ctx.quadraticCurveTo(-3, -40, 6, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Draw Right Ear (3D alert flexible look)
      ctx.save();
      ctx.translate(38 + yaw * 5, -58 + pitch * 4);
      ctx.rotate(0.32 + Math.sin(phase * 0.52) * 0.018 - yaw * 0.12 + (volumeVal * 0.003));
      
      // Shadow
      ctx.fillStyle = "rgba(0,0,0,0.1)";
      ctx.beginPath();
      ctx.moveTo(-13, 12);
      ctx.quadraticCurveTo(-1, -46, 4, -90);
      ctx.quadraticCurveTo(8, -108, 28, -108);
      ctx.quadraticCurveTo(42, -104, 38, -86);
      ctx.quadraticCurveTo(17, -42, 17, 12);
      ctx.closePath();
      ctx.fill();

      // Volumetric Body
      const rightEarGrad = ctx.createLinearGradient(-10, -90, 30, 10);
      rightEarGrad.addColorStop(0, bunnyYellow);
      rightEarGrad.addColorStop(0.4, "#fedc7e");
      rightEarGrad.addColorStop(1, fabricShadow);
      ctx.fillStyle = rightEarGrad;
      ctx.beginPath();
      ctx.moveTo(-12, 10);
      ctx.quadraticCurveTo(0, -48, 5, -92);
      ctx.quadraticCurveTo(10, -108, 28, -108);
      ctx.quadraticCurveTo(42, -104, 38, -88);
      ctx.quadraticCurveTo(15, -44, 15, 10);
      ctx.closePath();
      ctx.fill();

      // Inner Ear (Pink)
      const rightInnerEarGrad = ctx.createLinearGradient(-5, -60, 25, 5);
      rightInnerEarGrad.addColorStop(0, "#fda4af");
      rightInnerEarGrad.addColorStop(1, "#f43f5e");
      ctx.fillStyle = rightInnerEarGrad;
      ctx.beginPath();
      ctx.moveTo(-6, 8);
      ctx.quadraticCurveTo(5, -40, 8, -84);
      ctx.quadraticCurveTo(12, -98, 24, -98);
      ctx.quadraticCurveTo(32, -94, 28, -84);
      ctx.quadraticCurveTo(11, -40, 9, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Giant outer yellow hood dome
      drawVolumetricArc(0, -25, 63, bunnyYellow, -0.3 + yaw * 0.4, -0.4 + pitch * 0.4);

      // --- 4. BACK HAIR UNDER THE HOOD ---
      ctx.fillStyle = hairBrownDark;
      ctx.beginPath();
      ctx.ellipse(-48 + yaw * 10, 48 + pitch * 8, 24, 60, 0.15, 0, Math.PI * 2);
      ctx.ellipse(48 + yaw * 10, 48 + pitch * 8, 24, 60, -0.15, 0, Math.PI * 2);
      ctx.fill();

      // --- 5. BACKGROUND JACKET & ARM SLEEVES ---
      // Volumetric shaded torso/jacket base
      const jacketGrad = ctx.createRadialGradient(-20, 100, 10, 0, 110, 90);
      jacketGrad.addColorStop(0, "#ffea8c");
      jacketGrad.addColorStop(0.5, bunnyYellow);
      jacketGrad.addColorStop(1, fabricShadow);
      ctx.fillStyle = jacketGrad;
      ctx.beginPath();
      ctx.moveTo(-76, 130);
      ctx.quadraticCurveTo(-52, 85, -20, 80);
      ctx.lineTo(20, 80);
      ctx.quadraticCurveTo(52, 85, 76, 130);
      ctx.lineTo(-76, 130);
      ctx.fill();

      // Highlight sleeve fold shading (pseudo 3D)
      const leftSleeveGrad = ctx.createLinearGradient(-50, 100, -20, 100);
      leftSleeveGrad.addColorStop(0, bunnyYellow);
      leftSleeveGrad.addColorStop(0.7, "#ffe787");
      leftSleeveGrad.addColorStop(1, fabricShadow);
      
      const rightSleeveGrad = ctx.createLinearGradient(20, 100, 50, 100);
      rightSleeveGrad.addColorStop(0, fabricShadow);
      rightSleeveGrad.addColorStop(0.3, "#ffe787");
      rightSleeveGrad.addColorStop(1, bunnyYellow);

      ctx.save();
      ctx.fillStyle = leftSleeveGrad;
      ctx.beginPath();
      ctx.ellipse(-38, 102, 18, 28, 0.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = rightSleeveGrad;
      ctx.beginPath();
      ctx.ellipse(38, 102, 18, 28, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // --- 6. DETAILED DYNAMIC GLOSSY THERMAL CUP & BOBA STRAW ---
      // 3D Metallic Thermal tumbler held cozy in front
      const cupX = 0 + yaw * 15;
      const cupY = 101 + pitch * 12;
      const cupW = 34;
      const cupH = 50;

      ctx.save();
      // Realistic shadow under the cup onto her belly
      ctx.fillStyle = "rgba(0, 0, 0, 0.16)";
      ctx.beginPath();
      ctx.ellipse(cupX, cupY + cupH/2, 22, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Silver metal/blue gradient cup body (extremely ultra realistic glass/metal highlights)
      const cupGrad = ctx.createLinearGradient(cupX - cupW/2, cupY, cupX + cupW/2, cupY);
      cupGrad.addColorStop(0, "#7394aa");
      cupGrad.addColorStop(0.2, "#aed0e5");
      cupGrad.addColorStop(0.48, "#ffffff"); // Specular mirror highlight
      cupGrad.addColorStop(0.55, "#e3effa");
      cupGrad.addColorStop(0.85, "#8daec4");
      cupGrad.addColorStop(1, "#5b7d92");
      ctx.fillStyle = cupGrad;
      
      // Beautiful rounded bottom cyber can shape
      ctx.beginPath();
      ctx.moveTo(cupX - cupW/2, cupY - cupH/2);
      ctx.lineTo(cupX + cupW/2, cupY - cupH/2);
      ctx.lineTo(cupX + cupW/2 - 2, cupY + cupH/2 - 4);
      ctx.quadraticCurveTo(cupX, cupY + cupH/2 + 3, cupX - cupW/2 + 2, cupY + cupH/2 - 4);
      ctx.closePath();
      ctx.fill();

      // Glowing metallic rings/ribs
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      // Top lip
      ctx.moveTo(cupX - cupW/2 + 0.5, cupY - cupH/2 + 4);
      ctx.lineTo(cupX + cupW/2 - 0.5, cupY - cupH/2 + 4);
      
      // Secondary stripe
      ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      ctx.moveTo(cupX - cupW/2 + 1.5, cupY - cupH/2 + 12);
      ctx.lineTo(cupX + cupW/2 - 1.5, cupY - cupH/2 + 12);
      ctx.stroke();

      // --- Cute Translucent Glowing Boba Straw! ---
      ctx.shadowColor = "#f43f5e";
      ctx.shadowBlur = 8;
      ctx.strokeStyle = "rgba(244, 63, 94, 0.85)"; // glowing strawberry pink straw
      ctx.lineWidth = 4.2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cupX, cupY - cupH/2 + 2);
      // Straw bends slightly towards her mouth (3D depth)
      ctx.quadraticCurveTo(cupX - 4, cupY - cupH/2 - 12, cupX - 8, cupY - cupH/2 - 20);
      ctx.stroke();
      ctx.restore(); // Clear neon glow specs

      // --- Steam Vapor particles rising elegantly from the warm cup ---
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.filter = "blur(4px)";
      for (let i = 0; i < 3; i++) {
        const vxOff = Math.sin(phase * 1.5 + i * 2) * 5;
        const vyOff = -i * 12 - (phase * 6) % 15;
        ctx.beginPath();
        // Warm steam circles rising and vanishing
        ctx.arc(cupX - 5 + vxOff, cupY - cupH/2 - 6 + vyOff, 4 + i * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // --- 7. DETAILED CHUBBY SHADED COZY HANDS WRAPPED IN 3D ---
      ctx.fillStyle = beautifulSkin;
      ctx.strokeStyle = "#cb9f84";
      ctx.lineWidth = 1;

      // Draw left hand with volumetric 3D shadows on fingers
      const drawCozyHand = (hx: number, hy: number, scaleX: number) => {
        ctx.save();
        ctx.translate(hx, hy);
        ctx.scale(scaleX, 1);

        const handShadowGrad = ctx.createRadialGradient(-3, 0, 2, 0, 0, 10);
        handShadowGrad.addColorStop(0, beautifulSkin);
        handShadowGrad.addColorStop(1, "#f2ded2");

        ctx.fillStyle = handShadowGrad;
        // Finger loops
        ctx.beginPath();
        ctx.ellipse(-1, 0, 7, 5, 0.25, 0, Math.PI * 2);
        ctx.ellipse(-3, -6, 6.2, 4, 0.15, 0, Math.PI * 2);
        ctx.ellipse(0, 6, 5.8, 4.8, 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      };

      drawCozyHand(-20 + yaw * 12, 103 + pitch * 10, 1);  // Left
      drawCozyHand(20 + yaw * 12, 103 + pitch * 10, -1); // Right (mirrored)

      // --- 8. REALISTIC COZY WOOL / FLUFF TRIM (Around neck) ---
      // Beautiful 3D spherical clouds intersecting behind the cup
      const drawWarmFluff = (fx: number, fy: number, fr: number) => {
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#e2e8f0";
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.arc(fx, fy, fr, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Fluffy 3D shadow depth overlay
        const shadowGrad = ctx.createRadialGradient(fx - fr * 0.25, fy - fr * 0.3, fr * 0.05, fx, fy, fr);
        shadowGrad.addColorStop(0, "rgba(255,255,255,0.8)");
        shadowGrad.addColorStop(0.4, "rgba(0,0,0,0)");
        shadowGrad.addColorStop(1, "rgba(203, 213, 225, 0.4)");
        ctx.fillStyle = shadowGrad;
        ctx.beginPath();
        ctx.arc(fx, fy, fr, 0, Math.PI * 2);
        ctx.fill();
      };

      drawWarmFluff(-46 + yaw * 6, 75 + pitch * 5, 14);
      drawWarmFluff(-28 + yaw * 8, 79 + pitch * 6, 15);
      drawWarmFluff(-10 + yaw * 10, 81 + pitch * 7, 13);
      drawWarmFluff(10 + yaw * 10, 81 + pitch * 7, 13);
      drawWarmFluff(28 + yaw * 8, 79 + pitch * 6, 15);
      drawWarmFluff(46 + yaw * 6, 75 + pitch * 5, 14);

      // --- 9. FACE BASE & 3D INTENSIFIED CHUBBY PARALLAX ---
      // We divide the visual coordinates layer. The face features will pan faster (higher parallax) 
      // relative to the outer hood, conveying an immediate, highly polished stereoscopic 3D depth!
      const faceX = yaw * 19;
      const faceY = pitch * 12;

      // Neck connection
      ctx.fillStyle = beautifulSkin;
      ctx.beginPath();
      ctx.moveTo(-16, 40);
      ctx.lineTo(-16 + yaw * 8, 70);
      ctx.lineTo(16 + yaw * 8, 70);
      ctx.lineTo(16, 40);
      ctx.closePath();
      ctx.fill();

      // Soft shadow on neck under chin
      const neckShadow = ctx.createLinearGradient(0, 40, 0, 70);
      neckShadow.addColorStop(0, "rgba(180, 130, 110, 0.4)");
      neckShadow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = neckShadow;
      ctx.beginPath();
      ctx.moveTo(-16, 40);
      ctx.lineTo(-15 + yaw * 8, 65);
      ctx.lineTo(15 + yaw * 8, 65);
      ctx.lineTo(16, 40);
      ctx.closePath();
      ctx.fill();

      // Peach Skin 3D Spherical Face Contour
      drawVolumetricArc(faceX, faceY - 5, 47, beautifulSkin, -0.28 + yaw * 0.35, -0.3 + pitch * 0.35);

      // Soft adorable pink 3D blush gradients on her sweet cheeks
      ctx.save();
      const blushLeftGrad = ctx.createRadialGradient(faceX - 25, faceY + 12, 1, faceX - 25, faceY + 12, 16);
      blushLeftGrad.addColorStop(0, cuteBlush);
      blushLeftGrad.addColorStop(0.5, "rgba(251, 113, 133, 0.25)");
      blushLeftGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = blushLeftGrad;
      ctx.beginPath();
      ctx.arc(faceX - 25, faceY + 12, 16, 0, Math.PI * 2);
      ctx.fill();

      const blushRightGrad = ctx.createRadialGradient(faceX + 25, faceY + 12, 1, faceX + 25, faceY + 12, 16);
      blushRightGrad.addColorStop(0, cuteBlush);
      blushRightGrad.addColorStop(0.5, "rgba(251, 113, 133, 0.25)");
      blushRightGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = blushRightGrad;
      ctx.beginPath();
      ctx.arc(faceX + 25, faceY + 12, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // --- 10. SPARKLING INTERACTIVE GLASSY ANIME EYES ---
      const isSassy = activeReaction === "wink" || activeReaction === "heart_burst";
      const isShocked = activeReaction === "shock";
      const isConnecting = state === "connecting" || state === "error";

      let eyeLashY = faceY - 7;
      let eyebrowTilt = 0;

      if (isConnecting) {
        eyeLashY = faceY - 4;
        eyebrowTilt = 0.08;
      } else if (isListening) {
        eyeLashY = faceY - 82 / 10;
        eyebrowTilt = -0.05;
      }

      // 3D Shadows eyebrow curves
      ctx.strokeStyle = hairBrownDark;
      ctx.lineWidth = 2.0;
      ctx.lineCap = "round";

      // Left Brow
      ctx.save();
      ctx.translate(faceX - 21, eyeLashY - 11);
      ctx.rotate(eyebrowTilt + yaw * 0.05);
      ctx.beginPath();
      ctx.quadraticCurveTo(-6, -3, 8, 1);
      ctx.stroke();
      ctx.restore();

      // Right Brow
      ctx.save();
      ctx.translate(faceX + 21, eyeLashY - 11);
      ctx.rotate(-eyebrowTilt - yaw * 0.05);
      ctx.beginPath();
      ctx.quadraticCurveTo(6, -3, -8, 1);
      ctx.stroke();
      ctx.restore();

      const drawHighSpecularIris = (ex: number, ey: number, isLeft: boolean) => {
        const blinkAmount = blinkRatioRef.current;

        // Custom lovable wink reaction support
        if (activeReaction === "wink" && isLeft) {
          ctx.strokeStyle = hairBrownDark;
          ctx.lineWidth = 3.6;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.arc(ex, ey + 4, 11, Math.PI, Math.PI * 2, true); // Smiling sleeping arc eye
          ctx.stroke();

          // Lash highlights
          ctx.beginPath();
          ctx.moveTo(ex - 11, ey + 3);
          ctx.lineTo(ex - 16, ey + 0.5);
          ctx.stroke();
          return;
        }

        if (blinkAmount > 0.85) {
          // Closed shiny eyelash line
          ctx.strokeStyle = hairBrownDark;
          ctx.lineWidth = 3.8;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(ex - 12, ey + 3);
          ctx.quadraticCurveTo(ex, ey + 6.0, ex + 12, ey + 3);
          ctx.stroke();
          return;
        }

        const eyeScaleY = 1 - blinkAmount;
        ctx.save();
        ctx.beginPath();
        // Dynamic Eye lens masking contour
        ctx.ellipse(ex, ey + 2, 13, 10 * eyeScaleY, 0, 0, Math.PI * 2);
        ctx.clip();

        // 3D Eyeball background gradient (slightly shadowed on top)
        const eyeWhiteGrad = ctx.createLinearGradient(ex, ey - 10, ex, ey + 10);
        eyeWhiteGrad.addColorStop(0, "#e2e8f0");
        eyeWhiteGrad.addColorStop(0.3, "#ffffff");
        eyeWhiteGrad.addColorStop(1, "#ffffff");
        ctx.fillStyle = eyeWhiteGrad;
        ctx.beginPath();
        ctx.ellipse(ex, ey + 2, 13, 10 * eyeScaleY, 0, 0, Math.PI * 2);
        ctx.fill();

        // Beautiful stereoscopic refractive Golden anime iris!
        // Shifting coordinates based on gaze tracking for premium realism!
        const gazeOffsetX = yaw * 3.5;
        const gazeOffsetY = pitch * 1.8;

        const irisX = ex + gazeOffsetX;
        const irisY = ey + 2.5 + gazeOffsetY;

        const irisGlow = ctx.createLinearGradient(irisX, irisY - 7, irisX, irisY + 9);
        irisGlow.addColorStop(0, "#1f0f08"); // super deep top iris shadow
        irisGlow.addColorStop(0.3, "#502f18");
        irisGlow.addColorStop(0.65, "#d38032"); // warm honey gold
        irisGlow.addColorStop(0.9, "#fed7aa"); // bright peach reflection
        irisGlow.addColorStop(1, "#fff1f2");
        
        ctx.fillStyle = irisGlow;
        ctx.beginPath();
        ctx.arc(irisX, irisY, isShocked ? 4.8 : 7.8 * eyeScaleY, 0, Math.PI * 2);
        ctx.fill();

        // Rich dark pupil with micro secondary shadow
        ctx.fillStyle = "#1e0b02";
        ctx.beginPath();
        ctx.arc(irisX + gazeOffsetX * 0.1, irisY + gazeOffsetY * 0.1, isShocked ? 2.2 : 3.8 * eyeScaleY, 0, Math.PI * 2);
        ctx.fill();

        // Gorgeous glassy 3D specular reflections
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        // High specular highlight star
        ctx.arc(irisX - 2.8, irisY - 2.2 * eyeScaleY, 2.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        // Soft bottom refractive glint
        ctx.arc(irisX + 3.2, irisY + 4.8 * eyeScaleY, 1.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Bold gorgeous anime outlines with volumetric depth
        ctx.strokeStyle = hairBrownDark;
        ctx.lineWidth = 3.6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(ex, ey + 1.8, 13, Math.PI * 1.05, Math.PI * 1.95);
        ctx.stroke();

        // Charming outer eyelashes details
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        if (isLeft) {
          ctx.moveTo(ex - 12, ey + 1 * eyeScaleY);
          ctx.lineTo(ex - 16, ey - 1 * eyeScaleY);
          ctx.moveTo(ex - 10, ey + 6 * eyeScaleY);
          ctx.lineTo(ex - 13, ey + 8 * eyeScaleY);
        } else {
          ctx.moveTo(ex + 12, ey + 1 * eyeScaleY);
          ctx.lineTo(ex + 16, ey - 1 * eyeScaleY);
          ctx.moveTo(ex + 10, ey + 6 * eyeScaleY);
          ctx.lineTo(ex + 13, ey + 8 * eyeScaleY);
        }
        ctx.stroke();
      };

      drawHighSpecularIris(faceX - 20, eyeLashY, true);  // Left Eye
      drawHighSpecularIris(faceX + 20, eyeLashY, false); // Right Eye

      // Chubby little button nose
      ctx.strokeStyle = "rgba(180, 100, 80, 0.45)";
      ctx.fillStyle = "rgba(185, 95, 80, 0.65)";
      ctx.beginPath();
      ctx.arc(faceX, faceY + 9, 1.4, 0, Math.PI * 2);
      ctx.fill();

      // --- 11. REAL-TIME MOUTH SYNCRONIZATION ---
      const mouthY = faceY + 24;
      const speechFactor = Math.min(1.0, volumeVal / 42); // very responsive scale

      if (speechFactor > 0.08) {
        // Natural Speaking open round cartoon mouth
        const openH = 2.5 + speechFactor * 14;
        const openW = 10 + speechFactor * 4;

        ctx.save();
        ctx.beginPath();
        ctx.ellipse(faceX, mouthY, openW / 2, openH / 2, 0, 0, Math.PI * 2);
        ctx.clip();

        // Render interior of the throat in 3D (velvet gradients)
        const mouthSubGrad = ctx.createRadialGradient(faceX, mouthY, 1, faceX, mouthY, openW);
        mouthSubGrad.addColorStop(0, "#fca5a5"); // tongue glow
        mouthSubGrad.addColorStop(0.35, "#801d31"); // inner pink
        mouthSubGrad.addColorStop(1, "#3f0a14"); // deep background darkness
        ctx.fillStyle = mouthSubGrad;
        ctx.beginPath();
        ctx.ellipse(faceX, mouthY, openW / 2, openH / 2, 0, 0, Math.PI * 2);
        ctx.fill();

        // Cute upper white baby teeth segment
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.rect(faceX - openW / 3, mouthY - openH / 2, (openW / 3) * 2, 2.6);
        ctx.fill();

        // Soft curved tongue
        ctx.fillStyle = "#fb9fb5";
        ctx.beginPath();
        ctx.ellipse(faceX, mouthY + openH / 3.8, openW / 3.5, openH / 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Smooth rich lips trace
        ctx.strokeStyle = "#e1536b";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.ellipse(faceX, mouthY, openW / 2, openH / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // IDLE: Ultra authentic slightly smiling cozy loop (curved cat lip)
        ctx.strokeStyle = hairBrownDark;
        ctx.lineWidth = 2.2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(faceX - 5.5, mouthY);
        // Dimple micro curve
        ctx.quadraticCurveTo(faceX, mouthY + 2.8, faceX + 5.5, mouthY);
        ctx.stroke();

        // Extra cheek lines dimple anchors
        ctx.strokeStyle = "rgba(244, 114, 182, 0.4)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(faceX - 6, mouthY + 0.5, 0.6, 0, Math.PI * 2);
        ctx.arc(faceX + 6, mouthY + 0.5, 0.6, 0, Math.PI * 2);
        ctx.stroke();
      }

      // --- 12. CASCADE FLOW FRONT HAIR BANGS (Framing & 3D Depth) ---
      // Adding realistic hair ambient gradients and strands
      ctx.fillStyle = hairBrownLight;
      ctx.strokeStyle = hairBrownDark;
      ctx.lineWidth = 1.5;

      const hairSwayX = Math.sin(phase * 1.2) * 1.5 + yaw * 8; // responsive slide
      const hairSwayY = pitch * 4 + Math.abs(Math.sin(phase * 1.2)) * 1.2;

      ctx.save();
      ctx.beginPath();
      // Right face framing lush locks
      ctx.moveTo(faceX + 33, faceY - 26);
      ctx.quadraticCurveTo(faceX + 38 + hairSwayX * 0.4, faceY + 12 + hairSwayY, faceX + 29 + hairSwayX * 0.9, faceY + 28);
      ctx.quadraticCurveTo(faceX + 37 + hairSwayX * 0.4, faceY + 10, faceX + 41, faceY - 22);

      // Left face framing lush locks
      ctx.moveTo(faceX - 33, faceY - 26);
      ctx.quadraticCurveTo(faceX - 38 + hairSwayX * 0.4, faceY + 12 + hairSwayY, faceX - 29 + hairSwayX * 0.9, faceY + 28);
      ctx.quadraticCurveTo(faceX - 37 + hairSwayX * 0.4, faceY + 10, faceX - 41, faceY - 22);
      ctx.fill();
      ctx.stroke();

      // Forehead bangs layers (highly descriptive & layered)
      ctx.beginPath();
      // Left side overlapping bangs
      ctx.moveTo(faceX - 41, faceY - 24);
      ctx.quadraticCurveTo(faceX - 26 + hairSwayX * 0.3, faceY - 4 + hairSwayY * 0.5, faceX - 17, faceY - 0.5);
      ctx.quadraticCurveTo(faceX - 23, faceY - 12, faceX - 21, faceY - 26);
      
      // Center sweeping bangs group
      ctx.quadraticCurveTo(faceX - 6 + hairSwayX * 0.3, faceY + 0.5, faceX - 2, faceY + 5.5);
      ctx.quadraticCurveTo(faceX - 8, faceY - 14, faceX - 5, faceY - 28);
      
      // Right side sweeping bangs group
      ctx.quadraticCurveTo(faceX + 13 + hairSwayX * 0.3, faceY + 2.5, faceX + 23, faceY - 1.5);
      ctx.quadraticCurveTo(faceX + 14, faceY - 15, faceX + 18, faceY - 26);
      
      // Top connection bounds
      ctx.quadraticCurveTo(faceX, faceY - 42, faceX - 41, faceY - 24);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Soft reflection sheen/highlight brush over her bangs
      const hairSheen = ctx.createLinearGradient(faceX - 30, faceY - 23, faceX + 30, faceY - 15);
      hairSheen.addColorStop(0, "rgba(255,255,255,0)");
      hairSheen.addColorStop(0.35, "rgba(255, 239, 219, 0.22)");
      hairSheen.addColorStop(0.5, "rgba(255, 255, 255, 0.38)");
      hairSheen.addColorStop(0.65, "rgba(255, 239, 219, 0.22)");
      hairSheen.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = hairSheen;
      ctx.beginPath();
      ctx.ellipse(faceX, faceY - 20, 36, 6, 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // --- 13. FRONT BUNNY HOOD FLAPS & CUTE FACE ORNAMENTS ---
      // Hood outline border framing her face
      ctx.fillStyle = bunnyYellow;
      ctx.strokeStyle = fabricShadow;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      // Left cheek cowl
      ctx.moveTo(-45, -28);
      ctx.quadraticCurveTo(-48, 8, -32, 28);
      ctx.quadraticCurveTo(-15, 36, -10, 42); // cozy flap curve
      ctx.quadraticCurveTo(-25, 15, -45, -28);
      // Right cheek cowl
      ctx.moveTo(45, -28);
      ctx.quadraticCurveTo(48, 8, 32, 28);
      ctx.quadraticCurveTo(15, 36, 10, 42);
      ctx.quadraticCurveTo(25, 15, 45, -28);
      ctx.fill();
      ctx.stroke();

      // Top outer hood wrap margin
      ctx.fillStyle = bunnyYellow;
      ctx.beginPath();
      ctx.arc(0, -26, 62, Math.PI * 1.15, Math.PI * 1.85);
      ctx.ellipse(0, -32, 58, 14, 0, 0, Math.PI * 2);
      ctx.fill();

      // Drawing cute teddy bear details on top of the bunny hood (teddy face)
      ctx.save();
      // Offset details relative to deep hood tilt vectors
      ctx.translate(yaw * 7, -58 + pitch * 5);
      ctx.fillStyle = "#3e271a";
      // Sleepy dots eyes
      ctx.beginPath();
      ctx.arc(-14, -8, 2.2, 0, Math.PI * 2);
      ctx.arc(14, -8, 2.2, 0, Math.PI * 2);
      ctx.fill();

      // Shaded loops for nose
      ctx.strokeStyle = "#3e271a";
      ctx.lineWidth = 1.3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-2, -2.5);
      ctx.quadraticCurveTo(0, -0.8, 2, -2.5);
      ctx.stroke();
      ctx.restore();

      ctx.restore(); // Restores global center tracking matrix

      // --- 14. 3D FLOATING EMOTIONAL HOLOGRAPHIC PARTICLES (Sparkles / Hearts / Shocks) ---
      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.015; // light gravity drift
        p.alpha -= 0.018;
        p.r *= 0.985;

        if (p.alpha <= 0 || p.r < 0.3) {
          particles.splice(i, 1);
          continue;
        }

        const zFactor = 1 / p.z; // depth scale

        ctx.save();
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha * zFactor;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8 * zFactor;

        ctx.beginPath();
        if (p.type === "heart") {
          const hs = p.r * 2.3 * zFactor;
          ctx.moveTo(p.x, p.y + hs / 4);
          ctx.bezierCurveTo(p.x, p.y, p.x - hs / 2, p.y, p.x - hs / 2, p.y + hs / 3);
          ctx.bezierCurveTo(p.x - hs / 2, p.y + hs / 1.5, p.x, p.y + hs, p.x, p.y + hs);
          ctx.bezierCurveTo(p.x, p.y + hs, p.x + hs / 2, p.y + hs / 1.5, p.x + hs / 2, p.y + hs / 3);
          ctx.bezierCurveTo(p.x + hs / 2, p.y, p.x, p.y, p.x, p.y + hs / 4);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.arc(p.x, p.y, p.r * 1.8 * zFactor, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1.0; // Reset canvas context state

      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div 
      ref={containerRef}
      className="relative flex items-center justify-center select-none w-72 h-72 md:w-80 md:h-80 transition-transform duration-300"
    >
      {/* 3D Soft Cozy Ambient lighting Aura */}
      <div
        className={`absolute inset-4 rounded-full transition-all duration-[800ms] -z-10 bg-radial ${
          state === "disconnected"
            ? "from-amber-950/20 via-amber-950/2 to-transparent border border-amber-900/15"
            : state === "connecting"
            ? "from-amber-500/20 via-transparent to-transparent animate-pulse border border-amber-500/10"
            : state === "listening"
            ? "from-amber-500/25 via-pink-600/10 to-transparent border border-amber-500/20 ring-4 ring-amber-500/5 animate-[pulse_1.2s_infinite]"
            : state === "speaking"
            ? "from-amber-500/30 via-pink-600/12 to-transparent border border-amber-500/25 ring-8 ring-amber-500/5"
            : "from-red-500/15 via-transparent to-transparent border border-red-500/10"
        }`}
      />

      {/* High-fidelity Canvas rendering */}
      <canvas
        id="zoya-avatar-canvas"
        ref={canvasRef}
        onClick={onTapCore}
        className="cursor-pointer border-0 outline-none select-none z-10 transition-transform duration-300 hover:scale-[1.02] active:scale-[0.98]"
      />

      {/* Floating Interactive Status Indicator badge */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
        {state === "disconnected" && (
          <div className="text-[10px] font-mono uppercase text-amber-100 bg-amber-950/95 border border-amber-500/30 px-4 py-1.5 rounded-full animate-pulse z-20 shadow-xl shadow-amber-950/50 backdrop-blur-sm">
            ট্যাপ করুন
          </div>
        )}
        {state === "connecting" && (
          <div className="text-[10px] font-mono uppercase text-amber-100 bg-amber-950/95 border border-amber-500/30 px-4 py-1.5 rounded-full animate-bounce z-20 shadow-xl shadow-amber-950/50 backdrop-blur-sm">
            সংযোগ করা হচ্ছে...
          </div>
        )}
        {state === "error" && (
          <div className="text-[10px] font-mono uppercase text-red-100 bg-red-950/95 border border-red-500/30 px-4 py-1.5 rounded-full animate-pulse z-20 shadow-xl shadow-red-950/50 backdrop-blur-sm">
            সমস্যা হয়েছে
          </div>
        )}
      </div>
    </div>
  );
}

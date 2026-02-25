// Trigger build: 2026-02-24

"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import ImageTracer from "imagetracerjs";

interface Dot { id: string; x: number; y: number; }
interface DistortableShape {
  id: string;
  img: string;
  dots: Dot[];
  dims: { width: number; height: number };
  position: { x: number; y: number };
  scale: number;
  showDots: boolean;
  fillColor?: string;
  baseFill?: string;
  fillOpacity?: number;
  erasedPaths: string[];
  isMannequin?: boolean;
  isGarment?: boolean;
  groupId?: string;
}
interface Stroke { 
  id: string; 
  points: { id: string; x: number; y: number }[]; 
  color: string; 
  width: number; 
  fillColor?: string;
  baseFill?: string;
  fillOpacity?: number;
  groupId?: string;
}
type HistoryItem = { shapes: DistortableShape[]; strokes: Stroke[] };
type Candidate = { id: string; d: string; area: number; selected: boolean; };

interface MannequinMeasurements {
  bust: number;
  underBust: number;
  waist: number;
  hips: number;
  torsoLength: number;
  shoulderWidth: number;
  neckCircumference: number;
}

export function Studio({ onBack }: { onBack: () => void }) {
  // helper: convert hex color + alpha (0..1) to rgba() string
  const hexToRgba = (hex: string, alpha = 1) => {
    if (!hex) return `rgba(0,0,0,${alpha})`;
    const h = hex.replace('#','');
    const normalized = h.length === 3 ? h.split('').map(c=>c+c).join('') : h;
    const bigint = parseInt(normalized, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  };
  const [mounted, setMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [tutorialStep, setTutorialStep] = useState<number | null>(null);
  const [tutorialDisabled, setTutorialDisabled] = useState(false);
  const [ghostCursor, setGhostCursor] = useState({ x: 0, y: 0, active: false, clicking: false });
  const [showMannequinModal, setShowMannequinModal] = useState(false);
  const [showDrapeModal, setShowDrapeModal] = useState(false);
  const [selectedGarmentId, setSelectedGarmentId] = useState<string | null>(null);
  const [armpitMeasurement, setArmpitMeasurement] = useState(20);
  const [garmentLength, setGarmentLength] = useState(25);
  const [measurements, setMeasurements] = useState<MannequinMeasurements>({
    bust: 111,
    underBust: 98,
    waist: 97,
    hips: 134,
    torsoLength: 51,
    shoulderWidth: 42,
    neckCircumference: 39
  });
  
  // STATE FOR 4 NECK CLICKS
  const [manualShoulderMode, setManualShoulderMode] = useState<{
    garmentId: string;
    garmentLeftShoulder?: { x: number; y: number };
    garmentRightShoulder?: { x: number; y: number };
    mannequinLeftShoulder?: { x: number; y: number };
    mannequinRightShoulder?: { x: number; y: number };
  } | null>(null);
  
  const [templates, setTemplates] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [imgDims, setImgDims] = useState({ width: 0, height: 0 });
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [sourceDots, setSourceDots] = useState<Dot[]>([]);
  const [workspaceShapes, setWorkspaceShapes] = useState<DistortableShape[]>([]);
  const [activeTool, setActiveTool] = useState<"cursor" | "pen" | "fill" | "erase">("cursor");
  const [activeColor, setActiveColor] = useState("#27EEF5");
  const [activeFillOpacity, setActiveFillOpacity] = useState<number>(1);
  const [showColorPanel, setShowColorPanel] = useState(false);
  const [globalShowDots, setGlobalShowDots] = useState(true);
  const [isLocked, setIsLocked] = useState(false); 
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: string; type: "shape" | "stroke" | "selection" } | null>(null);
  const [draggingDot, setDraggingDot] = useState<{ shapeId: string; dotId: string } | null>(null);
  const [draggingStrokeDot, setDraggingStrokeDot] = useState<{ strokeId: string; dotId: string } | null>(null);
  const [draggingShapeId, setDraggingShapeId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [selectionRect, setSelectionRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [clipboard, setClipboard] = useState<{ shapes: DistortableShape[]; strokes: Stroke[] } | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const workspaceRef = useRef<SVGSVGElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const workspaceShapesRef = useRef<DistortableShape[]>([]);
  const isPointerDownRef = useRef(false);
  const penRef = useRef<{ pointerId: number; lastX: number; lastY: number; strokeId: string } | null>(null);
  const PEN_SPACING = 12; 
  const ERASE_RADIUS = 15;

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    workspaceShapesRef.current = workspaceShapes;
  }, [workspaceShapes]);

  const saveForUndo = useCallback(() => {
    setHistory(h => [...h, { shapes: JSON.parse(JSON.stringify(workspaceShapes)), strokes: JSON.parse(JSON.stringify(strokes)) }].slice(-50));
  }, [workspaceShapes, strokes]);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    const next = [...history];
    const last = next.pop()!;
    setWorkspaceShapes(last.shapes);
    setStrokes(last.strokes);
    setHistory(next);
  }, [history]);

  const openDrapeModal = (garmentId: string) => {
    const garment = workspaceShapes.find(s => s.id === garmentId);
    if (garment && !garment.isMannequin) {
      setSelectedGarmentId(garmentId);
      setContextMenu(null);
      // Drape immediately without showing modal - pass garmentId directly
      setTimeout(() => startManualShoulderSelection(garmentId), 50);
    }
  };


  // START MANUAL NECK-TO-NECK DRAPING
  const startManualShoulderSelection = useCallback((garmentId?: string) => {
    const targetGarmentId = garmentId || selectedGarmentId;
    if (!targetGarmentId) return;
    
    const garment = workspaceShapes.find(s => s.id === targetGarmentId);
    const mannequin = workspaceShapes.find(s => s.isMannequin);
    
    if (!garment) {
      alert("Garment not found!");
      return;
    }
    
    if (!mannequin) {
      alert("Mannequin not found! Please add a dress form first.");
      return;
    }
    
    // Use user-provided measurements instead of auto-detection
    saveForUndo();
    
    // Calculate mannequin armpit points (between shoulder and bust, around 22% down)
    // Sort mannequin dots by Y to find the vertical range
    const mannequinDotsLocal = [...mannequin.dots].sort((a, b) => a.y - b.y);
    const mannequinTopY = mannequinDotsLocal[0].y;
    const mannequinBottomY = mannequinDotsLocal[mannequinDotsLocal.length - 1].y;
    const mannequinHeight = mannequinBottomY - mannequinTopY;
    
    // Armpit is typically around 22% down from top (between shoulder at 15% and bust at 30%)
    const mannequinArmpitY = mannequinTopY + (mannequinHeight * 0.22);
    
    // Find leftmost and rightmost dots near the armpit level (within 3% range)
    const armpitRange = mannequinHeight * 0.03;
    const armpitLevelDots = mannequinDotsLocal.filter(d => 
      Math.abs(d.y - mannequinArmpitY) < armpitRange
    );
    
    if (armpitLevelDots.length < 2) {
      alert("Could not find mannequin armpit points!");
      return;
    }
    
    const mannequinArmpitLeft = armpitLevelDots.reduce((left, dot) => dot.x < left.x ? dot : left, armpitLevelDots[0]);
    const mannequinArmpitRight = armpitLevelDots.reduce((right, dot) => dot.x > right.x ? dot : right, armpitLevelDots[0]);
    
    const mannequinArmpitLeftScreen = {
      x: mannequin.position.x + mannequinArmpitLeft.x * mannequin.scale,
      y: mannequin.position.y + mannequinArmpitLeft.y * mannequin.scale
    };
    const mannequinArmpitRightScreen = {
      x: mannequin.position.x + mannequinArmpitRight.x * mannequin.scale,
      y: mannequin.position.y + mannequinArmpitRight.y * mannequin.scale
    };
    
    const mannequinBustPixels = Math.hypot(
      mannequinArmpitRightScreen.x - mannequinArmpitLeftScreen.x,
      mannequinArmpitRightScreen.y - mannequinArmpitLeftScreen.y
    );
    
    // Measure garment's width in LOCAL coordinates
    const garmentDots = garment.dots;
    const garmentDotsLocal = garmentDots.map(d => ({ ...d })).sort((a, b) => a.y - b.y);
    
    // Get middle range (40-60%) for armpit/armhole measurement
    const topY = garmentDotsLocal[0].y;
    const bottomY = garmentDotsLocal[garmentDotsLocal.length - 1].y;
    const garmentHeightLocal = bottomY - topY;
    const armpitStartY = topY + (garmentHeightLocal * 0.4);
    const armpitEndY = topY + (garmentHeightLocal * 0.6);
    const armpitRangeDots = garmentDotsLocal.filter(d => d.y >= armpitStartY && d.y <= armpitEndY);
    
    const leftmostDot = armpitRangeDots.reduce((left, dot) => dot.x < left.x ? dot : left);
    const rightmostDot = armpitRangeDots.reduce((right, dot) => dot.x > right.x ? dot : right);
    
    // Calculate actual armpit-to-armpit distance of garment
    const garmentArmpitDistance = Math.hypot(
      rightmostDot.x - leftmostDot.x,
      rightmostDot.y - leftmostDot.y
    );
    
    // Scale based on actual distances
    const newScale = mannequinBustPixels / garmentArmpitDistance;
    const scaleRatio = newScale / garment.scale;
    
    // Position LEFT armpit to LEFT armpit point, with slight downward adjustment
    const leftOffsetX = leftmostDot.x;
    const leftOffsetY = leftmostDot.y;
    
    const newLeftOffsetX = leftOffsetX * newScale;
    const newLeftOffsetY = leftOffsetY * newScale;
    
    // Add small downward adjustment (about 5% of mannequin height)
    const downwardAdjustment = mannequinHeight * mannequin.scale * 0.05;
    
    const newPosition = {
      x: mannequinArmpitLeftScreen.x - newLeftOffsetX,
      y: mannequinArmpitLeftScreen.y - newLeftOffsetY + downwardAdjustment
    };
    
    console.log("✅ Draping complete - armpit to armpit alignment");
    
    setWorkspaceShapes(prev => prev.map(s => 
      s.id === targetGarmentId 
        ? { ...s, position: newPosition, scale: newScale, showDots: true, isGarment: true }
        : s
    ));
    
    setShowDrapeModal(false);
    setSelectedGarmentId(null);
  }, [selectedGarmentId, workspaceShapes, saveForUndo, armpitMeasurement, garmentLength]);

  const calculateMannequinDots = (baseWidth: number, baseHeight: number, measures: MannequinMeasurements) => {
    const centerX = baseWidth / 2;
    const bustScale = measures.bust / 92;
    const underBustScale = measures.underBust / 78;
    const waistScale = measures.waist / 68;
    const hipScale = measures.hips / 98;
    const shoulderScale = measures.shoulderWidth / 38;
    const neckY = baseHeight * 0.08;
    const shoulderY = baseHeight * 0.15;
    const bustY = baseHeight * 0.30;
    const underBustY = baseHeight * 0.40;
    const waistY = baseHeight * 0.52;
    const hipY = baseHeight * 0.72;
    const bottomY = baseHeight * 0.88;
    const neckWidth = baseWidth * 0.20;
    const shoulderWidth = baseWidth * 0.45 * shoulderScale;
    const bustWidth = baseWidth * 0.42 * bustScale;
    const underBustWidth = baseWidth * 0.38 * underBustScale;
    const waistWidth = baseWidth * 0.28 * waistScale;
    const hipWidth = baseWidth * 0.44 * hipScale;
    const bottomWidth = baseWidth * 0.40 * hipScale;
    return [
      { id: 'neck-left', x: centerX - neckWidth/2, y: neckY },
      { id: 'neck-right', x: centerX + neckWidth/2, y: neckY },
      { id: 'shoulder-right', x: centerX + shoulderWidth/2, y: shoulderY },
      { id: 'bust-right-top', x: centerX + bustWidth/2, y: bustY - 20 },
      { id: 'bust-right', x: centerX + bustWidth/2, y: bustY },
      { id: 'bust-right-bottom', x: centerX + bustWidth/2, y: bustY + 20 },
      { id: 'underbust-right', x: centerX + underBustWidth/2, y: underBustY },
      { id: 'waist-right', x: centerX + waistWidth/2, y: waistY },
      { id: 'hip-right-top', x: centerX + hipWidth/2, y: hipY - 20 },
      { id: 'hip-right', x: centerX + hipWidth/2, y: hipY },
      { id: 'hip-right-bottom', x: centerX + hipWidth/2, y: hipY + 20 },
      { id: 'bottom-right', x: centerX + bottomWidth/2, y: bottomY },
      { id: 'bottom-center', x: centerX, y: bottomY + 10 },
      { id: 'bottom-left', x: centerX - bottomWidth/2, y: bottomY },
      { id: 'hip-left-bottom', x: centerX - hipWidth/2, y: hipY + 20 },
      { id: 'hip-left', x: centerX - hipWidth/2, y: hipY },
      { id: 'hip-left-top', x: centerX - hipWidth/2, y: hipY - 20 },
      { id: 'waist-left', x: centerX - waistWidth/2, y: waistY },
      { id: 'underbust-left', x: centerX - underBustWidth/2, y: underBustY },
      { id: 'bust-left-bottom', x: centerX - bustWidth/2, y: bustY + 20 },
      { id: 'bust-left', x: centerX - bustWidth/2, y: bustY },
      { id: 'bust-left-top', x: centerX - bustWidth/2, y: bustY - 20 },
      { id: 'shoulder-left', x: centerX - shoulderWidth/2, y: shoulderY },
    ];
  };

  const createMannequinWithMeasurements = useCallback((measures: MannequinMeasurements) => {
    saveForUndo();
    const mannequinImagePath = '/mannequin.png';
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const baseWidth = img.width;
      const baseHeight = img.height;
      const mannequinDots = calculateMannequinDots(baseWidth, baseHeight, measures);
      
      // Adjust position and scale for mobile
      const isMobile = window.innerWidth < 768;
      const posX = isMobile ? 50 : 150;
      const posY = isMobile ? 20 : 30;
      const scaleValue = isMobile ? 0.35 : 0.6;
      
      const mannequinShape: DistortableShape = {
        id: `mannequin-${Date.now()}`,
        img: mannequinImagePath,
        dots: mannequinDots,
        dims: { width: baseWidth, height: baseHeight },
        position: { x: posX, y: posY },
        scale: scaleValue,
        showDots: false,
        fillColor: undefined,
        erasedPaths: [],
        isMannequin: true
      };
      setWorkspaceShapes(prev => [...prev, mannequinShape]);
      setShowMannequinModal(false);
    };
    img.onerror = () => { alert('Could not load mannequin image. Make sure /public/mannequin.png exists!'); };
    img.src = mannequinImagePath;
  }, [saveForUndo]);

  const tutorialSteps = [
    { text: "Select a template...", target: "template-0" },
    { text: "Open Tracing...", target: "trace-btn" },
    { text: "Choose paths...", target: "trace-svg-container", action: "choose" },
    { text: "Add to Canvas!", target: "add-btn" },
    { text: "Drag a dot to reshape!", target: "workspace-dot-0", action: "drag_dot" },
    { text: "Select Pen Tool", target: "pen-tool" },
    { text: "Draw something!", target: "workspace-svg", action: "draw" },
    { text: "Change color", target: "color-picker" },
    { text: "Select Fill Tool", target: "fill-tool" },
    { text: "Fill the shape", target: "workspace-svg", action: "fill_shape" },
    { text: "Select Erase Tool", target: "erase-tool" },
    { text: "Erase part of it", target: "workspace-svg", action: "erase_action" },    
    { text: "Right-click for Menu", target: "workspace-svg", action: "context_menu" },
    { text: "Add a Dress Form!", target: "dress-form-btn", action: "open_mannequin_modal" },
    { text: "Adjust measurements", target: "bust-slider", action: "adjust_slider" },
    { text: "Add Mannequin!", target: "add-mannequin-btn" },
    { text: "Right-click garment!", target: "workspace-svg", action: "context_menu_garment" },
    { text: "Click Drape option!", target: "drape-menu-btn", action: "click_drape" },
    { text: "Bringing garment forward...", target: "workspace-svg", action: "bring_garment_front" },
    { text: "Hide the dots", target: "dots-btn" },
    { text: "Lock movement", target: "lock-btn" },
    { text: "Reset Canvas", target: "reset-btn" },
    { text: "Lastly, Undo everything!", target: "undo-btn" }
  ];

  const runTutorial = async () => {
    console.log('runTutorial called');
    
    // Ask user for confirmation
    const userConfirmed = confirm("I am starting a tutorial and need to reset the canvas. Do you want to continue?");
    console.log('User confirmed:', userConfirmed);
    
    if (!userConfirmed) {
      return;
    }
    
    // Reset canvas
    console.log('Resetting canvas...');
    setWorkspaceShapes([]);
    setStrokes([]);
    setContextMenu(null);
    
    // Show dots
    console.log('Showing dots...');
    setGlobalShowDots(true);
    
    // Unlock screen
    console.log('Unlocking screen...');
    setIsLocked(false);
    
    // Select second template (template-1)
    console.log('Selecting template...');
    const template1 = document.getElementById('template-1');
    console.log('Template element:', template1);
    if (template1) {
      template1.click();
    }
    await new Promise(r => setTimeout(r, 300));
    
    // Disable tutorial button
    console.log('Disabling tutorial button...');
    setTutorialDisabled(true);
    
    console.log('Starting tutorial animation...');
    setGhostCursor({ x: window.innerWidth / 2, y: window.innerHeight / 2, active: true, clicking: false });

    for (let i = 0; i < tutorialSteps.length; i++) {
      const step = tutorialSteps[i];
      setTutorialStep(i);
      const el = document.getElementById(step.target);
      if (!el) continue;

      const rect = el.getBoundingClientRect();
      let startX = rect.left + rect.width / 2;
      let startY = rect.top + rect.height / 2;

      setGhostCursor({ x: startX, y: startY, active: true, clicking: false });
      await new Promise(r => setTimeout(r, 800));
      setGhostCursor(prev => ({ ...prev, clicking: true }));

      if (step.action === "drag_dot") {
        saveForUndo();
        
        // Use deep clone and direct mutation - simpler approach
        for (let j = 0; j < 10; j++) {
          setWorkspaceShapes(prev => {
            const cloned = JSON.parse(JSON.stringify(prev)) as DistortableShape[];
            const lastShape = cloned[cloned.length - 1];
            
            if (lastShape && lastShape.dots.length >= 4) {
              // Move dots with large increments
              lastShape.dots[0].x += 5;
              lastShape.dots[0].y -= 3;
              lastShape.dots[1].x += 6;
              lastShape.dots[1].y += 2;
              lastShape.dots[2].x -= 4;
              lastShape.dots[2].y += 5;
              lastShape.dots[3].x += 3;
              lastShape.dots[3].y += 6;
            }
            
            return cloned;
          });
          
          await new Promise(r => setTimeout(r, 120));
        }
      }
      else if (step.action === "draw") {
        saveForUndo();
        const sid = `tuto-stroke`;
        const svgRect = workspaceRef.current?.getBoundingClientRect();
        if (!svgRect) continue;
        const startDrawX = 200;
        const startDrawY = 200;
        setStrokes(prev => [...prev, { id: sid, points: [{ id: 'p1', x: startDrawX, y: startDrawY }], color: activeColor, width: 6 }]);
        for(let j=0; j<10; j++) {
          await new Promise(r => setTimeout(r, 50));
          const newX = startDrawX + (j * 15);
          const newY = startDrawY + (Math.sin(j) * 20);
          setGhostCursor({ x: svgRect.left + newX, y: svgRect.top + newY, active: true, clicking: true });
          setStrokes(p => p.map(s => s.id === sid ? { ...s, points: [...s.points, { id: `pt-${j}`, x: newX, y: newY }] } : s));
        }
      }
        else if (step.action === "fill_shape") {
        saveForUndo();
        setStrokes(prev => prev.map(s => s.id === "tuto-stroke" ? { ...s, baseFill: '#ffffff', fillColor: hexToRgba(activeColor, activeFillOpacity) } : s));
      }
      else if (step.action === "erase_action") {
        saveForUndo();
        const svgRect = workspaceRef.current?.getBoundingClientRect();
        if (!svgRect) continue;
        for(let j=0; j<8; j++) {
          const ex = 220 + (j * 12);
          const ey = 210;
          sweepErase(ex, ey);
          setGhostCursor({ x: svgRect.left + ex, y: svgRect.top + ey, active: true, clicking: true });
          await new Promise(r => setTimeout(r, 80));
        }
      }
      else if (step.action === "context_menu") {
        // Find the drawn stroke element to right-click on
        const strokePath = workspaceRef.current?.querySelector('path[stroke]');
        if (strokePath) {
          const strokeRect = strokePath.getBoundingClientRect();
          const strokeCenterX = strokeRect.left + strokeRect.width / 2;
          const strokeCenterY = strokeRect.top + strokeRect.height / 2;
          setGhostCursor({ x: strokeCenterX, y: strokeCenterY, active: true, clicking: false });
          await new Promise(r => setTimeout(r, 500));
          setGhostCursor(prev => ({ ...prev, clicking: true }));
          strokePath.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true, clientX: strokeCenterX, clientY: strokeCenterY
          }));
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      else if (step.action === "open_mannequin_modal") {
        el.click();
        await new Promise(r => setTimeout(r, 1500));
      }
      else if (step.action === "adjust_slider") {
        const slider = document.getElementById('bust-slider') as HTMLInputElement;
        if (slider) {
          const startValue = parseInt(slider.value);
          const endValue = 105;
          for (let j = 0; j <= 10; j++) {
            await new Promise(r => setTimeout(r, 80));
            const newValue = Math.round(startValue + ((endValue - startValue) * (j / 10)));
            slider.value = newValue.toString();
            slider.dispatchEvent(new Event('input', { bubbles: true }));
            slider.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      }
      else if (step.action === "context_menu_garment") {
        // Right-click on the FIRST image (the template that was added, not the mannequin)
        setContextMenu(null);
        await new Promise(r => setTimeout(r, 300));
        
        // Get the very first shape in the workspace (the traced template)
        const currentShapes = workspaceShapesRef.current;
        if (currentShapes.length > 0 && !currentShapes[0].isMannequin) {
          const garment = currentShapes[0];
          // Calculate center of garment
          const garmentCenterX = garment.position.x + (garment.dims.width * garment.scale) / 2;
          const garmentCenterY = garment.position.y + (garment.dims.height * garment.scale) / 2;
          
          const svgRect = workspaceRef.current?.getBoundingClientRect();
          if (svgRect) {
            const screenX = svgRect.left + garmentCenterX;
            const screenY = svgRect.top + garmentCenterY;
            
            setGhostCursor({ x: screenX, y: screenY, active: true, clicking: false });
            await new Promise(r => setTimeout(r, 500));
            setGhostCursor(prev => ({ ...prev, clicking: true }));
            
            // Trigger context menu
            setContextMenu({ x: screenX, y: screenY, id: garment.id, type: "shape" });
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }
      else if (step.action === "click_drape") {
        // Click the drape button - get the first garment shape
        await new Promise(r => setTimeout(r, 800));
        const currentShapes = workspaceShapesRef.current;
        const garment = currentShapes.find(s => !s.isMannequin);
        
        if (garment) {
          // Set the selected garment ID first
          setSelectedGarmentId(garment.id);
          await new Promise(r => setTimeout(r, 100));
          
          const drapeBtn = document.getElementById("drape-menu-btn");
          if (drapeBtn) {
            drapeBtn.click();
          }
        }
        setContextMenu(null);
        await new Promise(r => setTimeout(r, 1500));
      }
      else if (step.action === "bring_garment_front") {
        // Bring the garment to front so it appears over the mannequin
        await new Promise(r => setTimeout(r, 500));
        const currentShapes = workspaceShapesRef.current;
        const garment = currentShapes.find(s => !s.isMannequin);
        
        if (garment) {
          bringToFront(garment.id, "shape");
        }
        await new Promise(r => setTimeout(r, 1000));
      }
      else {
        if (step.action === "choose") {
          const targetPath = document.elementFromPoint(startX, startY);
          if (targetPath?.tagName === 'path') targetPath.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        } else {
          el.click();
        }
      }

      await new Promise(r => setTimeout(r, 700));
      setGhostCursor(prev => ({ ...prev, clicking: false }));
      await new Promise(r => setTimeout(r, 400));
    }

    setTutorialStep(null);
    setGhostCursor(p => ({ ...p, active: false }));
    setTutorialDisabled(false);
    
    // Prompt user to reset after tutorial
    setTimeout(() => {
      if (confirm("Tutorial complete! Click OK to reset the canvas and start fresh.")) {
        // Reset to initial state
        saveForUndo();
        setWorkspaceShapes([]);
        setStrokes([]);
        setActiveTool("cursor");
        setGlobalShowDots(true);
        setIsLocked(false);
      }
    }, 500);
  };

  const getBoundingBox = useCallback((item: DistortableShape | Stroke) => {
    if ('dots' in item) {
      const shape = item as DistortableShape;
      const xs = shape.dots.map(d => shape.position.x + d.x * shape.scale);
      const ys = shape.dots.map(d => shape.position.y + d.y * shape.scale);
      return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    } else {
      const stroke = item as Stroke;
      const xs = stroke.points.map(p => p.x);
      const ys = stroke.points.map(p => p.y);
      return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    }
  }, []);

  const isItemInRect = useCallback((bbox: { x: number; y: number; width: number; height: number }, rect: { x1: number; y1: number; x2: number; y2: number }) => {
    const rectX = Math.min(rect.x1, rect.x2);
    const rectY = Math.min(rect.y1, rect.y2);
    const rectW = Math.abs(rect.x2 - rect.x1);
    const rectH = Math.abs(rect.y2 - rect.y1);
    return bbox.x < rectX + rectW && bbox.x + bbox.width > rectX && bbox.y < rectY + rectH && bbox.y + bbox.height > rectY;
  }, []);

  const createGroupFromSelection = useCallback(() => {
    if (!selectionRect) return;
    saveForUndo();
    const groupId = `grp-${Date.now()}`;
    
    // Mark all shapes in rectangle with groupId
    setWorkspaceShapes(prev => prev.map(shape => {
      const bbox = getBoundingBox(shape);
      if (isItemInRect(bbox, selectionRect)) {
        return { ...shape, groupId };
      }
      return shape;
    }));
    
    // Mark all strokes in rectangle with groupId
    setStrokes(prev => prev.map(stroke => {
      const bbox = getBoundingBox(stroke);
      if (isItemInRect(bbox, selectionRect)) {
        return { ...stroke, groupId };
      }
      return stroke;
    }));
    
    setSelectionRect(null);
    setContextMenu(null);
  }, [selectionRect, workspaceShapes, strokes, getBoundingBox, isItemInRect, saveForUndo]);

  const ungroupItemsFromSelection = useCallback(() => {
    if (!selectionRect) return;
    saveForUndo();
    
    // Find all unique groupIds in the selection
    const groupIds = new Set<string>();
    workspaceShapes.forEach(shape => {
      const bbox = getBoundingBox(shape);
      if (isItemInRect(bbox, selectionRect) && shape.groupId) {
        groupIds.add(shape.groupId);
      }
    });
    strokes.forEach(stroke => {
      const bbox = getBoundingBox(stroke);
      if (isItemInRect(bbox, selectionRect) && stroke.groupId) {
        groupIds.add(stroke.groupId);
      }
    });
    
    // Remove groupId from all items that have these groupIds
    groupIds.forEach(groupId => {
      setWorkspaceShapes(prev => prev.map(s => s.groupId === groupId ? { ...s, groupId: undefined } : s));
      setStrokes(prev => prev.map(st => st.groupId === groupId ? { ...st, groupId: undefined } : st));
    });
    
    setSelectionRect(null);
    setContextMenu(null);
  }, [selectionRect, workspaceShapes, strokes, getBoundingBox, isItemInRect, saveForUndo]);

  const copyFromSelection = useCallback(async () => {
    if (!selectionRect) return;
    
    try {
      const rectX = Math.min(selectionRect.x1, selectionRect.x2);
      const rectY = Math.min(selectionRect.y1, selectionRect.y2);
      const rectW = Math.abs(selectionRect.x2 - selectionRect.x1);
      const rectH = Math.abs(selectionRect.y2 - selectionRect.y1);
      
      if (rectW < 5 || rectH < 5) return;
      
      // Create a canvas to composite all items in the selection
      const canvas = document.createElement('canvas');
      const scale = 2;
      canvas.width = rectW * scale;
      canvas.height = rectH * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      ctx.scale(scale, scale);
      
      // Load all images first
      const shapesToDraw = workspaceShapes.filter(shape => {
        const bbox = getBoundingBox(shape);
        return isItemInRect(bbox, selectionRect);
      });
      
      const imagePromises = shapesToDraw.map(shape => {
        return new Promise<{ shape: DistortableShape; img: HTMLImageElement } | null>((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve({ shape, img });
          img.onerror = () => resolve(null);
          img.src = shape.img;
        });
      });
      
      const loadedImages = await Promise.all(imagePromises);
      
      // Draw all loaded shapes
      loadedImages.forEach(item => {
        if (!item) return;
        const { shape, img } = item;
        
        ctx.save();
        ctx.translate(shape.position.x - rectX, shape.position.y - rectY);
        ctx.scale(shape.scale, shape.scale);
        
        // Create clipping path
        ctx.beginPath();
        shape.dots.forEach((dot, i) => {
          if (i === 0) ctx.moveTo(dot.x, dot.y);
          else ctx.lineTo(dot.x, dot.y);
        });
        ctx.closePath();
        ctx.clip();
        
        // Draw image
        ctx.drawImage(img, 0, 0, shape.dims.width, shape.dims.height);
        ctx.restore();
      });
      
      // Draw all strokes that intersect with selection
      strokes.forEach(stroke => {
        const bbox = getBoundingBox(stroke);
        if (isItemInRect(bbox, selectionRect)) {
          ctx.save();
          ctx.translate(-rectX, -rectY);
          ctx.strokeStyle = stroke.color;
          ctx.lineWidth = stroke.width;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          
          ctx.beginPath();
          stroke.points.forEach((p, i) => {
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          });
          ctx.stroke();
          
          if (stroke.fillColor) {
            ctx.fillStyle = stroke.fillColor;
            ctx.fill();
          }
          ctx.restore();
        }
      });
      
      const croppedDataUrl = canvas.toDataURL('image/png');
      
      // Store in clipboard
      const clipboardData = {
        shapes: [{
          id: 'clipboard-temp',
          img: croppedDataUrl,
          dots: [
            { id: 'd1', x: 0, y: 0 },
            { id: 'd2', x: rectW, y: 0 },
            { id: 'd3', x: rectW, y: rectH },
            { id: 'd4', x: 0, y: rectH }
          ],
          dims: { width: rectW, height: rectH },
          position: { x: rectX, y: rectY },
          scale: 1,
          showDots: true,
          erasedPaths: []
        }],
        strokes: []
      };
      setClipboard(clipboardData);
      console.log('Copied to clipboard successfully');
      
    } catch (error) {
      console.error('Copy failed:', error);
    }
    
    setSelectionRect(null);
    setContextMenu(null);
  }, [selectionRect, workspaceShapes, strokes, getBoundingBox, isItemInRect]);

  const pasteFromSelection = useCallback(() => {
    if (!clipboard || (!clipboard.shapes.length && !clipboard.strokes.length)) return;
    saveForUndo();
    
    const PASTE_OFFSET = 30;
    
    // Get paste position from last selection or center
    let pasteX = 100;
    let pasteY = 100;
    if (selectionRect) {
      pasteX = Math.min(selectionRect.x1, selectionRect.x2);
      pasteY = Math.min(selectionRect.y1, selectionRect.y2);
    }
    
    // Paste shapes with new IDs and position at paste location
    const newShapes = clipboard.shapes.map(shape => ({
      ...shape,
      id: `s-${Date.now()}-${Math.random()}`,
      position: { x: pasteX, y: pasteY },
      groupId: undefined // Remove group when pasting
    }));
    
    setWorkspaceShapes(prev => [...prev, ...newShapes]);
    setSelectionRect(null);
    setContextMenu(null);
  }, [clipboard, saveForUndo, selectionRect]);

  const bringToFront = (id: string, type: "shape" | "stroke") => {
    saveForUndo();
    if (type === "shape") {
      setWorkspaceShapes((prev) => {
        const item = prev.find((s) => s.id === id);
        if (!item) return prev;
        return [...prev.filter((s) => s.id !== id), item];
      });
    } else {
      setStrokes((prev) => {
        const item = prev.find((s) => s.id === id);
        if (!item) return prev;
        return [...prev.filter((s) => s.id !== id), item];
      });
    }
    setContextMenu(null);
  };

  const sendToBack = (id: string, type: "shape" | "stroke") => {
    saveForUndo();
    if (type === "shape") {
      setWorkspaceShapes((prev) => {
        const item = prev.find((s) => s.id === id);
        if (!item) return prev;
        return [item, ...prev.filter((s) => s.id !== id)];
      });
    } else {
      setStrokes((prev) => {
        const item = prev.find((s) => s.id === id);
        if (!item) return prev;
        return [item, ...prev.filter((s) => s.id !== id)];
      });
    }
    setContextMenu(null);
  };

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/templates");
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) { setTemplates(data); setSelectedImage(data[0]); }
      } catch (e) { setTemplates(["/template1.png"]); setSelectedImage("/template1.png"); }
    }
    load();
  }, []);

  const runTrace = useCallback(() => {
    if (!selectedImage) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setImgDims({ width: img.width, height: img.height });
      ImageTracer.imageToSVG(selectedImage, (svgString: string) => {
        const inner = svgString.replace(/<svg[^>]*>/, "").replace(/<\/svg>/, "").replace(/<rect[^>]*\/>/g, "");
        setSvgContent(inner);
        setCandidates([]);
        setSourceDots([]);
      }, { numberofcolors: 2, ltres: 1, qtres: 1, scale: 1 });
    };
    img.src = selectedImage;
  }, [selectedImage]);

  useEffect(() => { if (selectedImage) runTrace(); }, [selectedImage, runTrace]);

  useEffect(() => {
    if (!svgContent) return;
    const ns = "http://www.w3.org/2000/svg";
    const tmp = document.createElementNS(ns, "svg");
    tmp.innerHTML = svgContent;
    const results: Candidate[] = [];
    Array.from(tmp.querySelectorAll("path")).forEach((p, pathIdx) => {
      const d = p.getAttribute("d") || "";
      const subs = d.match(/([Mm][^Mm]*)/g) || [];
      subs.forEach((sd, subIdx) => {
        results.push({ id: `path-${pathIdx}-${subIdx}`, d: sd, area: 0, selected: false });
      });
    });
    setCandidates(results);
  }, [svgContent]);

  const getCoords = (e: any) => {
    const rect = workspaceRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0, rx: 0, ry: 0 };
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: cx - rect.left, y: cy - rect.top, rx: cx, ry: cy };
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const url = event.target?.result as string;
        setSelectedImage(url);
      };
      reader.readAsDataURL(file);
    }
  };

  const sweepErase = (x: number, y: number) => {
    setStrokes(prev => prev.map(st => ({ ...st, points: st.points.filter(p => Math.hypot(p.x - x, p.y - y) > ERASE_RADIUS) })).filter(st => st.points.length > 0));
    setWorkspaceShapes(prev => prev.map(s => {
      const localX = (x - s.position.x) / s.scale;
      const localY = (y - s.position.y) / s.scale;
      if (localX > -50 && localX < s.dims.width + 50 && localY > -50 && localY < s.dims.height + 50) {
        const r = ERASE_RADIUS / Math.max(0.001, s.scale);
        const hole = `M ${localX - r} ${localY} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 -${r * 2} 0`;
        return { ...s, erasedPaths: [...(s.erasedPaths || []), hole], dots: s.dots.filter(d => Math.hypot(s.position.x + d.x * s.scale - x, s.position.y + d.y * s.scale - y) > ERASE_RADIUS) };
      }
      return s;
    }));
  };

  const generatePathData = (pts: { x: number; y: number }[], close = true) => {
    if (!pts || pts.length === 0) return "";
    const d = `M ${pts[0].x} ${pts[0].y}` + pts.slice(1).map(p => ` L ${p.x} ${p.y}`).join("");
    return close ? d + " Z" : d;
  };

  // Export current workspace as PNG/JPG by serializing the SVG, inlining images, and drawing to a canvas
  const downloadImage = async (type: 'png' | 'jpg' = 'png') => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const svgEl = workspaceRef.current;
    if (!svgEl) return;

    console.log('[downloadImage] start', type);

    // Clone and inline external images to avoid CORS/blob issues
    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    clone.querySelectorAll('circle[data-control-dot]').forEach(d => d.remove());
    console.log('[downloadImage] cloned svg');

    const images = Array.from(clone.querySelectorAll('image')) as SVGImageElement[];
    let inlined = 0;
    for (const imgEl of images) {
      const href = imgEl.getAttribute('href') || imgEl.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '';
      if (!href) continue;
      try {
        const res = await fetch(href, { mode: 'cors' });
        const blob = await res.blob();
        const reader = new FileReader();
        const dataUrl: string = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        imgEl.setAttribute('href', dataUrl);
        inlined++;
      } catch (e) {
        console.warn('[downloadImage] failed to inline', href, e);
      }
    }
    console.log('[downloadImage] inlined images', inlined);

    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(clone);
    if (!source.match(/^<\?xml/)) source = '<?xml version="1.0" standalone="no"?>\n' + source;

    const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      console.log('[downloadImage] image loaded for canvas draw');
      const bbox = svgEl.getBoundingClientRect();
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bbox.width || img.width));
      canvas.height = Math.max(1, Math.round(bbox.height || img.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); console.error('[downloadImage] no canvas context'); return; }
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const mime = type === 'jpg' ? 'image/jpeg' : 'image/png';
      const dataUrl = canvas.toDataURL(mime);
      console.log('[downloadImage] created dataUrl', dataUrl.substring(0, 40));
      const link = document.createElement('a');
      link.download = `design.${type}`;
      link.href = dataUrl;
      link.click();
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      console.error('[downloadImage] image load error', e);
      alert('Failed to render SVG for export. Check console for details.');
    };
    img.src = url;
  };

  function pasteFromClipboard() {
    // TODO: Implement clipboard paste logic
    console.log('Paste from clipboard triggered');
  }

  if (!mounted) return null;

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 text-slate-900 overflow-hidden select-none touch-none" onClick={() => setContextMenu(null)}>
      {showMannequinModal && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowMannequinModal(false)}>
          <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-8 max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-base sm:text-lg font-black uppercase text-slate-900">Dress Form Measurements</h2>
                <p className="text-[10px] text-slate-500 mt-1">Adjust to customize the dress form shape</p>
              </div>
              <button onClick={() => setShowMannequinModal(false)} className="text-slate-400 hover:text-slate-600 text-3xl leading-none">&times;</button>
            </div>
            <div className="space-y-4">
              <div><label className="block text-[10px] font-black uppercase text-slate-600 mb-2">Bust / Chest<span className="ml-2 text-pink-500 font-bold">{measurements.bust} cm</span></label><input id="bust-slider" type="range" min="70" max="130" value={measurements.bust} onChange={(e) => setMeasurements(prev => ({ ...prev, bust: parseInt(e.target.value) }))} className="w-full h-2 bg-pink-100 rounded-lg appearance-none cursor-pointer accent-pink-500" /></div>
              <div><label className="block text-[10px] font-black uppercase text-slate-600 mb-2">Under-Bust<span className="ml-2 text-purple-500 font-bold">{measurements.underBust} cm</span></label><input type="range" min="60" max="110" value={measurements.underBust} onChange={(e) => setMeasurements(prev => ({ ...prev, underBust: parseInt(e.target.value) }))} className="w-full h-2 bg-purple-100 rounded-lg appearance-none cursor-pointer accent-purple-500" /></div>
              <div><label className="block text-[10px] font-black uppercase text-slate-600 mb-2">Waist<span className="ml-2 text-yellow-600 font-bold">{measurements.waist} cm</span></label><input type="range" min="55" max="110" value={measurements.waist} onChange={(e) => setMeasurements(prev => ({ ...prev, waist: parseInt(e.target.value) }))} className="w-full h-2 bg-yellow-100 rounded-lg appearance-none cursor-pointer accent-yellow-500" /></div>
              <div><label className="block text-[10px] font-black uppercase text-slate-600 mb-2">Hips<span className="ml-2 text-blue-500 font-bold">{measurements.hips} cm</span></label><input type="range" min="75" max="140" value={measurements.hips} onChange={(e) => setMeasurements(prev => ({ ...prev, hips: parseInt(e.target.value) }))} className="w-full h-2 bg-blue-100 rounded-lg appearance-none cursor-pointer accent-blue-500" /></div>
              <div><label className="block text-[10px] font-black uppercase text-slate-600 mb-2">Torso Length<span className="ml-2 text-green-500 font-bold">{measurements.torsoLength} cm</span></label><input type="range" min="35" max="55" value={measurements.torsoLength} onChange={(e) => setMeasurements(prev => ({ ...prev, torsoLength: parseInt(e.target.value) }))} className="w-full h-2 bg-green-100 rounded-lg appearance-none cursor-pointer accent-green-500" /></div>
              <div><label className="block text-[10px] font-black uppercase text-slate-600 mb-2">Shoulder Width<span className="ml-2 text-indigo-500 font-bold">{measurements.shoulderWidth} cm</span></label><input type="range" min="30" max="50" value={measurements.shoulderWidth} onChange={(e) => setMeasurements(prev => ({ ...prev, shoulderWidth: parseInt(e.target.value) }))} className="w-full h-2 bg-indigo-100 rounded-lg appearance-none cursor-pointer accent-indigo-500" /></div>
              <div><label className="block text-[10px] font-black uppercase text-slate-600 mb-2">Neck Circumference<span className="ml-2 text-teal-500 font-bold">{measurements.neckCircumference} cm</span></label><input type="range" min="28" max="45" value={measurements.neckCircumference} onChange={(e) => setMeasurements(prev => ({ ...prev, neckCircumference: parseInt(e.target.value) }))} className="w-full h-2 bg-teal-100 rounded-lg appearance-none cursor-pointer accent-teal-500" /></div>
            </div>
            <div className="mt-8 flex gap-3">
              <button onClick={() => setShowMannequinModal(false)} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl text-[10px] font-black uppercase hover:bg-slate-200 transition-colors">Cancel</button>
              <button id="add-mannequin-btn" onClick={() => createMannequinWithMeasurements(measurements)} className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white py-3 rounded-xl text-[10px] font-black uppercase hover:shadow-lg transition-all">Add to Canvas</button>
            </div>
          </div>
        </div>
      )}
      <header className="h-16 flex items-center justify-between px-2 lg:px-8 bg-gradient-to-r from-amber-50 to-orange-50 border-b-2 border-amber-200 shrink-0 z-[100] shadow-md">
        <div className="flex items-center gap-2 sm:gap-4">
          <button id="trace-btn" onClick={() => setIsSidebarOpen(true)} className="lg:hidden bg-gradient-to-r from-amber-400 to-orange-400 text-white px-3 py-2 rounded-xl text-[9px] font-black uppercase shadow-md hover:shadow-lg transition-all">Trace</button>
          <div onClick={onBack} className="flex flex-col cursor-pointer active:scale-95 px-2">
            <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.2em]">DesignIt <span className="text-yellow-500">.</span></span>
            <span className="hidden xs:block text-[7px] font-medium uppercase text-slate-400">Studio</span>
          </div>
          <div className="hidden md:flex items-center gap-4">
            <Link href="/" className="text-slate-600 hover:text-slate-900 font-medium text-[9px] uppercase transition-colors">
              Home
            </Link>
            <Link href="/about" className="text-slate-600 hover:text-slate-900 font-medium text-[9px] uppercase transition-colors">
              About
            </Link>
            <Link href="/contact" className="text-slate-600 hover:text-slate-900 font-medium text-[9px] uppercase transition-colors">
              Contact
            </Link>
          </div>
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 hidden lg:flex items-center gap-2 px-4 py-2 bg-white rounded-full border-2 border-amber-300 shadow-lg animate-pulse">
          <span className="text-[10px] font-black text-slate-900">Click</span>
          <span className="w-5 h-5 bg-gradient-to-br from-amber-500 to-orange-500 text-white rounded-full flex items-center justify-center text-[10px] font-black">?</span>
          <span className="text-[10px] font-black text-slate-900">for interactive tutorial</span>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <button id="dress-form-btn" onClick={() => setShowMannequinModal(true)} className="px-2 sm:px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full text-[8px] sm:text-[9px] font-black uppercase shadow-md hover:shadow-lg transition-all flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C10.9 2 10 2.9 10 4s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 18h-3v-6h-2v6H9v-6H7v6H4v-8c0-1.1.9-2 2-2h12c1.1 0 2 .9 2 2v8z"/></svg>
            <span className="hidden sm:inline">Dress Form</span>
          </button>
          <button id="undo-btn" onClick={undo} className="px-2 sm:px-4 py-2 bg-pink-50 text-pink-600 rounded-full text-[8px] sm:text-[9px] font-black uppercase border border-pink-100">Undo</button>
          <button id="reset-btn" onClick={() => { if(confirm("Reset?")) { saveForUndo(); setWorkspaceShapes([]); setStrokes([]); } }} className="px-2 sm:px-4 py-2 bg-emerald-50 text-emerald-600 rounded-full text-[8px] sm:text-[9px] font-black uppercase border border-emerald-100">Reset</button>
          {/* <button onClick={downloadSVG} className="px-2 sm:px-4 py-2 bg-blue-50 text-blue-600 rounded-full text-[8px] sm:text-[9px] font-black uppercase border border-blue-100">Download</button> */}
          <button id="dots-btn" onClick={() => setGlobalShowDots(!globalShowDots)} className={`px-2 sm:px-4 py-2 rounded-full text-[8px] sm:text-[9px] font-black uppercase border transition-all ${globalShowDots ? 'bg-yellow-50 text-yellow-700' : 'bg-white text-slate-400'}`}>Dots</button>
          <button id="lock-btn" onClick={() => setIsLocked(!isLocked)} className={`px-2 sm:px-4 py-2 rounded-full text-[8px] sm:text-[9px] font-black uppercase border transition-all ${isLocked ? 'bg-sky-500 text-white' : 'bg-white text-sky-500'}`}>Lock</button>
        </div>
      </header>
      <div className="flex-1 flex overflow-hidden relative">
        <aside className={`fixed lg:static inset-0 lg:w-[320px] bg-gradient-to-br from-amber-50 via-white to-orange-50 lg:border-r-2 border-amber-200 flex flex-col z-[200] lg:z-0 transition-transform shadow-lg ${isSidebarOpen ? 'translate-y-0' : 'translate-y-full lg:translate-y-0'}`}>
          <div className="p-6 shrink-0 bg-gradient-to-r from-amber-50 to-orange-50 border-b-2 border-amber-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xs font-black uppercase bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">Source ✨</h3>
              <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-amber-600 hover:text-orange-600 text-xs font-bold transition-colors">CLOSE ✕</button>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button onClick={() => fileInputRef.current?.click()} className="bg-gradient-to-br from-blue-500 to-blue-600 text-white py-4 rounded-xl text-[9px] font-black uppercase shadow-md hover:shadow-lg transition-all">Upload<input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" /></button>
              <button id="add-btn" onClick={() => { 
                // Sample the dots first
                const ns = "http://www.w3.org/2000/svg"; 
                let pts: Dot[] = []; 
                candidates.filter(c => c.selected).forEach(c => { 
                  const path = document.createElementNS(ns, "path"); 
                  path.setAttribute("d", c.d); 
                  document.body.appendChild(path); 
                  const len = path.getTotalLength(); 
                  for (let i = 0; i <= len; i += Math.max(3, Math.round(len / 40))) { 
                    const p = path.getPointAtLength(i); 
                    pts.push({ id: `p-${Math.random()}`, x: p.x, y: p.y }); 
                  } 
                  document.body.removeChild(path); 
                }); 
                // Then add to workspace
                if (pts.length > 0) {
                  saveForUndo(); 
                  const fs = imgDims.width ? 150 / imgDims.width : 1; 
                  setWorkspaceShapes(prev => [...prev, { id: `s-${Date.now()}`, img: selectedImage!, dots: [...pts], dims: { ...imgDims }, position: { x: 100, y: 100 }, scale: fs, showDots: true, erasedPaths: [] }]); 
                  setSourceDots([]); 
                  setIsSidebarOpen(false);
                }
              }} disabled={candidates.filter(c => c.selected).length === 0} className="bg-gradient-to-br from-slate-800 to-blue-900 text-amber-300 py-4 rounded-xl text-[9px] font-black uppercase shadow-md hover:shadow-lg transition-all disabled:opacity-30">Add to Canvas</button>
            </div>
          </div>
          <div className="flex-1 p-4 overflow-hidden">
            <div className="h-full bg-gradient-to-br from-amber-100 to-orange-100 rounded-3xl overflow-hidden flex items-center justify-center relative border-2 border-amber-200 shadow-inner">
              <svg id="trace-svg-container" viewBox={`0 0 ${imgDims.width} ${imgDims.height}`} className="w-full h-full p-4">
                {selectedImage && <image href={selectedImage} width={imgDims.width} height={imgDims.height} />}
                {candidates.map((c, idx) => (<path key={c.id} id={idx === 0 ? "path-0-0" : c.id} d={c.d} fill={c.selected ? "rgba(251, 146, 60, 0.5)" : "transparent"} stroke={c.selected ? "#f97316" : "#cbd5e1"} strokeWidth={4} className="cursor-pointer" onClick={() => setCandidates(prev => prev.map(x => x.id === c.id ? {...x, selected: !x.selected} : x))} />))}
                {sourceDots.map((dot) => (<circle key={dot.id} cx={dot.x} cy={dot.y} r={8} fill="#f97316" stroke="#ffffff" strokeWidth={3} opacity={0.9} />))}
              </svg>
            </div>
          </div>
        </aside>
        <main className="flex-1 bg-[#F9F9FB] relative overflow-hidden">
          {/* Top toolbar */}
          <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
            <button
              onClick={() => downloadImage('jpg')}
              className="px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700 transition"
            >
              Download
            </button>
          </div>
          {ghostCursor.active && (
            <div className="fixed pointer-events-none z-[1000] transition-all duration-700 ease-in-out flex flex-col items-center" style={{ left: ghostCursor.x, top: ghostCursor.y, transform: 'translate(-50%, -50%)' }}>
              <div className={`w-8 h-8 rounded-full border-4 border-yellow-400 bg-yellow-400/30 transition-transform ${ghostCursor.clicking ? 'scale-75' : 'scale-100'}`} />
              {tutorialStep !== null && <div className="mt-2 bg-slate-900 text-white text-[10px] font-bold px-3 py-1 rounded-lg shadow-xl">{tutorialSteps[tutorialStep].text}</div>}
            </div>
          )}
          {contextMenu && (
            <div className="fixed z-[300] bg-white border border-slate-200 shadow-2xl rounded-2xl overflow-hidden py-1 min-w-[140px]" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(e) => e.stopPropagation()}>
              {contextMenu.type === "selection" ? (
                <>
                  <button onClick={createGroupFromSelection} className="w-full text-left px-4 py-2 hover:bg-amber-50 text-[9px] font-black uppercase border-b border-slate-100 text-amber-600">
                    🔗 Group Items
                  </button>
                  <button onClick={ungroupItemsFromSelection} className="w-full text-left px-4 py-2 hover:bg-orange-50 text-[9px] font-black uppercase border-b border-slate-100 text-orange-600">
                    🔓 Ungroup Items
                  </button>
                  <button onClick={copyFromSelection} className="w-full text-left px-4 py-2 hover:bg-blue-50 text-[9px] font-black uppercase border-b border-slate-100 text-blue-600">
                    📋 Copy Area
                  </button>
                  {clipboard && clipboard.shapes.length > 0 && (
                    <button onClick={pasteFromClipboard} className="w-full text-left px-4 py-2 hover:bg-green-50 text-[9px] font-black uppercase text-green-600">
                      📌 Paste
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button onClick={() => bringToFront(contextMenu.id, contextMenu.type as "shape" | "stroke")} className="w-full text-left px-4 py-2 hover:bg-slate-50 text-[9px] font-black uppercase border-b border-slate-100">Bring to Front</button>
                  <button onClick={() => sendToBack(contextMenu.id, contextMenu.type as "shape" | "stroke")} className="w-full text-left px-4 py-2 hover:bg-slate-50 text-[9px] font-black uppercase border-b border-slate-100">Send to Back</button>
                  {contextMenu.type === "shape" && !workspaceShapes.find(s => s.id === contextMenu.id)?.isMannequin && (
                    <button id="drape-menu-btn" onClick={() => openDrapeModal(contextMenu.id)} className="w-full text-left px-4 py-2 hover:bg-purple-50 text-[9px] font-black uppercase border-b border-slate-100 text-purple-600">
                      🎀 Drape to Mannequin
                    </button>
                  )}
                  <button onClick={() => { saveForUndo(); if (contextMenu.type === "shape") setWorkspaceShapes(prev => prev.filter(s => s.id !== contextMenu.id)); else if (contextMenu.type === "stroke") setStrokes(prev => prev.filter(s => s.id !== contextMenu.id)); setContextMenu(null); }} className="w-full text-left px-4 py-2 text-red-500 hover:bg-red-50 text-[9px] font-black uppercase">Delete Item</button>
                </>
              )}
            </div>
          )}
          <div className="absolute left-2 top-1/2 -translate-y-1/2 flex flex-col gap-2 p-2 bg-white/80 rounded-[2rem] shadow-xl z-50">
            {(["cursor", "pen", "fill", "erase"] as const).map((t) => (<button key={t} id={`${t}-tool`} onClick={() => setActiveTool(t)} className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${activeTool === t ? 'bg-yellow-400 text-black' : 'text-slate-400'}`}><span className="text-[10px] font-black uppercase">{t.charAt(0)}</span></button>))}
            <div className="relative mt-2">
              <button id="color-swatch" onClick={() => setShowColorPanel(v => !v)} title="Choose color and transparency" style={{ backgroundColor: activeColor }} className="w-8 h-8 rounded-lg border border-slate-200 shadow-sm" />
              {showColorPanel && (
                <div className="absolute left-10 top-0 mt-0 p-3 bg-white rounded shadow-xl z-50 w-40">
                  <input id="color-picker" type="color" value={activeColor} onChange={e => setActiveColor(e.target.value)} className="w-full h-10 p-0" />
                  <div className="flex items-center gap-2 mt-2">
                    <label className="text-[10px] font-black uppercase text-slate-600">Fill</label>
                    <input id="fill-opacity" type="range" min={0} max={100} value={Math.round(activeFillOpacity * 100)} onChange={e => setActiveFillOpacity(parseInt(e.target.value, 10) / 100)} className="flex-1" />
                    <span className="text-[10px] font-bold">{Math.round(activeFillOpacity * 100)}%</span>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div ref={canvasRef} className="w-full h-[calc(100vh-140px)] p-2 lg:p-8" onPointerDown={(e) => { 
            // REST OF EXISTING LOGIC
            isPointerDownRef.current = true; 
            const c = getCoords(e); 
            
            // Start selection rectangle
            if (activeTool === "cursor" && !isLocked && e.target === workspaceRef.current) {
              setSelectionRect({ x1: c.x, y1: c.y, x2: c.x, y2: c.y });
            }
            
            if (activeTool === "erase") { saveForUndo(); sweepErase(c.x, c.y); } 
            if (activeTool === "pen") { saveForUndo(); const sid = `st-${Date.now()}`; setStrokes(prev => [...prev, { id: sid, points: [{ id: `pt-${Date.now()}`, x: c.x, y: c.y }], color: activeColor, width: 4 }]);
              penRef.current = { pointerId: e.pointerId, lastX: c.x, lastY: c.y, strokeId: sid };
              e.currentTarget.setPointerCapture(e.pointerId);
              return;
            } 
          }} onPointerMove={(e) => { const c = getCoords(e); 
            
            // Update selection rectangle
            if (selectionRect && isPointerDownRef.current) {
              setSelectionRect(prev => prev ? { ...prev, x2: c.x, y2: c.y } : null);
            }
            
            if (activeTool === "erase" && isPointerDownRef.current) sweepErase(c.x, c.y); if (activeTool === "pen" && penRef.current && e.pointerId === penRef.current.pointerId) { if (Math.hypot(c.x - penRef.current!.lastX, c.y - penRef.current!.lastY) >= PEN_SPACING) { setStrokes(prev => prev.map(s => s.id === penRef.current!.strokeId ? { ...s, points: [...s.points, { id: `pt-${Date.now()}`, x: c.x, y: c.y }] } : s));
                penRef.current!.lastX = c.x;
                penRef.current!.lastY = c.y;
              } } else if (draggingStrokeDot) { setStrokes(prev => prev.map(s => s.id === draggingStrokeDot.strokeId ? { ...s, points: s.points.map(p => p.id === draggingStrokeDot.dotId ? { ...p, x: c.x, y: c.y } : p) } : s));
              } else if (draggingDot) { setWorkspaceShapes(prev => prev.map(s => s.id !== draggingDot.shapeId ? s : { ...s, dots: s.dots.map(d => d.id === draggingDot.dotId ? { ...d, x: (c.x - s.position.x)/s.scale, y: (c.y - s.position.y)/s.scale } : d) }));
              } else if (draggingShapeId && !isLocked) { 
                const shape = workspaceShapes.find(s => s.id === draggingShapeId);
                if (shape?.groupId) {
                  // Move all items in the group
                  const deltaX = c.x - dragOffset.x - shape.position.x;
                  const deltaY = c.y - dragOffset.y - shape.position.y;
                  setWorkspaceShapes(prev => prev.map(s => s.groupId === shape.groupId ? { ...s, position: { x: s.position.x + deltaX, y: s.position.y + deltaY } } : s));
                  setStrokes(prev => prev.map(st => st.groupId === shape.groupId ? { ...st, points: st.points.map(p => ({ ...p, x: p.x + deltaX, y: p.y + deltaY })) } : st));
                } else {
                  setWorkspaceShapes(prev => prev.map(s => s.id === draggingShapeId ? { ...s, position: { x: c.x - dragOffset.x, y: c.y - dragOffset.y } } : s));
                }
              } else if (resizingId) { 
                const shape = workspaceShapes.find(s => s.id === resizingId);
                if (shape?.groupId) {
                  // Get all items in the group and calculate group center
                  const groupShapes = workspaceShapes.filter(s => s.groupId === shape.groupId);
                  const groupStrokes = strokes.filter(st => st.groupId === shape.groupId);
                  
                  // Calculate scale factor (ratio, not delta)
                  const currentDist = Math.hypot(c.rx - shape.position.x, c.ry - shape.position.y);
                  const prevDist = Math.hypot(dragOffset.x - shape.position.x, dragOffset.y - shape.position.y);
                  const scaleFactor = currentDist / prevDist;
                  
                  // Find group bounding box center
                  const allX = groupShapes.flatMap(s => s.dots.map(d => s.position.x + d.x * s.scale));
                  const allY = groupShapes.flatMap(s => s.dots.map(d => s.position.y + d.y * s.scale));
                  groupStrokes.forEach(st => st.points.forEach(p => { allX.push(p.x); allY.push(p.y); }));
                  const centerX = (Math.min(...allX) + Math.max(...allX)) / 2;
                  const centerY = (Math.min(...allY) + Math.max(...allY)) / 2;
                  
                  // Resize and reposition shapes relative to center
                  setWorkspaceShapes(prev => prev.map(s => {
                    if (s.groupId === shape.groupId) {
                      const dx = s.position.x - centerX;
                      const dy = s.position.y - centerY;
                      return {
                        ...s,
                        scale: Math.max(0.1, s.scale * scaleFactor),
                        position: {
                          x: centerX + dx * scaleFactor,
                          y: centerY + dy * scaleFactor
                        }
                      };
                    }
                    return s;
                  }));
                  
                  // Resize and reposition strokes relative to center
                  setStrokes(prev => prev.map(st => {
                    if (st.groupId === shape.groupId) {
                      return {
                        ...st,
                        points: st.points.map(p => ({
                          ...p,
                          x: centerX + (p.x - centerX) * scaleFactor,
                          y: centerY + (p.y - centerY) * scaleFactor
                        }))
                      };
                    }
                    return st;
                  }));
                } else {
                  const scaleChange = (c.rx - dragOffset.x) / 400;
                  setWorkspaceShapes(prev => prev.map(s => s.id === resizingId ? { ...s, scale: Math.max(0.1, s.scale + scaleChange) } : s));
                }
                setDragOffset({ x: c.rx, y: c.ry }); 
              } }} onPointerUp={(e) => { 
              // Show context menu for selection rectangle
              if (selectionRect && Math.abs(selectionRect.x2 - selectionRect.x1) > 10 && Math.abs(selectionRect.y2 - selectionRect.y1) > 10) {
                setContextMenu({ x: e.clientX, y: e.clientY, id: 'selection', type: 'selection' });
              } else {
                setSelectionRect(null);
              }
              isPointerDownRef.current = false; penRef.current = null; setDraggingShapeId(null); setDraggingDot(null); setDraggingStrokeDot(null); setResizingId(null); }}>
              
              <svg id="workspace-svg" ref={workspaceRef} className="w-full h-full bg-white shadow-2xl rounded-[3rem] lg:rounded-[3rem] rounded-2xl" onContextMenu={(e) => {
                if (selectionRect) {
                  e.preventDefault();
                  e.stopPropagation();
                  const rect = { x: Math.min(selectionRect.x1, selectionRect.x2), y: Math.min(selectionRect.y1, selectionRect.y2), width: Math.abs(selectionRect.x2 - selectionRect.x1), height: Math.abs(selectionRect.y2 - selectionRect.y1) };
                  const c = getCoords(e);
                  if (c.x >= rect.x && c.x <= rect.x + rect.width && c.y >= rect.y && c.y <= rect.y + rect.height) {
                    setContextMenu({ x: e.clientX, y: e.clientY, id: 'selection', type: 'selection' });
                  }
                }
              }}>
                {selectionRect && (
                  <rect 
                    x={Math.min(selectionRect.x1, selectionRect.x2)} 
                    y={Math.min(selectionRect.y1, selectionRect.y2)} 
                    width={Math.abs(selectionRect.x2 - selectionRect.x1)} 
                    height={Math.abs(selectionRect.y2 - selectionRect.y1)} 
                    fill="rgba(59, 130, 246, 0.1)" 
                    stroke="#3b82f6" 
                    strokeWidth={2} 
                    strokeDasharray="5,5"
                    style={{ cursor: 'context-menu' }}
                  />
                )}
                {workspaceShapes.map((shape, shapeIdx) => {
                  const transform = `translate(${shape.position.x} ${shape.position.y}) scale(${shape.scale})`;
                  return (
                    <g key={shape.id} transform={transform} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, id: shape.id, type: "shape" }); }}>
                      {shape.isMannequin ? (
                        <>
                          <defs>
                            <clipPath id={`cl-${shape.id}`}><path d={generatePathData(shape.dots, true)} /></clipPath>
                          </defs>
                          <image href={shape.img} width={shape.dims.width} height={shape.dims.height} clipPath={`url(#cl-${shape.id})`} onPointerDown={(e) => {
                            if (activeTool === "cursor" && !isLocked) { e.stopPropagation(); const c = getCoords(e); setDraggingShapeId(shape.id); setDragOffset({ x: c.x - shape.position.x, y: c.y - shape.position.y }); }
                          }} />
                          {globalShowDots && shape.dots.map((dot) => (<circle key={dot.id} cx={dot.x} cy={dot.y} r={14 / shape.scale} fill="#8b5cf6" stroke="#ffffff" strokeWidth={2 / shape.scale} opacity={0.8} onPointerDown={(e) => { e.stopPropagation(); setDraggingDot({ shapeId: shape.id, dotId: dot.id }); }} />))}
                          {globalShowDots && <rect x={shape.dims.width - 20} y={shape.dims.height - 20} width={45/shape.scale} height={45/shape.scale} fill="#f97316" rx={4} onPointerDown={(e) => { e.stopPropagation(); const c = getCoords(e); setResizingId(shape.id); setDragOffset({ x: c.rx, y: c.ry }); }} />}
                        </>
                      ) : (
                        <>
                          <defs>
                            <clipPath id={`cl-${shape.id}`}><path d={generatePathData(shape.dots, true)} /></clipPath>
                            {shape.erasedPaths && shape.erasedPaths.length > 0 && (
                              <mask id={`ms-${shape.id}`} maskUnits="userSpaceOnUse" x="0" y="0" width={shape.dims.width} height={shape.dims.height}>
                                <rect x={0} y={0} width={shape.dims.width} height={shape.dims.height} fill="white" />
                                {shape.erasedPaths.map((p, i) => <path key={`er-${i}`} d={p} fill="black" />)}
                              </mask>
                            )}
                          </defs>
                          <image href={shape.img} width={shape.dims.width} height={shape.dims.height} clipPath={`url(#cl-${shape.id})`} mask={shape.erasedPaths && shape.erasedPaths.length > 0 ? `url(#ms-${shape.id})` : undefined} onPointerDown={(e) => {
                            if (activeTool === "fill") { e.stopPropagation(); saveForUndo(); setWorkspaceShapes(prev => prev.map(s => s.id === shape.id ? { ...s, baseFill: '#ffffff', fillColor: hexToRgba(activeColor, activeFillOpacity) } : s)); return; }
                            if (activeTool === "cursor" && !isLocked) { e.stopPropagation(); const c = getCoords(e); setDraggingShapeId(shape.id); setDragOffset({ x: c.x - shape.position.x, y: c.y - shape.position.y }); }
                          }} />
                          {shape.baseFill && <path d={generatePathData(shape.dots, true)} fill={shape.baseFill} pointerEvents="none" />}
                          {shape.fillColor && <path d={generatePathData(shape.dots, true)} fill={shape.fillColor} pointerEvents="none" />}
                          {globalShowDots && <path d={generatePathData(shape.dots, true)} fill="transparent" stroke="#3b82f6" strokeWidth={2 / shape.scale} strokeDasharray="4,4" opacity={0.5} pointerEvents="none" />}
                          {globalShowDots && shape.dots.map((dot, dotIdx) => (<circle key={dot.id} id={shapeIdx === 0 && dotIdx === 0 ? "workspace-dot-0" : undefined} cx={dot.x} cy={dot.y} r={14 / shape.scale} fill="#3b82f6" onPointerDown={(e) => { e.stopPropagation(); setDraggingDot({ shapeId: shape.id, dotId: dot.id }); }} />))}
                          {globalShowDots && <rect x={shape.dims.width - 20} y={shape.dims.height - 20} width={45/shape.scale} height={45/shape.scale} fill="#f97316" rx={4} onPointerDown={(e) => { e.stopPropagation(); const c = getCoords(e); setResizingId(shape.id); setDragOffset({ x: c.rx, y: c.ry }); }} />}
                        </>
                      )}
                    </g>
                  );
                })}
                {strokes.map(s => (
                  <g key={s.id} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, id: s.id, type: "stroke" }); }}>
                    {s.baseFill && <path d={generatePathData(s.points)} fill={s.baseFill} pointerEvents="none" strokeLinecap="round" strokeLinejoin="round" />}
                    <path d={generatePathData(s.points)} stroke={s.color} strokeWidth={s.width} fill={s.fillColor || "transparent"} strokeLinecap="round" strokeLinejoin="round" onPointerDown={(e) => { if (activeTool === "fill") { e.stopPropagation(); saveForUndo(); setStrokes(prev => prev.map(st => st.id === s.id ? { ...st, baseFill: '#ffffff', fillColor: hexToRgba(activeColor, activeFillOpacity) } : st)); } }} />
                    {globalShowDots && s.points.map((p) => (
                      <circle key={p.id} cx={p.x} cy={p.y} r={8} fill={s.color} onPointerDown={(e) => { if (activeTool === "cursor") { e.stopPropagation(); setDraggingStrokeDot({ strokeId: s.id, dotId: p.id }); } }} />
                    ))}
                  </g>
                ))}
              </svg>
            </div>
            {/* templates moved below main to keep them separate from the workspace */}
            <div className="lg:hidden absolute bottom-20 right-2 bg-white rounded-full border-2 border-amber-300 shadow-xl px-3 py-2 animate-pulse">
              <div className="flex items-center gap-1">
                <span className="text-[9px] font-black text-amber-600">Click ? for tutorial</span>
              </div>
              <div className="absolute bottom-0 right-6 w-0 h-0 border-l-6 border-r-6 border-t-6 border-transparent border-t-white" style={{transform: 'translateY(100%)'}}></div>
            </div>
            <button onClick={runTutorial} disabled={tutorialDisabled} className="fixed bottom-6 right-6 w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-500 text-white rounded-full font-black shadow-2xl border-4 border-white hover:scale-110 transition-transform disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100">?</button>
          </main>

          {/* Templates bar - separate from workspace */}
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[92%] lg:w-auto flex items-center gap-3 p-3 bg-white/60 backdrop-blur-xl rounded-[2rem] shadow-xl z-50 overflow-x-auto">
            {templates.map((u, i) => (
              <img
                key={i}
                id={`template-${i}`}
                src={u}
                onClick={() => setSelectedImage(u)}
                className={`h-12 w-12 rounded-xl object-cover cursor-pointer border-2 transition-all ${selectedImage === u ? 'border-slate-900 scale-105' : 'border-transparent opacity-50'}`}
              />
            ))}
          </div>
        </div>
      </div>
  );
}
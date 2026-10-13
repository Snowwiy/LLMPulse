import { useState, useRef, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { MetricRow } from './components/MetricRow';
import type { Metric } from './types/metrics';
import { useMetrics } from './hooks/useMetrics';

// ===== METRIC COLOR DEFAULTS =====
const DEFAULT_COLORS = {
  tksIn: '#4d9fff',
  tksOut: '#4d9fff',
  vram: '#a78bfa',
  gpu: '#38d9a5',
  ram: '#4d9fff',
  cpu: '#f59e0b',
};

const COLOR_KEY = 'llmpulse_colors';

function loadColors() {
  try {
    const raw = localStorage.getItem(COLOR_KEY);
    if (raw) return { ...DEFAULT_COLORS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_COLORS;
}

function saveColors(colors: typeof DEFAULT_COLORS) {
  try { localStorage.setItem(COLOR_KEY, JSON.stringify(colors)); } catch {}
}

// ===== SIZE PRESETS =====
const PRESETS = {
  compact: { width: 340, height: 310 },
  medium: { width: 380, height: 380 },
  large: { width: 440, height: 450 },
};

const MIN_W = 320;
const MIN_H = 220;
const MAX_W = 800;
const MAX_H = 700;

// ===== STORAGE KEYS =====
const STORAGE_KEY_SETTINGS = 'llmpulse_settings';
const STORAGE_KEY_WINDOW = 'llmpulse_window';
const STORAGE_KEY_ALWAYS_ON_TOP = 'llmpulse_always_on_top';

// ===== TYPE DEFINITIONS =====
interface WindowPrefs {
  x: number; y: number; width: number; height: number;
}

interface Settings {
  llamaPort: number;
  widgetSizePreset: 'compact' | 'medium' | 'large' | 'custom';
  customWidth: number;
  customHeight: number;
  windowX: number;
  windowY: number;
  positionLocked: boolean;
  alwaysOnTop: boolean;
  backgroundOpacity: number;
  themePreset: 'azul' | 'negro' | 'grafito' | 'custom';
  customBaseColor: string;
}

const DEFAULT_SETTINGS: Settings = {
  llamaPort: 18081,
  widgetSizePreset: 'compact',
  customWidth: PRESETS.compact.width,
  customHeight: PRESETS.compact.height,
  windowX: 0,
  windowY: 0,
  positionLocked: false,
  alwaysOnTop: false,
  backgroundOpacity: 95,
  themePreset: 'azul',
  customBaseColor: '#4d9fff',
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_SETTINGS;
}

function loadWindowPrefs(): WindowPrefs | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_WINDOW);
    if (raw) return JSON.parse(raw) as WindowPrefs;
  } catch {}
  return null;
}

function saveSettings(settings: Settings) {
  try { localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings)); } catch {}
}

function saveWindowPrefs(prefs: WindowPrefs) {
  try { localStorage.setItem(STORAGE_KEY_WINDOW, JSON.stringify(prefs)); } catch {}
}

function sanitizePrefs(prefs: WindowPrefs | null): WindowPrefs {
  if (!prefs) return { x: 0, y: 0, width: PRESETS.compact.width, height: PRESETS.compact.height };
  const w = Math.max(MIN_W, Math.min(prefs.width, MAX_W));
  const h = Math.max(MIN_H, Math.min(prefs.height, MAX_H));
  const x = Math.max(-100, Math.min(prefs.x, 2000));
  const y = Math.max(-100, Math.min(prefs.y, 1500));
  return { x, y, width: w, height: h };
}

// ===== SVG ICONS =====
const ICONS = {
  lightning: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  wind: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/><path d="M15 4a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/><path d="M13 16v-2"/><path d="M7 16v-2"/><path d="M10 18v2"/><path d="M4 18v2"/></svg>',
  chip: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="3"/><path d="M6 12h12"/></svg>',
  gpu: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 12h6"/><path d="M12 9v6"/></svg>',
  memory: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16"/><path d="M4 12V7"/><path d="M20 12V7"/><path d="M4 12v9"/><path d="M20 12v9"/><path d="M2 16h20"/></svg>',
  cpu: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2"/><path d="M12 21v2"/><path d="M4.22 4.22l1.42 1.42"/><path d="M18.38 18.38l1.42 1.42"/><path d="M1 12h2"/><path d="M21 12h2"/></svg>',
  thermometer: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 8.04V4a2 2 0 0 0-2 0v4"/><path d="M12 12a3 3 0 1 0 0 .01"/><path d="M14 8.04a4 4 0 0 1 2 3.48 3.97 3.97 0 0 0 0 5.96 4 4 0 0 1-2 1.52V20a2 2 0 0 0 2 0V8.04"/></svg>',
  gear: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10-8-10-8-10Z"/><path d="M16 8.5a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M12 6v4"/><path d="M12 18v4"/></svg>',
  pin: '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2 7h7l-5 5 2 7-7-4-7 4 2-7-5-5h7z"/></svg>',
  pinLocked: '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5"><path d="M12 2l2 7h7l-5 5 2 7-7-4-7 4 2-7-5-5h7z"/></svg>',
  close: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 6"/><path d="M18 12 6 12"/><path d="M18 18 6 18"/></svg>',
};

// ===== MAIN COMPONENT =====
export default function App() {
  const m = useMetrics();
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [portPopoverOpen, setPortPopoverOpen] = useState(false);
  const [portInput, setPortInput] = useState(String(settings.llamaPort));
  const [testResult, setTestResult] = useState<string | null>(null);
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [contextMenuX, setContextMenuX] = useState(0);
  const [contextMenuY, setContextMenuY] = useState(0);

  // Window state
  const [winX, setWinX] = useState(0);
  const [winY, setWinY] = useState(0);
  const [winW, setWinW] = useState(PRESETS.compact.width);
  const [winH, setWinH] = useState(PRESETS.compact.height);

  // Drag/Resize state
  const dragRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const resizeRef = useRef(false);
  const resizeDirRef = useRef('');
  const resizeStartRef = useRef({ x: 0, y: 0 });
  const widgetRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Load saved prefs on mount
  useEffect(() => {
    const prefs = sanitizePrefs(loadWindowPrefs());
    setWinX(prefs.x);
    setWinY(prefs.y);
    setWinW(prefs.width);
    setWinH(prefs.height);

    // Apply saved always-on-top
    if (settings.alwaysOnTop) {
      invoke('set_always_on_top', { enabled: true }).catch(() => {});
    }
  }, []);

  // ===== THEME & OPACITY APPLICATION =====
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.themePreset);
    // Apply transparency as CSS variables for rgba() usage in CSS
    const alpha = settings.backgroundOpacity / 100;
    document.documentElement.style.setProperty('--widget-alpha', String(alpha));
    document.documentElement.style.setProperty('--surface-alpha', String(alpha));
    if (settings.themePreset === 'custom') {
      document.documentElement.style.setProperty('--custom-accent', settings.customBaseColor);
      document.documentElement.style.setProperty('--custom-accent-glow', settings.customBaseColor + '4d');
    }
  }, [settings.themePreset, settings.backgroundOpacity, settings.customBaseColor]);

  // ===== CONTEXT MENU CLICK-OUTSIDE =====
  // Uses mousedown (not click) to avoid race with the menu item's own click handler
  useEffect(() => {
    if (!contextMenuVisible) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenuVisible(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenuVisible(false);
      }
    };

    // Use mousedown on document (not on the menu itself)
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenuVisible]);

  // Window blur → close context menu
  useEffect(() => {
    const handleBlur = () => setContextMenuVisible(false);
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, []);

  // ===== WINDOW MANAGEMENT =====
  const applyPreset = useCallback((preset: 'compact' | 'medium' | 'large') => {
    const p = PRESETS[preset];
    const w = Math.max(MIN_W, Math.min(p.width, MAX_W));
    const h = Math.max(MIN_H, Math.min(p.height, MAX_H));
    setWinW(w);
    setWinH(h);
    setSettings(prev => {
      const updated = { ...prev, widgetSizePreset: preset, customWidth: w, customHeight: h };
      saveSettings(updated);
      return updated;
    });
    saveWindowPrefs({ x: winX, y: winY, width: w, height: h });
    invoke('set_window_size', { width: w, height: h }).catch(() => {});
  }, [winX, winY]);

  const restorePosition = useCallback(() => {
    invoke('get_monitor_workarea').then((res: any) => {
      if (res && res.workarea) {
        const wa = res.workarea;
        const margin = 20;
        const nx = Math.max(wa.x, wa.x + margin);
        const ny = Math.max(wa.y, wa.y + margin);
        setWinX(nx);
        setWinY(ny);
        setSettings(prev => ({ ...prev, windowX: nx, windowY: ny }));
        saveWindowPrefs({ x: nx, y: ny, width: winW, height: winH });
      }
    }).catch(() => {
      setWinX(0);
      setWinY(0);
    });
  }, [winW, winH]);

  // ===== ALWAYS-ON-TOP — SINGLE SOURCE OF TRUTH =====
  const colors = loadColors();

  const handleAlwaysOnTop = useCallback(async () => {
    setSettings(prev => {
      const newVal = !prev.alwaysOnTop;
      const updated = { ...prev, alwaysOnTop: newVal };
      saveSettings(updated);
      try {
        invoke('set_always_on_top', { enabled: newVal }).catch(() => {});
        localStorage.setItem(STORAGE_KEY_ALWAYS_ON_TOP, String(newVal));
      } catch {}
      return updated;
    });
  }, []);

  const handlePositionLock = useCallback(() => {
    setSettings(prev => {
      const updated = { ...prev, positionLocked: !prev.positionLocked };
      saveSettings(updated);
      return updated;
    });
  }, []);

  const handleCloseApp = async () => {
    try { await invoke('close_app'); } catch {}
  };

  // ===== DRAG / RESIZE =====
  const handleDragStart = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (settings.positionLocked) return;
    const isHeader = t.closest('.header') !== null;
    if (!isHeader) return;
    if (t.tagName === 'BUTTON' || t.tagName === 'INPUT' || t.classList.contains('gear-btn') || t.classList.contains('lock-icon')) return;
    e.preventDefault();
    dragRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (settings.positionLocked && dragRef.current) {
      dragRef.current = false;
      return;
    }
    if (dragRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      const nx = winX + dx;
      const ny = winY + dy;
      setWinX(nx);
      setWinY(ny);
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      invoke('set_window_position', { x: nx, y: ny }).catch(() => {});
    } else if (resizeRef.current) {
      const dir = resizeDirRef.current;
      const dx = e.clientX - resizeStartRef.current.x;
      const dy = e.clientY - resizeStartRef.current.y;
      let nw = winW;
      let nh = winH;
      if (dir.includes('e')) nw = Math.max(MIN_W, Math.min(MAX_W, winW + dx));
      if (dir.includes('w')) nw = Math.max(MIN_W, Math.min(MAX_W, winW - dx));
      if (dir.includes('s')) nh = Math.max(MIN_H, Math.min(MAX_H, winH + dy));
      if (dir.includes('n')) nh = Math.max(MIN_H, Math.min(MAX_H, winH - dy));
      setWinW(nw);
      setWinH(nh);
      invoke('set_window_size', { width: nw, height: nh }).catch(() => {});
    }
  };

  const handleMouseUp = () => {
    if (dragRef.current || resizeRef.current) {
      dragRef.current = false;
      resizeRef.current = false;
      saveWindowPrefs({ x: winX, y: winY, width: winW, height: winH });
      setSettings(prev => ({ ...prev, windowX: winX, windowY: winY }));
    }
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = true;
    const dir = (e.target as HTMLElement).dataset.dir || 'se';
    resizeDirRef.current = dir;
    resizeStartRef.current = { x: e.clientX, y: e.clientY };
  };

  // ===== CONTEXT MENU =====
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const cw = 160;
    const ch = 200;
    const cx = Math.min(e.clientX, window.innerWidth - cw - 10);
    const cy = Math.min(e.clientY, window.innerHeight - ch - 10);
    setContextMenuX(Math.max(0, cx));
    setContextMenuY(Math.max(0, cy));
    setContextMenuVisible(true);
  };

  const hideContextMenu = () => setContextMenuVisible(false);

  const menuItems = [
    { label: 'Fijar posición', action: () => { handlePositionLock(); hideContextMenu(); }, active: settings.positionLocked },
    { label: 'Siempre visible', action: () => { handleAlwaysOnTop(); hideContextMenu(); }, active: settings.alwaysOnTop },
    { separator: true },
    { label: 'Compacto', action: () => { applyPreset('compact'); hideContextMenu(); } },
    { label: 'Mediano', action: () => { applyPreset('medium'); hideContextMenu(); } },
    { label: 'Grande', action: () => { applyPreset('large'); hideContextMenu(); } },
    { separator: true },
    { label: 'Configuración', action: () => { setPortPopoverOpen(p => !p); setTestResult(null); hideContextMenu(); } },
    { label: 'Restaurar posición', action: () => { restorePosition(); hideContextMenu(); } },
    { separator: true },
    { label: 'Cerrar LLMPulse', action: () => { handleCloseApp(); hideContextMenu(); }, danger: true },
  ];

  // ===== PORT / SETTINGS =====
  const handlePortSave = async () => {
    const p = parseInt(portInput, 10);
    if (p >= 1 && p <= 65535) {
      try {
        await invoke('set_port', { newPort: p });
        setSettings(prev => {
          const updated = { ...prev, llamaPort: p };
          saveSettings(updated);
          return updated;
        });
      } catch { setTestResult('Save failed'); }
      setPortPopoverOpen(false);
      setTestResult(null);
    } else { setTestResult('Invalid port'); }
  };

  const handlePortTest = async () => {
    const p = parseInt(portInput, 10);
    if (isNaN(p) || p < 1 || p > 65535) { setTestResult('Invalid port'); return; }
    try {
      const result = await invoke<string>('test_llama_connection', { port: p });
      setTestResult(result);
    } catch (e) { setTestResult(String(e)); }
  };

  const handleThemeChange = (theme: 'azul' | 'negro' | 'grafito' | 'custom') => {
    setSettings(prev => {
      const updated = { ...prev, themePreset: theme };
      saveSettings(updated);
      return updated;
    });
  };

  const handleOpacityChange = (val: number) => {
    setSettings(prev => {
      const updated = { ...prev, backgroundOpacity: val };
      saveSettings(updated);
      return updated;
    });
  };

  const handleCustomColorChange = (color: string) => {
    setSettings(prev => {
      const updated = { ...prev, customBaseColor: color };
      saveSettings(updated);
      return updated;
    });
  };

  // ===== METRIC COLORS =====
  const handleMetricColorChange = (key: keyof typeof DEFAULT_COLORS, color: string) => {
    const updated = { ...colors, [key]: color };
    saveColors(updated);
    document.documentElement.style.setProperty(`--color-${key}`, color);
  };

  const restoreColors = () => {
    saveColors(DEFAULT_COLORS);
    const c = DEFAULT_COLORS;
    document.documentElement.style.setProperty('--color-tks-in', c.tksIn);
    document.documentElement.style.setProperty('--color-tks-out', c.tksOut);
    document.documentElement.style.setProperty('--color-vram', c.vram);
    document.documentElement.style.setProperty('--color-gpu', c.gpu);
    document.documentElement.style.setProperty('--color-ram', c.ram);
    document.documentElement.style.setProperty('--color-cpu', c.cpu);
  };

  // Apply colors on mount
  useEffect(() => {
    const c = colors;
    document.documentElement.style.setProperty('--color-tks-in', c.tksIn);
    document.documentElement.style.setProperty('--color-tks-out', c.tksOut);
    document.documentElement.style.setProperty('--color-vram', c.vram);
    document.documentElement.style.setProperty('--color-gpu', c.gpu);
    document.documentElement.style.setProperty('--color-ram', c.ram);
    document.documentElement.style.setProperty('--color-cpu', c.cpu);
  }, []);

  // ===== METRICS RENDERING =====
  const model = m.model === 'NO MODEL' ? 'NO MODEL' : m.model.replace(/\s+/g, ' ').trim();
  const contextBadge = model.includes('80k') || model.includes('80K') ? '[80K]' :
                       model.includes('70b') || model.includes('70B') ? '[70B]' :
                       model.includes('32b') || model.includes('32B') ? '[32B]' :
                       model.includes('14b') || model.includes('14B') ? '[14B]' :
                       model.includes('8b') || model.includes('8B') ? '[8B]' : null;

  const tokOut = m.tokPerSecOut;
  const tokOutRow: Metric = m.generating && tokOut !== null && tokOut !== undefined && tokOut > 0
    ? { icon: '💨', label: 'Tk/s Out', value: `${tokOut.toFixed(1)} Tok/s`, progress: Math.min(100, Math.max(0, (tokOut / 100) * 100)), color: colors.tksOut }
    : { icon: '💨', label: 'Tk/s Out', value: 'N/D', progress: 0, color: colors.tksOut };

  const tokIn = m.tokPerSecIn;
  const tokInRow: Metric = m.generating && tokIn !== null && tokIn !== undefined && tokIn > 0
    ? { icon: '⚡', label: 'Tk/s In', value: `${tokIn.toFixed(1)} Tok/s`, progress: Math.min(100, Math.max(0, (tokIn / 100) * 100)), color: colors.tksIn }
    : { icon: '⚡', label: 'Tk/s In', value: 'N/D', progress: 0, color: colors.tksIn };

  const vramUsed = m.vramUsedGb;
  const vramTotal = m.vramTotalGb;
  const vramRow: Metric = vramTotal !== null && vramTotal !== undefined && vramUsed !== null
    ? { icon: '🟣', label: 'VRAM GPU', value: `${vramUsed.toFixed(1)} / ${vramTotal.toFixed(1)} GB`, progress: Math.min(100, Math.max(0, (vramUsed / vramTotal) * 100)), color: colors.vram }
    : { icon: '🟣', label: 'VRAM GPU', value: 'N/D', progress: 0, color: colors.vram };

  const gpu = m.gpuUsage;
  const gpuTemp = m.gpuTemp;
  const gpuRow: Metric = gpu !== null && gpu !== undefined
    ? { icon: '🟢', label: 'GPU Usage', value: `${Math.round(gpu)}%`, progress: Math.min(100, Math.max(0, gpu)), color: colors.gpu, temp: gpuTemp }
    : { icon: '🟢', label: 'GPU Usage', value: 'N/D', progress: 0, color: colors.gpu };

  const ramUsed = m.ramUsedGb;
  const ramTotal = m.ramTotalGb;
  const ramRow: Metric = ramTotal !== null && ramTotal !== undefined && ramUsed !== null
    ? { icon: '🔵', label: 'RAM Usage', value: `${ramUsed.toFixed(1)} / ${ramTotal.toFixed(1)} GB`, progress: Math.min(100, Math.max(0, (ramUsed / ramTotal) * 100)), color: colors.ram }
    : { icon: '🔵', label: 'RAM Usage', value: 'N/D', progress: 0, color: colors.ram };

  const cpu = m.cpuUsage;
  const cpuTemp = m.cpuTemp;
  const cpuRow: Metric = cpu !== null && cpu !== undefined
    ? { icon: '🟡', label: 'CPU Usage', value: `${Math.round(cpu)}%`, progress: Math.min(100, Math.max(0, cpu)), color: colors.cpu, temp: cpuTemp }
    : { icon: '🟡', label: 'CPU Usage', value: 'N/D', progress: 0, color: colors.cpu };

  const statusIcon = m.online ? 'connected' : m.model === 'DISCONNECTED' ? 'disconnected' : 'connecting';
  const statusText = m.online ? 'CONNECTED' : m.model === 'DISCONNECTED' ? 'DISCONNECTED' : 'CONNECTING';

  return (
    <div
      className="widget"
      ref={widgetRef}
      style={{ width: winW, height: winH }}
      onContextMenu={handleContextMenu}
      onMouseDown={handleDragStart}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Resize handles */}
      <div className="resize-handle resize-handle-top" data-dir="n" onMouseDown={handleResizeStart} />
      <div className="resize-handle resize-handle-bottom" data-dir="s" onMouseDown={handleResizeStart} />
      <div className="resize-handle resize-handle-left" data-dir="w" onMouseDown={handleResizeStart} />
      <div className="resize-handle resize-handle-right" data-dir="e" onMouseDown={handleResizeStart} />
      <div className="resize-handle resize-handle-top-left" data-dir="nw" onMouseDown={handleResizeStart} />
      <div className="resize-handle resize-handle-top-right" data-dir="ne" onMouseDown={handleResizeStart} />
      <div className="resize-handle resize-handle-bottom-left" data-dir="sw" onMouseDown={handleResizeStart} />
      <div className="resize-handle resize-handle-bottom-right" data-dir="se" onMouseDown={handleResizeStart} />

      {/* Header */}
      <div className={'header' + (settings.positionLocked ? ' locked' : '')}>
        <div className="header-row">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span className={'lock-icon' + (settings.positionLocked ? ' visible' : '')} title={settings.positionLocked ? 'Posición fijada' : undefined} dangerouslySetInnerHTML={{ __html: settings.positionLocked ? ICONS.pinLocked : ICONS.pin }} />
            <div className="title">MONITOR MODELO IA</div>
          </div>
          <div className="header-controls">
            <div className="gear-btn" onClick={(e) => { e.stopPropagation(); setPortPopoverOpen(p => !p); setTestResult(null); }} title="Configuración" dangerouslySetInnerHTML={{ __html: ICONS.gear }} />
          </div>
        </div>
        <div className="model">
          {model}
          {contextBadge && <span className="model-badge">{contextBadge}</span>}
        </div>
      </div>

      {/* Body */}
      <div className="body">
        <MetricRow metric={tokInRow} />
        <MetricRow metric={tokOutRow} />
        <MetricRow metric={vramRow} />
        <MetricRow metric={gpuRow} />
        <MetricRow metric={ramRow} />
        <MetricRow metric={cpuRow} />
      </div>

      {/* Connection Status */}
      <div className="connection-status">
        <span className={'status-dot ' + statusIcon} />
        <span className={'status-text ' + statusText}>{statusText}</span>
        <span style={{ marginLeft: 'auto', fontSize: '9px', color: 'var(--text-muted)' }}>{m.elapsed}</span>
      </div>

      {/* Port Popover / Settings */}
      {portPopoverOpen && (
        <div className="port-popover">
          <div className="port-popover-inner">
            <div className="popover-header">
              <span>CONFIGURACIÓN</span>
              <button className="popover-close" onClick={() => { setPortPopoverOpen(false); setTestResult(null); }} aria-label="Cerrar" dangerouslySetInnerHTML={{ __html: ICONS.close }} />
            </div>

            {/* Server section */}
            <div className="popover-section">
              <h3>Servidor</h3>
              <div className="popover-row">
                <label>Host</label>
                <input type="text" value="127.0.0.1" disabled />
              </div>
              <div className="popover-row">
                <label>Puerto</label>
                <input type="number" min={1} max={65535} value={portInput}
                  onChange={(e) => { setPortInput(e.target.value); setTestResult(null); }} />
              </div>
              <div className="popover-buttons">
                <button onClick={handlePortTest}>Probar</button>
                <button onClick={handlePortSave}>Guardar</button>
              </div>
              {testResult && (
                <div className={'test-result ' + (testResult.includes('CONNECTED') ? 'connected' : 'disconnected')}>
                  {testResult}
                </div>
              )}
            </div>

            {/* Appearance section */}
            <div className="popover-section">
              <h3>Apariencia</h3>
              <div className="popover-row">
                <label>Transp.</label>
                <input type="range" min={70} max={100} value={settings.backgroundOpacity}
                  onChange={(e) => handleOpacityChange(parseInt(e.target.value))} />
                <span className="range-value">{settings.backgroundOpacity}%</span>
              </div>
              <div className="popover-row">
                <label>Tema</label>
              </div>
              <div className="theme-options">
                <button className={'theme-btn' + (settings.themePreset === 'azul' ? ' active' : '')} onClick={() => handleThemeChange('azul')}>Azul</button>
                <button className={'theme-btn' + (settings.themePreset === 'negro' ? ' active' : '')} onClick={() => handleThemeChange('negro')}>Negro</button>
                <button className={'theme-btn' + (settings.themePreset === 'grafito' ? ' active' : '')} onClick={() => handleThemeChange('grafito')}>Grafito</button>
                <button className={'theme-btn' + (settings.themePreset === 'custom' ? ' active' : '')} onClick={() => handleThemeChange('custom')}>Custom</button>
              </div>
              {settings.themePreset === 'custom' && (
                <div className="popover-row" style={{ marginTop: 4 }}>
                  <label>Color</label>
                  <input type="color" value={settings.customBaseColor} onChange={(e) => handleCustomColorChange(e.target.value)} />
                </div>
              )}
            </div>

            {/* Metrics colors section */}
            <div className="popover-section">
              <h3>Métricas</h3>
              <div className="metric-colors">
                <div className="metric-color-row">
                  <label>Tk/s In</label>
                  <input type="color" value={colors.tksIn} onChange={(e) => handleMetricColorChange('tksIn', e.target.value)} />
                </div>
                <div className="metric-color-row">
                  <label>Tk/s Out</label>
                  <input type="color" value={colors.tksOut} onChange={(e) => handleMetricColorChange('tksOut', e.target.value)} />
                </div>
                <div className="metric-color-row">
                  <label>VRAM</label>
                  <input type="color" value={colors.vram} onChange={(e) => handleMetricColorChange('vram', e.target.value)} />
                </div>
                <div className="metric-color-row">
                  <label>GPU</label>
                  <input type="color" value={colors.gpu} onChange={(e) => handleMetricColorChange('gpu', e.target.value)} />
                </div>
                <div className="metric-color-row">
                  <label>RAM</label>
                  <input type="color" value={colors.ram} onChange={(e) => handleMetricColorChange('ram', e.target.value)} />
                </div>
                <div className="metric-color-row">
                  <label>CPU</label>
                  <input type="color" value={colors.cpu} onChange={(e) => handleMetricColorChange('cpu', e.target.value)} />
                </div>
              </div>
              <button className="restore-colors-btn" onClick={restoreColors}>Restaurar colores</button>
            </div>

            {/* Window section */}
            <div className="popover-section">
              <h3>Ventana</h3>
              <div className="toggle-row">
                <label>Fijar posición</label>
                <div className="toggle-switch">
                  <input type="checkbox" checked={settings.positionLocked} onChange={handlePositionLock} />
                  <span className="toggle-slider" />
                </div>
              </div>
              <div className="toggle-row">
                <label>Siempre visible</label>
                <div className="toggle-switch">
                  <input type="checkbox" checked={settings.alwaysOnTop} onChange={handleAlwaysOnTop} />
                  <span className="toggle-slider" />
                </div>
              </div>
              <div className="preset-buttons" style={{ marginTop: 6 }}>
                <button className={'preset-btn' + (settings.widgetSizePreset === 'compact' ? ' active' : '')} onClick={() => applyPreset('compact')}>Compacto</button>
                <button className={'preset-btn' + (settings.widgetSizePreset === 'medium' ? ' active' : '')} onClick={() => applyPreset('medium')}>Mediano</button>
                <button className={'preset-btn' + (settings.widgetSizePreset === 'large' ? ' active' : '')} onClick={() => applyPreset('large')}>Grande</button>
              </div>
              <div className="action-buttons" style={{ marginTop: 6 }}>
                <button className="action-btn" onClick={restorePosition}>Restaurar posición</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      <div ref={contextMenuRef}
        className={'context-menu' + (contextMenuVisible ? ' visible' : '')}
        style={{ left: contextMenuX, top: contextMenuY }}>
        {menuItems.map((item, i) => {
          if (item.separator) return <div key={i} className="context-menu-separator" />;
          return (
            <div key={i}
              className={'context-menu-item' + (item.active ? ' active' : '') + (item.danger ? ' danger' : '')}
              onClick={item.action}>
              {item.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

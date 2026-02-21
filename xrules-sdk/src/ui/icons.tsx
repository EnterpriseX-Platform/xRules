/**
 * Icon utilities for the XRULES SDK
 * Provides icon names and helpers for node icons
 */

/**
 * Lucide icon names for common node types
 */
export const NodeIcons = {
  // Communication
  Slack: 'MessageSquare',
  Email: 'Mail',
  Notification: 'Bell',
  Webhook: 'Link',
  Http: 'Globe',
  Api: 'Server',
  
  // Data
  Database: 'Database',
  File: 'FileText',
  Folder: 'Folder',
  Json: 'Braces',
  Xml: 'Code',
  Csv: 'Table',
  
  // Logic
  Condition: 'GitBranch',
  Switch: 'ArrowLeftRight',
  Loop: 'RotateCw',
  Delay: 'Clock',
  Schedule: 'Calendar',
  
  // Transform
  Transform: 'Shuffle',
  Map: 'Map',
  Filter: 'Filter',
  Aggregate: 'Layers',
  Split: 'Split',
  Join: 'Merge',
  
  // Integration
  Salesforce: 'Cloud',
  Aws: 'CloudLightning',
  Azure: 'CloudCog',
  Gcp: 'Cloudy',
  
  // General
  Start: 'Play',
  End: 'Square',
  Input: 'LogIn',
  Output: 'LogOut',
  Error: 'AlertCircle',
  Success: 'CheckCircle',
  Warning: 'AlertTriangle',
  Info: 'Info',
  Settings: 'Settings',
  Code: 'Code',
  Function: 'FunctionSquare',
  Template: 'FileCode',
  
  // Custom
  Custom: 'Puzzle',
  Plugin: 'Plug',
  Extension: 'Box',
} as const;

export type NodeIconName = typeof NodeIcons[keyof typeof NodeIcons];

/**
 * Category icon mapping
 */
export const CategoryIcons: Record<string, string> = {
  'communication': 'MessageSquare',
  'notifications': 'Bell',
  'messaging': 'Send',
  'data': 'Database',
  'storage': 'HardDrive',
  'files': 'FileText',
  'logic': 'GitBranch',
  'control': 'PlayCircle',
  'transform': 'Shuffle',
  'process': 'Cpu',
  'integration': 'Plug',
  'api': 'Globe',
  'http': 'Globe',
  'schedule': 'Calendar',
  'triggers': 'Zap',
  'utilities': 'Tool',
  'custom': 'Puzzle',
  'advanced': 'Settings',
};

/**
 * Get icon for a category
 */
export function getCategoryIcon(category: string): string {
  const normalizedCategory = category.toLowerCase();
  return CategoryIcons[normalizedCategory] || 'Box';
}

/**
 * Get icon for a node based on its ID or type
 */
export function getNodeIcon(nodeId: string): string {
  // Common patterns
  const patterns: Record<string, string> = {
    'slack': 'MessageSquare',
    'email': 'Mail',
    'smtp': 'Mail',
    'webhook': 'Link',
    'http': 'Globe',
    'rest': 'Globe',
    'api': 'Server',
    'graphql': 'Share2',
    'database': 'Database',
    'db': 'Database',
    'sql': 'Database',
    'postgres': 'Database',
    'mysql': 'Database',
    'mongo': 'Leaf',
    'redis': 'Database',
    's3': 'Cloud',
    'file': 'FileText',
    'csv': 'Table',
    'json': 'Braces',
    'xml': 'Code',
    'condition': 'GitBranch',
    'if': 'GitBranch',
    'switch': 'ArrowLeftRight',
    'loop': 'RotateCw',
    'for': 'RotateCw',
    'while': 'RotateCw',
    'delay': 'Clock',
    'wait': 'Clock',
    'schedule': 'Calendar',
    'cron': 'Calendar',
    'transform': 'Shuffle',
    'map': 'Map',
    'filter': 'Filter',
    'reduce': 'Minus',
    'aggregate': 'Layers',
    'split': 'Split',
    'join': 'Merge',
    'function': 'FunctionSquare',
    'code': 'Code',
    'script': 'Terminal',
    'log': 'FileText',
    'debug': 'Bug',
    'error': 'AlertCircle',
    'throw': 'AlertCircle',
    'try': 'Shield',
    'catch': 'ShieldAlert',
    'input': 'LogIn',
    'output': 'LogOut',
    'start': 'Play',
    'end': 'Square',
    'variable': 'Variable',
    'set': 'Edit3',
    'get': 'Eye',
  };

  const lowerId = nodeId.toLowerCase();
  
  for (const [pattern, icon] of Object.entries(patterns)) {
    if (lowerId.includes(pattern)) {
      return icon;
    }
  }

  return 'Box';
}

/**
 * Icon color mapping for categories
 */
export const CategoryColors: Record<string, string> = {
  'communication': '#3b82f6', // blue
  'notifications': '#f59e0b', // amber
  'data': '#10b981', // emerald
  'storage': '#8b5cf6', // violet
  'files': '#64748b', // slate
  'logic': '#f43f5e', // rose
  'control': '#ec4899', // pink
  'transform': '#06b6d4', // cyan
  'process': '#14b8a6', // teal
  'integration': '#6366f1', // indigo
  'api': '#0ea5e9', // sky
  'http': '#0ea5e9',
  'schedule': '#d946ef', // fuchsia
  'triggers': '#ef4444', // red
  'utilities': '#6b7280', // gray
  'custom': '#84cc16', // lime
  'advanced': '#737373', // neutral
};

/**
 * Get color for a category
 */
export function getCategoryColor(category: string): string {
  const normalizedCategory = category.toLowerCase();
  return CategoryColors[normalizedCategory] || '#6b7280';
}

/**
 * Icon size presets
 */
export const IconSizes = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
  '2xl': 48,
} as const;

export type IconSize = keyof typeof IconSizes;

/**
 * Get icon size in pixels
 */
export function getIconSize(size: IconSize | number): number {
  if (typeof size === 'number') {
    return size;
  }
  return IconSizes[size] || IconSizes.md;
}

/**
 * Icon component props
 */
export interface IconProps {
  name: string;
  size?: IconSize | number;
  color?: string;
  className?: string;
}

/**
 * SVG icon paths for common icons (simplified set)
 * In a real app, you'd use the full Lucide icon library
 */
export const IconPaths: Record<string, string> = {
  Box: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z',
  MessageSquare: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  Mail: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6',
  Bell: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0',
  Link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  Globe: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z M2 12h20 M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
  Server: 'M5 10h14M5 14h14M5 18h14M3 6h18a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z M6 10v.01 M6 14v.01 M6 18v.01',
  Database: 'M12 2C6.48 2 2 4.24 2 7v10c0 2.76 4.48 5 10 5s10-2.24 10-5V7c0-2.76-4.48-5-10-5z M2 7c0 2.76 4.48 5 10 5s10-2.24 10-5 M2 12c0 2.76 4.48 5 10 5s10-2.24 10-5',
  FileText: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  Folder: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
  Braces: 'M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1 M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1',
  Code: 'M16 18l6-6-6-6 M8 6l-6 6 6 6',
  GitBranch: 'M6 3v12 M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 15a9 9 0 0 0 9 9',
  ArrowLeftRight: 'M8 7h12M8 7l4-4M8 7l4 4 M16 17H4M16 17l-4 4M16 17l-4-4',
  RotateCw: 'M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  Clock: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z M12 6v6l4 2',
  Calendar: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M16 2v4 M8 2v4 M4 10h16',
  Shuffle: 'M16 3h5v5 M4 20L21 3 M21 16v5h-5 M15 15l6 6 M4 4l5 5',
  Map: 'M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z M8 2v16 M16 6v16',
  Filter: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z',
  Layers: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  Split: 'M16 3h5v5 M8 21H3v-5 M21 3l-7 7 M3 21l7-7',
  Merge: 'M8 3H3v5 M16 21h5v-5 M3 8l7 7 7-7 7 7',
  Play: 'M5 3l14 9-14 9V3z',
  Square: 'M3 3h18v18H3z',
  LogIn: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4 M10 17l5-5-5-5 M15 12H3',
  LogOut: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  AlertCircle: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z M12 8v4 M12 16h.01',
  CheckCircle: 'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3',
  AlertTriangle: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01',
  Info: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z M12 16v-4 M12 8h.01',
  Settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z',
  Puzzle: 'M20.5 11H19V7a2 2 0 0 0-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4a2 2 0 0 0-2 2v3.8h1.5c1.5 0 2.7 1.2 2.7 2.7S5 16.2 3.5 16.2H2V20a2 2 0 0 0 2 2h3.8v-1.5c0-1.5 1.2-2.7 2.7-2.7s2.7 1.2 2.7 2.7V22H17a2 2 0 0 0 2-2v-4h1.5a2.5 2.5 0 0 0 0-5z',
  Plug: 'M12 22v-5 M9 12V7a3 3 0 0 1 6 0v5 M15 8V3 M9 8V3 M12 17v-5 M5 10h14',
  Cloud: 'M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z',
  CloudLightning: 'M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9 M13 11l-4 6h6l-4 6',
  CloudCog: 'M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9 M17.5 19a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M19 19l1.5 1.5',
  Zap: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  Tool: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
  Table: 'M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18',
  Send: 'M22 2L11 13 M22 2l-7 20-4-9-9-4 20-7z',
  Share2: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M8.59 13.51l6.83 3.98 M15.41 6.51l-6.82 3.98',
  PlayCircle: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M10 8l6 4-6 4V8z',
  HardDrive: 'M22 12H2 M2 12a10 10 0 0 1 20 0 M6 12v4 M10 12v4 M14 12v4 M18 12v4 M6 16h12a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2z',
  Leaf: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.77 10-10 10Z M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12',
  FunctionSquare: 'M9 11h6 M9 15h6 M12 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-7-7z M9 7h1',
  Terminal: 'M4 17l6-6-6-6 M12 19h8',
  Bug: 'M12 8a4 4 0 0 1 4 4v1h1a3 3 0 0 1 3 3v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a3 3 0 0 1 3-3h1v-1a4 4 0 0 1 4-4z M8 4v4 M16 4v4 M12 2v2',
  Shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  ShieldAlert: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M12 8v4 M12 16h.01',
  Edit3: 'M12 20h9 M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z',
  Eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  Variable: 'M6 3v18 M18 3v18 M6 12h12',
  Minus: 'M5 12h14',
  Cpu: 'M4 4h16v16H4z M9 9h6v6H9z M9 1v3 M15 1v3 M9 20v3 M15 20v3 M20 9h3 M20 14h3 M1 9h3 M1 14h3',
};

/**
 * Render an SVG icon
 */
export function renderIcon(name: string, size: number = 24, color?: string): string {
  const path = IconPaths[name] || IconPaths.Box;
  const fill = color || 'currentColor';
  
  return `
    <svg 
      width="${size}" 
      height="${size}" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="${fill}" 
      stroke-width="2" 
      stroke-linecap="round" 
      stroke-linejoin="round"
    >
      <path d="${path}" />
    </svg>
  `;
}

export default {
  NodeIcons,
  CategoryIcons,
  CategoryColors,
  IconSizes,
  IconPaths,
  getCategoryIcon,
  getNodeIcon,
  getCategoryColor,
  getIconSize,
  renderIcon,
};

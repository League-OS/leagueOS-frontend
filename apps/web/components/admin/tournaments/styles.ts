import type { CSSProperties } from 'react';

export const displayFontStack = '"Sora", "Space Grotesk", "Avenir Next", "Segoe UI", sans-serif';
export const bodyFontStack = '"Manrope", "IBM Plex Sans", "Avenir Next", "Segoe UI", sans-serif';

export const card: CSSProperties = {
  border: '1px solid #d2ddd7',
  borderRadius: 12,
  background: 'rgba(255, 255, 255, 0.88)',
  backdropFilter: 'blur(8px)',
  padding: 10,
  boxShadow: '0 8px 18px rgba(22, 35, 30, 0.07)',
};

export const subCard: CSSProperties = {
  border: '1px solid #d6e2db',
  borderRadius: 10,
  background: '#f9fcfa',
  padding: 9,
};

export const insightCard: CSSProperties = {
  border: '1px solid #bdd8cb',
  borderRadius: 10,
  background: 'linear-gradient(135deg, #f4fbf8 0%, #eef8f3 100%)',
  padding: 9,
};

export const field: CSSProperties = {
  width: '100%',
  border: '1px solid #c3d2ca',
  borderRadius: 8,
  background: '#fff',
  minHeight: 34,
  padding: '6px 9px',
  fontSize: 13,
  color: '#1d2d28',
};

export const primaryBtn: CSSProperties = {
  border: 0,
  borderRadius: 9,
  background: 'linear-gradient(92deg, #12856b, #1b9f78)',
  color: '#fff',
  padding: '7px 11px',
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
};

export const disabledSaveBtn: CSSProperties = {
  border: '1px solid #ccd7d0',
  borderRadius: 9,
  background: '#e3e9e6',
  color: '#71807a',
  padding: '7px 11px',
  fontWeight: 700,
  fontSize: 13,
  cursor: 'not-allowed',
};

export const outlineBtn: CSSProperties = {
  border: '1px solid #c3d2ca',
  borderRadius: 9,
  background: '#fff',
  color: '#17302a',
  padding: '7px 10px',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
};

export const addIconBtn: CSSProperties = {
  width: 28,
  height: 28,
  border: '1px solid #0f7c64',
  borderRadius: 8,
  background: 'linear-gradient(110deg, #12856b, #1b9f78)',
  color: '#fff',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  cursor: 'pointer',
  boxShadow: '0 5px 12px rgba(18, 133, 107, 0.25)',
};

export const tabBtn: CSSProperties = {
  width: '100%',
  border: '1px solid transparent',
  borderBottom: '1px solid #bfd0c8',
  borderRadius: '10px 10px 0 0',
  background: 'linear-gradient(180deg, #f5faf7 0%, #edf3ef 100%)',
  color: '#2b3f38',
  padding: '9px 12px',
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
  letterSpacing: '0.01em',
  transition: 'transform 180ms ease, background 220ms ease, border-color 220ms ease, color 220ms ease',
};

export const tabBtnActive: CSSProperties = {
  width: '100%',
  border: '1px solid #0f7c64',
  borderBottom: '1px solid #f9fcfa',
  borderRadius: '10px 10px 0 0',
  background: 'linear-gradient(105deg, #12856b, #1ba477)',
  color: '#fff',
  padding: '9px 12px',
  fontWeight: 700,
  fontSize: 13,
  letterSpacing: '0.01em',
  cursor: 'pointer',
  transform: 'translateY(1px)',
  boxShadow: '0 -3px 10px rgba(16, 126, 99, 0.25)',
};

export const pill: CSSProperties = {
  border: '1px solid #9fd5bf',
  color: '#115f4b',
  borderRadius: 999,
  padding: '2px 8px',
  fontWeight: 700,
  fontSize: 11,
  background: '#ebf8f1',
};

export const savedBadge: CSSProperties = {
  border: '1px solid #a8dac5',
  color: '#0f5f49',
  borderRadius: 999,
  padding: '3px 8px',
  fontWeight: 700,
  fontSize: 11,
  background: '#ebf8f1',
};

export const labelCol: CSSProperties = {
  display: 'grid',
  gap: 4,
  color: '#30443d',
  fontSize: 12.5,
};

export const grid2: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
  gap: 9,
};

export const grid3: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
  gap: 9,
};

export const grid4: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: 9,
};

export const th: CSSProperties = {
  textAlign: 'left',
  borderBottom: '1px solid #d8e2dc',
  padding: 7,
  fontSize: 11.5,
  color: '#5f6f68',
};

export const td: CSSProperties = {
  borderBottom: '1px solid #ebf1ed',
  padding: 7,
  fontSize: 12.5,
  color: '#1d2e29',
};

export const textLinkBtn: CSSProperties = {
  border: 0,
  background: 'transparent',
  color: '#0f8c7a',
  textDecoration: 'none',
  padding: 0,
  fontSize: 13,
  fontWeight: 600,
  lineHeight: 1.25,
  cursor: 'pointer',
  display: 'inline-block',
};

export const collapseBtn: CSSProperties = {
  width: '100%',
  border: '1px solid #d1ddd7',
  borderRadius: 9,
  background: '#f6faf8',
  color: '#1a2b26',
  padding: '7px 10px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  cursor: 'pointer',
};

export const modalBackdrop: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(2, 6, 23, 0.35)',
  display: 'grid',
  placeItems: 'center',
  zIndex: 40,
  padding: 12,
};

export const modalCard: CSSProperties = {
  width: '100%',
  maxWidth: 460,
  border: '1px solid #cedad3',
  borderRadius: 11,
  background: '#fff',
  padding: 10,
  boxShadow: '0 12px 26px rgba(15, 33, 27, 0.18)',
};

export const sectionHeader: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  border: '1px solid #d4e1da',
  borderRadius: 10,
  background: 'linear-gradient(120deg, #f8fcfa 0%, #f2f8f4 100%)',
  padding: '7px 9px',
};

export const saveRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
};

export const editFieldset: CSSProperties = {
  margin: 0,
  padding: 0,
  border: 0,
  display: 'grid',
  gap: 9,
};

export const viewModeBadge: CSSProperties = {
  border: '1px solid #cfd8d3',
  borderRadius: 999,
  background: '#f2f6f4',
  color: '#5e6f68',
  padding: '2px 8px',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.02em',
};

export const editModeBadge: CSSProperties = {
  border: '1px solid #8ed0b3',
  borderRadius: 999,
  background: '#e9f8f0',
  color: '#0e6048',
  padding: '2px 8px',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.02em',
};

export const warnBtn: CSSProperties = {
  border: '1px solid #edc38e',
  borderRadius: 9,
  background: '#fff7ec',
  color: '#8a4d0f',
  padding: '7px 10px',
  fontWeight: 700,
  fontSize: 12.5,
  cursor: 'pointer',
};

export const heroBlock: CSSProperties = {
  border: '1px solid #d5e1da',
  borderRadius: 12,
  padding: '10px 12px',
  background: 'linear-gradient(130deg, rgba(255,255,255,0.84) 0%, rgba(248,252,250,0.92) 100%)',
  boxShadow: '0 8px 20px rgba(20, 33, 29, 0.07)',
};

export function saveEnabledStyle(enabled: boolean): CSSProperties {
  return enabled ? primaryBtn : disabledSaveBtn;
}

export function revealStyle(mounted: boolean, delayMs: number): CSSProperties {
  return {
    opacity: mounted ? 1 : 0,
    transform: mounted ? 'translateY(0)' : 'translateY(8px)',
    transition: `opacity 340ms ease ${delayMs}ms, transform 340ms ease ${delayMs}ms`,
  };
}

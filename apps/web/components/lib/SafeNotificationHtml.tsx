'use client';

import { useEffect, useState, type CSSProperties } from 'react';

const ALLOWED_TAGS = new Set([
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'em',
  'h1',
  'h2',
  'h3',
  'hr',
  'img',
  'i',
  'li',
  'ol',
  'p',
  'pre',
  'span',
  'strong',
  'u',
  'ul',
]);

const SELF_CLOSING_TAGS = new Set(['br', 'hr']);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeHtmlWithBreaks(value: string): string {
  return escapeHtml(value).replace(/\n/g, '<br />');
}

function sanitizeUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith('#')) return value;
  try {
    const url = new URL(value, 'https://leagueos.local');
    if (!['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)) return null;
    return value;
  } catch {
    return null;
  }
}

function sanitizeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeHtml(node.textContent || '');
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();
  const children = Array.from(element.childNodes).map(sanitizeNode).join('');

  if (!ALLOWED_TAGS.has(tag)) {
    return children;
  }

  if (tag === 'a') {
    const href = sanitizeUrl(element.getAttribute('href') || '');
    const text = children || escapeHtml(element.textContent || '');
    if (!href) return text;
    return `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer noopener">${text}</a>`;
  }

  if (tag === 'img') {
    const src = sanitizeUrl(element.getAttribute('src') || '');
    if (!src) return '';
    const alt = escapeHtml(element.getAttribute('alt') || '');
    const title = escapeHtml(element.getAttribute('title') || '');
    return `<img src="${escapeHtml(src)}" alt="${alt}" title="${title}" style="max-width:100%;height:auto;border-radius:12px;" />`;
  }

  if (SELF_CLOSING_TAGS.has(tag)) {
    return `<${tag} />`;
  }

  return `<${tag}>${children}</${tag}>`;
}

function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return escapeHtmlWithBreaks(html);
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const container = doc.body.firstElementChild;
  if (!container) return '';
  return Array.from(container.childNodes).map(sanitizeNode).join('');
}

export function SafeNotificationHtml({ html, style }: { html: string; style?: CSSProperties }) {
  const [sanitized, setSanitized] = useState(() => escapeHtmlWithBreaks(html));

  useEffect(() => {
    setSanitized(sanitizeHtml(html));
  }, [html]);

  return <div suppressHydrationWarning style={style} dangerouslySetInnerHTML={{ __html: sanitized }} />;
}

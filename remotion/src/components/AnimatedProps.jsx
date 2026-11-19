import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';

/**
 * Animated Vector Props & Story Objects for Explainer Videos.
 * Clean, scalable SVGs animated with Remotion springs and interpolations.
 */

// 1. Money Stack with flying currency notes and Rupee symbol
export function MoneyStackProp({amount = '₹10 LAKH', count = 4, size = 180, style = {}}) {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const floatY = Math.sin(frame / 14) * 6;

  return (
    <div style={{width: size, height: size, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', ...style}}>
      <svg viewBox="0 0 160 160" width={size} height={size} fill="none" style={{overflow: 'visible'}}>
        <defs>
          <filter id="propShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="8" stdDeviation="6" floodColor="rgba(0,0,0,0.35)" />
          </filter>
        </defs>

        {/* Stack of banknotes with progressive entrance */}
        {Array.from({length: count}).map((_, i) => {
          const delay = i * 4;
          const s = spring({frame: Math.max(0, frame - delay), fps, config: {damping: 12, stiffness: 120}});
          const yOffset = 110 - i * 16 + floatY * (1 - i * 0.15);
          const rot = (i % 2 === 0 ? 1 : -1) * (i * 2.5);

          return (
            <g key={i} transform={`translate(20, ${yOffset}) rotate(${rot}, 60, 20) scale(${s})`} filter="url(#propShadow)">
              <rect x="0" y="0" width="120" height="55" rx="6" fill="#16a34a" stroke="#22c55e" strokeWidth="2.5" />
              <rect x="6" y="5" width="108" height="45" rx="4" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeDasharray="4 2" />
              <circle cx="60" cy="27.5" r="14" fill="#15803d" stroke="#4ade80" strokeWidth="1.5" />
              <text x="60" y="34" fill="#ffffff" fontSize="18" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">₹</text>
              <text x="14" y="22" fill="#bbf7d0" fontSize="10" fontWeight="bold" fontFamily="sans-serif">₹</text>
              <text x="106" y="44" fill="#bbf7d0" fontSize="10" fontWeight="bold" fontFamily="sans-serif">₹</text>
            </g>
          );
        })}
      </svg>
      {amount && (
        <div style={{
          position: 'absolute',
          bottom: -10,
          background: 'linear-gradient(135deg, #22c55e, #16a34a)',
          color: '#ffffff',
          fontWeight: 900,
          fontSize: Math.round(size * 0.11),
          padding: '4px 12px',
          borderRadius: '999px',
          boxShadow: '0 4px 14px rgba(34, 197, 94, 0.4)',
          letterSpacing: '-0.2px',
          whiteSpace: 'nowrap'
        }}>
          {amount}
        </div>
      )}
    </div>
  );
}

// 2. Invoice Sheet with Due Stamp & Calendar Delay
export function InvoiceProp({label = 'INVOICE', amount = '₹8,00,000', status = '60 DAYS DUE', size = 180, style = {}}) {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const enter = spring({frame, fps, config: {damping: 14, stiffness: 110}});
  const stampSpring = spring({frame: Math.max(0, frame - 14), fps, config: {damping: 10, stiffness: 160}});

  return (
    <div style={{width: size, height: size * 1.3, position: 'relative', transform: `scale(${enter})`, ...style}}>
      <svg viewBox="0 0 140 180" width={size} height={size * 1.3} fill="none" style={{overflow: 'visible'}}>
        <defs>
          <filter id="invShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="10" stdDeviation="8" floodColor="rgba(0,0,0,0.4)" />
          </filter>
        </defs>

        {/* Paper Sheet */}
        <g filter="url(#invShadow)">
          <path d="M 10 10 L 105 10 L 130 35 L 130 170 L 10 170 Z" fill="#ffffff" stroke="#cbd5e1" strokeWidth="2" />
          {/* Folded corner */}
          <path d="M 105 10 L 105 35 L 130 35 Z" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1.5" />

          {/* Header */}
          <rect x="22" y="24" width="45" height="10" rx="3" fill="#3b82f6" />
          <text x="25" y="32" fill="#ffffff" fontSize="7" fontWeight="bold" fontFamily="sans-serif">{label}</text>

          {/* Lines representing invoice entries */}
          <line x1="22" y1="52" x2="118" y2="52" stroke="#e2e8f0" strokeWidth="3" strokeLinecap="round" />
          <line x1="22" y1="66" x2="118" y2="66" stroke="#f1f5f9" strokeWidth="3" strokeLinecap="round" />
          <line x1="22" y1="80" x2="95" y2="80" stroke="#f1f5f9" strokeWidth="3" strokeLinecap="round" />
          <line x1="22" y1="94" x2="118" y2="94" stroke="#f1f5f9" strokeWidth="3" strokeLinecap="round" />

          {/* Divider */}
          <line x1="22" y1="112" x2="118" y2="112" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="3 3" />

          {/* Total amount */}
          <text x="22" y="132" fill="#64748b" fontSize="8" fontWeight="600" fontFamily="sans-serif">TOTAL DUE</text>
          <text x="22" y="148" fill="#0f172a" fontSize="13" fontWeight="900" fontFamily="sans-serif">{amount}</text>

          {/* Stamp Reveal (DUE / 60 DAYS) */}
          <g transform={`translate(52, 105) rotate(-14) scale(${stampSpring})`} opacity={stampSpring}>
            <rect x="0" y="0" width="76" height="26" rx="4" fill="rgba(239, 68, 68, 0.12)" stroke="#ef4444" strokeWidth="2.5" />
            <text x="38" y="17" fill="#ef4444" fontSize="9.5" fontWeight="900" textAnchor="middle" fontFamily="sans-serif" letterSpacing="0.5">
              {status}
            </text>
          </g>
        </g>
      </svg>
    </div>
  );
}

// 3. Glass Barrier Locking Cash ("Cash Trapped")
export function GlassBarrierProp({size = 220, label = 'CASH TRAPPED', style = {}}) {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const pulse = 0.95 + 0.05 * Math.sin(frame / 16);
  const shimmer = (frame * 3) % 240;

  return (
    <div style={{width: size, height: size * 0.9, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', ...style}}>
      <svg viewBox="0 0 200 180" width={size} height={size * 0.9} fill="none" style={{overflow: 'visible'}}>
        <defs>
          <linearGradient id="glassGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.4)" />
            <stop offset="45%" stopColor="rgba(255,255,255,0.1)" />
            <stop offset="100%" stopColor="rgba(56,189,248,0.25)" />
          </linearGradient>
        </defs>

        {/* Cash trapped behind */}
        <g opacity="0.65" transform="translate(45, 45) scale(0.9)">
          <rect x="0" y="15" width="100" height="50" rx="4" fill="#15803d" />
          <rect x="5" y="0" width="100" height="50" rx="4" fill="#22c55e" />
          <circle cx="55" cy="25" r="12" fill="#15803d" />
          <text x="55" y="32" fill="#ffffff" fontSize="16" fontWeight="bold" textAnchor="middle">₹</text>
        </g>

        {/* Thick Glass Barrier */}
        <g transform={`scale(${pulse})`} transformOrigin="100 90">
          <rect
            x="15" y="15" width="170" height="150" rx="14"
            fill="url(#glassGrad)"
            stroke="rgba(255, 255, 255, 0.6)"
            strokeWidth="3"
          />

          {/* Diagonal Glass Reflection Highlight */}
          <path
            d={`M ${15 + shimmer} 15 L ${-25 + shimmer} 165 L ${-5 + shimmer} 165 L ${35 + shimmer} 15 Z`}
            fill="rgba(255,255,255,0.18)"
            style={{mixBlendMode: 'overlay'}}
          />

          {/* Heavy Padlock Icon */}
          <g transform="translate(85, 65)">
            <path d="M 6 15 L 6 9 C 6 2, 24 2, 24 9 L 24 15" stroke="#f59e0b" strokeWidth="4.5" strokeLinecap="round" fill="none" />
            <rect x="0" y="14" width="30" height="24" rx="5" fill="#f59e0b" stroke="#d97706" strokeWidth="2" />
            <circle cx="15" cy="24" r="3" fill="#78350f" />
            <line x1="15" y1="26" x2="15" y2="32" stroke="#78350f" strokeWidth="2.5" strokeLinecap="round" />
          </g>
        </g>
      </svg>

      {/* Warning Barrier Tape / Badge */}
      <div style={{
        position: 'absolute',
        bottom: 8,
        background: 'rgba(239, 68, 68, 0.95)',
        color: '#ffffff',
        fontWeight: 900,
        fontSize: Math.round(size * 0.08),
        padding: '5px 14px',
        borderRadius: '6px',
        border: '2px solid #ffffff',
        letterSpacing: '0.8px',
        boxShadow: '0 6px 20px rgba(239, 68, 68, 0.5)'
      }}>
        🔒 {label}
      </div>
    </div>
  );
}

// 4. Calendar Flip Clock showing payment delay (e.g. 60 Days Gap)
export function CalendarClockProp({days = '60', subtitle = 'DAYS DELAY', size = 180, style = {}}) {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const flip = spring({frame, fps, config: {damping: 12, stiffness: 100}});

  return (
    <div style={{width: size, height: size, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', ...style}}>
      <svg viewBox="0 0 160 160" width={size} height={size} fill="none" style={{overflow: 'visible'}}>
        <defs>
          <filter id="calShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="8" stdDeviation="6" floodColor="rgba(0,0,0,0.3)" />
          </filter>
        </defs>

        <g filter="url(#calShadow)">
          {/* Calendar Body */}
          <rect x="20" y="30" width="120" height="110" rx="12" fill="#ffffff" stroke="#e2e8f0" strokeWidth="2" />
          {/* Header Banner (Red/Crimson) */}
          <path d="M 20 42 C 20 35, 25 30, 32 30 L 128 30 C 135 30, 140 35, 140 42 L 140 60 L 20 60 Z" fill="#ef4444" />

          {/* Binder Rings */}
          <rect x="42" y="20" width="10" height="18" rx="4" fill="#64748b" />
          <rect x="108" y="20" width="10" height="18" rx="4" fill="#64748b" />

          {/* Large Days Number */}
          <g transform={`scale(${flip})`} transformOrigin="80 95">
            <text x="80" y="105" fill="#0f172a" fontSize="42" fontWeight="900" textAnchor="middle" fontFamily="sans-serif">
              {days}
            </text>
            <text x="80" y="125" fill="#ef4444" fontSize="10.5" fontWeight="800" textAnchor="middle" fontFamily="sans-serif" letterSpacing="1">
              {subtitle}
            </text>
          </g>
        </g>
      </svg>
    </div>
  );
}

// 5. Balance Scale (Inflow vs Outflow / Revenue vs Cash Flow)
export function BalanceScaleProp({inflow = '₹10L IN', outflow = '₹8L OUT', tilt = 12, size = 200, style = {}}) {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const osc = Math.sin(frame / 15) * 4;
  const currentTilt = tilt + osc;

  return (
    <div style={{width: size, height: size * 0.9, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', ...style}}>
      <svg viewBox="0 0 200 180" width={size} height={size * 0.9} fill="none" style={{overflow: 'visible'}}>
        {/* Base and Pole */}
        <path d="M 85 165 L 115 165 L 105 50 L 95 50 Z" fill="#475569" />
        <ellipse cx="100" cy="165" rx="35" ry="8" fill="#334155" />
        <circle cx="100" cy="50" r="7" fill="#f59e0b" />

        {/* Tilting Fulcrum Crossbeam */}
        <g transform={`rotate(${currentTilt}, 100, 50)`}>
          <line x1="30" y1="50" x2="170" y2="50" stroke="#f59e0b" strokeWidth="5" strokeLinecap="round" />

          {/* Left Pan (Inflow / Heavier or Lighter) */}
          <g transform="translate(30, 50)">
            <line x1="0" y1="0" x2="-18" y2="45" stroke="#94a3b8" strokeWidth="1.5" />
            <line x1="0" y1="0" x2="18" y2="45" stroke="#94a3b8" strokeWidth="1.5" />
            <path d="M -24 45 C -24 60, 24 60, 24 45 Z" fill="#22c55e" stroke="#16a34a" strokeWidth="2" />
            <text x="0" y="55" fill="#ffffff" fontSize="7" fontWeight="bold" textAnchor="middle">₹</text>
          </g>

          {/* Right Pan (Outflow) */}
          <g transform="translate(170, 50)">
            <line x1="0" y1="0" x2="-18" y2="45" stroke="#94a3b8" strokeWidth="1.5" />
            <line x1="0" y1="0" x2="18" y2="45" stroke="#94a3b8" strokeWidth="1.5" />
            <path d="M -24 45 C -24 60, 24 60, 24 45 Z" fill="#ef4444" stroke="#dc2626" strokeWidth="2" />
            <text x="0" y="55" fill="#ffffff" fontSize="7" fontWeight="bold" textAnchor="middle">₹</text>
          </g>
        </g>
      </svg>
    </div>
  );
}

// 6. Delivery Order Boxes Stacking Up
export function OrderBoxesProp({count = 3, size = 180, style = {}}) {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  return (
    <div style={{width: size, height: size, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', ...style}}>
      <svg viewBox="0 0 160 160" width={size} height={size} fill="none" style={{overflow: 'visible'}}>
        {/* Base shadow */}
        <ellipse cx="80" cy="142" rx="55" ry="10" fill="rgba(0,0,0,0.25)" />

        {/* Box 1 (Bottom) */}
        <g transform="translate(35, 80)">
          <rect x="0" y="0" width="90" height="55" rx="4" fill="#d97706" stroke="#b45309" strokeWidth="2" />
          <line x1="45" y1="0" x2="45" y2="55" stroke="#92400e" strokeWidth="10" />
          <rect x="60" y="12" width="22" height="15" rx="2" fill="#ffffff" />
          <line x1="64" y1="17" x2="78" y2="17" stroke="#000" strokeWidth="1.5" />
          <line x1="64" y1="21" x2="74" y2="21" stroke="#000" strokeWidth="1.5" />
        </g>

        {/* Box 2 (Top Left) */}
        <g transform="translate(25, 35) rotate(-6, 25, 35)">
          <rect x="0" y="0" width="60" height="48" rx="4" fill="#f59e0b" stroke="#d97706" strokeWidth="2" />
          <line x1="30" y1="0" x2="30" y2="48" stroke="#b45309" strokeWidth="8" />
        </g>

        {/* Box 3 (Top Right) */}
        <g transform="translate(80, 42) rotate(4, 80, 42)">
          <rect x="0" y="0" width="55" height="44" rx="4" fill="#fbbf24" stroke="#d97706" strokeWidth="2" />
          <line x1="27" y1="0" x2="27" y2="44" stroke="#b45309" strokeWidth="7" />
        </g>
      </svg>
    </div>
  );
}

// 7. General Purpose Prop Dispatcher
export function AnimatedProp({type = 'money_stack', size = 180, ...rest}) {
  switch (type) {
    case 'money_stack':
    case 'money':
    case 'cash':
      return <MoneyStackProp size={size} {...rest} />;
    case 'invoice':
    case 'bill':
      return <InvoiceProp size={size} {...rest} />;
    case 'glass_barrier':
    case 'barrier':
    case 'cash_trapped':
      return <GlassBarrierProp size={size} {...rest} />;
    case 'calendar':
    case 'clock':
    case 'delay':
      return <CalendarClockProp size={size} {...rest} />;
    case 'scale':
    case 'balance':
      return <BalanceScaleProp size={size} {...rest} />;
    case 'boxes':
    case 'orders':
      return <OrderBoxesProp size={size} {...rest} />;
    default:
      return <MoneyStackProp size={size} {...rest} />;
  }
}

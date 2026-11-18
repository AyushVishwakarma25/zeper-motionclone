import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';

/**
 * Finance & Business Data Visualization Primitives for Remotion.
 * Dynamic, frame-accurate animated charts and financial diagrams.
 */

// 1. Cash Flow Stream / Split Diagram
export function CashFlowSplit({
  revenue = '₹10 LAKH SALES',
  splits = [
    {label: 'Suppliers', amount: '₹6 Lakh', pct: 60, color: '#ef4444'},
    {label: 'Salaries & Rent', amount: '₹2 Lakh', pct: 20, color: '#f59e0b'},
    {label: 'Net Cash Left', amount: '₹2 Lakh (Trapped)', pct: 20, color: '#38bdf8'}
  ],
  size = 400,
  style = {}
}) {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const enter = spring({frame, fps, config: {damping: 14, stiffness: 100}});

  return (
    <div style={{
      width: '100%',
      maxWidth: size,
      background: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(16px)',
      border: '1px solid rgba(255, 255, 255, 0.12)',
      borderRadius: '16px',
      padding: '24px',
      transform: `scale(${enter})`,
      boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
      ...style
    }}>
      {/* Top Total Bar */}
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px'}}>
        <span style={{fontSize: '13px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px'}}>Total Inflow</span>
        <span style={{fontSize: '17px', fontWeight: 900, color: '#22c55e'}}>{revenue}</span>
      </div>

      {/* Progress Track */}
      <div style={{height: '14px', width: '100%', display: 'flex', borderRadius: '7px', overflow: 'hidden', marginBottom: '20px', background: '#334155'}}>
        {splits.map((s, idx) => {
          const barProgress = spring({
            frame: Math.max(0, frame - 10 - idx * 6),
            fps,
            config: {damping: 16, stiffness: 120}
          });
          return (
            <div
              key={idx}
              style={{
                width: `${s.pct * barProgress}%`,
                background: s.color,
                transition: 'width 0.2s'
              }}
            />
          );
        })}
      </div>

      {/* Breakdown Rows */}
      <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
        {splits.map((s, idx) => {
          const rowProgress = spring({
            frame: Math.max(0, frame - 15 - idx * 8),
            fps,
            config: {damping: 14, stiffness: 120}
          });
          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                background: 'rgba(255, 255, 255, 0.04)',
                borderLeft: `4px solid ${s.color}`,
                borderRadius: '6px',
                opacity: rowProgress,
                transform: `translateX(${(1 - rowProgress) * 20}px)`
              }}
            >
              <span style={{fontSize: '13px', fontWeight: 600, color: '#e2e8f0'}}>{s.label}</span>
              <span style={{fontSize: '14px', fontWeight: 800, color: s.color}}>{s.amount}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 2. Timeline Gap Visualization (e.g. Day 0 to Day 60 Cash Gap)
export function TimelineGap({
  startLabel = 'Day 0: Product Delivered',
  endLabel = 'Day 60: Customer Pays',
  gapText = '60 DAYS ZERO CASH',
  style = {}
}) {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const lineProgress = spring({frame, fps, config: {damping: 18, stiffness: 90}});
  const alertProgress = spring({frame: Math.max(0, frame - 20), fps, config: {damping: 12, stiffness: 140}});

  return (
    <div style={{
      width: '100%',
      maxWidth: '460px',
      background: 'rgba(10, 14, 26, 0.85)',
      backdropFilter: 'blur(16px)',
      border: '1px solid rgba(255, 255, 255, 0.12)',
      borderRadius: '16px',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
      ...style
    }}>
      <div style={{fontSize: '14px', fontWeight: 800, color: '#f87171', letterSpacing: '0.4px', textTransform: 'uppercase'}}>
        The Working Capital Trap
      </div>

      {/* Horizontal Line with Start and End Pins */}
      <div style={{position: 'relative', height: '60px', display: 'flex', alignItems: 'center'}}>
        {/* Connecting track */}
        <div style={{position: 'absolute', left: '16px', right: '16px', height: '6px', background: '#334155', borderRadius: '3px'}} />
        {/* Animated fill track */}
        <div style={{
          position: 'absolute',
          left: '16px',
          width: `calc((100% - 32px) * ${lineProgress})`,
          height: '6px',
          background: 'linear-gradient(90deg, #22c55e, #ef4444)',
          borderRadius: '3px'
        }} />

        {/* Start Pin */}
        <div style={{position: 'absolute', left: '0', display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
          <div style={{width: '20px', height: '20px', borderRadius: '50%', background: '#22c55e', border: '3px solid #fff', boxShadow: '0 0 10px rgba(34,197,94,0.6)'}} />
        </div>

        {/* End Pin */}
        <div style={{position: 'absolute', right: '0', display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
          <div style={{width: '20px', height: '20px', borderRadius: '50%', background: '#ef4444', border: '3px solid #fff', boxShadow: '0 0 10px rgba(239,68,68,0.6)'}} />
        </div>
      </div>

      {/* Labels below pins */}
      <div style={{display: 'flex', justifyContent: 'space-between', marginTop: '-12px', fontSize: '11.5px', color: '#94a3b8', fontWeight: 600}}>
        <span>{startLabel}</span>
        <span style={{textAlign: 'right'}}>{endLabel}</span>
      </div>

      {/* Danger Zone Badge */}
      <div style={{
        background: 'rgba(239, 68, 68, 0.15)',
        border: '1.5px dashed #ef4444',
        borderRadius: '10px',
        padding: '12px',
        textAlign: 'center',
        transform: `scale(${alertProgress})`,
        opacity: alertProgress
      }}>
        <div style={{color: '#f87171', fontWeight: 900, fontSize: '16px', letterSpacing: '0.5px'}}>
          ⚠️ {gapText}
        </div>
        <div style={{color: '#cbd5e1', fontSize: '11px', marginTop: '4px'}}>
          Rent &amp; salaries due immediately while funds remain locked.
        </div>
      </div>
    </div>
  );
}

// 3. Dynamic Animated Bar Chart
export function AnimatedBarChart({
  title = 'Revenue vs. Cash Received',
  bars = [
    {label: 'On Paper Sales', value: 10, unit: 'Lakh', color: '#22c55e'},
    {label: 'Actual Cash in Bank', value: 2, unit: 'Lakh', color: '#ef4444'}
  ],
  maxValue = 12,
  size = 420,
  style = {}
}) {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const enter = spring({frame, fps, config: {damping: 14, stiffness: 100}});

  return (
    <div style={{
      width: '100%',
      maxWidth: size,
      background: 'rgba(15, 23, 42, 0.8)',
      backdropFilter: 'blur(16px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '16px',
      padding: '24px',
      transform: `scale(${enter})`,
      ...style
    }}>
      <div style={{fontSize: '15px', fontWeight: 800, color: '#f1f5f9', marginBottom: '20px'}}>{title}</div>

      <div style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
        {bars.map((bar, idx) => {
          const barSpring = spring({
            frame: Math.max(0, frame - 12 - idx * 10),
            fps,
            config: {damping: 15, stiffness: 100}
          });
          const widthPct = (bar.value / maxValue) * 100 * barSpring;
          const displayVal = (bar.value * barSpring).toFixed(1);

          return (
            <div key={idx} style={{display: 'flex', flexDirection: 'column', gap: '6px'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, color: '#cbd5e1'}}>
                <span>{bar.label}</span>
                <span style={{color: bar.color}}>₹{displayVal} {bar.unit}</span>
              </div>
              <div style={{height: '18px', width: '100%', background: '#334155', borderRadius: '9px', overflow: 'hidden'}}>
                <div style={{
                  height: '100%',
                  width: `${widthPct}%`,
                  background: `linear-gradient(90deg, ${bar.color}aa, ${bar.color})`,
                  borderRadius: '9px',
                  boxShadow: `0 0 12px ${bar.color}66`
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

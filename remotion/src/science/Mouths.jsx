import React from 'react';

const T = '#4a1d1a', TEETH = '#fff', TONGUE = '#e86a73';
/** The nine mouth shapes as vector drawings (Preston Blair / Rhubarb set A-H + X), centred at (0,0), ~46 px wide. */
export function Mouth({shape = 'X', mood = 'neutral', s = 1}) {
  const g = (children) => <g transform={`scale(${s})`}>{children}</g>;
  switch (shape) {
    case 'A': return g(<path d="M-17,0 Q0,3 17,0" fill="none" stroke={T} strokeWidth="5" strokeLinecap="round" />);
    case 'B': return g(<><path d="M-19,-3 Q0,-7 19,-3 Q0,9 -19,-3Z" fill={T} /><path d="M-15,-3 Q0,-5.5 15,-3 L14,1 Q0,-1 -14,1Z" fill={TEETH} /></>);
    case 'C': return g(<><ellipse cy="2" rx="17" ry="11" fill={T} /><path d="M-13,-4 Q0,-8 13,-4 L12,0 Q0,-3 -12,0Z" fill={TEETH} /></>);
    case 'D': return g(<><ellipse cy="4" rx="19" ry="17" fill={T} /><path d="M-15,-8 Q0,-13 15,-8 L14,-3 Q0,-7 -14,-3Z" fill={TEETH} /><ellipse cy="12" rx="11" ry="6" fill={TONGUE} /></>);
    case 'E': return g(<><ellipse cy="3" rx="12" ry="12" fill={T} /><ellipse cy="9" rx="7" ry="4" fill={TONGUE} /></>);
    case 'F': return g(<><ellipse cy="2" rx="8" ry="9" fill={T} /></>);
    case 'G': return g(<><path d="M-18,-4 Q0,-9 18,-4 Q0,6 -18,-4Z" fill={T} /><path d="M-13,-5 Q0,-8 13,-5 L12,-1 Q0,-3 -12,-1Z" fill={TEETH} /><path d="M-12,2 Q0,7 12,2" fill="none" stroke="#c9645c" strokeWidth="4" strokeLinecap="round" /></>);
    case 'H': return g(<><ellipse cy="3" rx="15" ry="11" fill={T} /><path d="M-12,-4 Q0,-8 12,-4 L11,-1 Q0,-3 -11,-1Z" fill={TEETH} /><ellipse cy="5" rx="9" ry="5" fill={TONGUE} /></>);
    default: // X = rest, expression-dependent
      return mood === 'smile' || mood === 'cheer' ? g(<path d="M-17,-3 Q0,13 17,-3" fill="none" stroke={T} strokeWidth="5" strokeLinecap="round" />)
        : mood === 'worried' || mood === 'sad' ? g(<path d="M-14,5 Q0,-5 14,5" fill="none" stroke={T} strokeWidth="5" strokeLinecap="round" />)
        : mood === 'surprised' ? g(<ellipse rx="8" ry="10" fill={T} />)
        : g(<path d="M-13,1 L13,1" fill="none" stroke={T} strokeWidth="5" strokeLinecap="round" />);
  }
}
export default Mouth;

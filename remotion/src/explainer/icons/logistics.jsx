import React from 'react';
import {clamp, ease, hash, lerp, prog} from '../anim.mjs';
import {C} from './theme.mjs';

const Svg = ({children}) => (
  <svg viewBox="0 0 400 400" width="100%" height="100%" style={{overflow: 'visible'}}>
    {children}
  </svg>
);

/**
 * City map with warehouse / dark-store icons and pulsing radar beacons popping up.
 */
export function CityMap({t, d, pulse = true}) {
  const enter = prog(t, 0.05, 0.45, ease.back);
  const roadFlow = (t * 40) % 60;

  // 4 warehouse locations across the city grid
  const hubs = [
    {x: 110, y: 150, delay: 0.15, label: 'Hub 1'},
    {x: 290, y: 130, delay: 0.35, label: 'Hub 2'},
    {x: 210, y: 250, delay: 0.55, label: 'Main'},
    {x: 100, y: 310, delay: 0.75, label: 'Hub 3'}
  ];

  return (
    <Svg>
      {/* City Map Base Card */}
      <g transform={`translate(200 200) scale(${0.7 + 0.3 * enter}) translate(-200 -200)`} opacity={clamp(enter * 2)}>
        <rect x="30" y="40" width="340" height="320" rx="20" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="4" />

        {/* City Blocks (Buildings / Zones) */}
        <rect x="50" y="60" width="70" height="50" rx="8" fill="#edf2f7" />
        <rect x="140" y="60" width="100" height="50" rx="8" fill="#edf2f7" />
        <rect x="260" y="60" width="90" height="50" rx="8" fill="#edf2f7" />

        <rect x="50" y="190" width="80" height="70" rx="8" fill="#edf2f7" />
        <rect x="270" y="190" width="80" height="70" rx="8" fill="#edf2f7" />

        <rect x="150" y="300" width="90" height="40" rx="8" fill="#edf2f7" />
        <rect x="260" y="300" width="90" height="40" rx="8" fill="#edf2f7" />

        {/* Grid Roads */}
        {/* Horizontal main avenues */}
        <line x1="30" y1="130" x2="370" y2="130" stroke="#cbd5e1" strokeWidth="16" strokeLinecap="round" />
        <line x1="30" y1="130" x2="370" y2="130" stroke="#f1f5f9" strokeWidth="2" strokeDasharray="10 8" strokeDashoffset={-roadFlow} />

        <line x1="30" y1="280" x2="370" y2="280" stroke="#cbd5e1" strokeWidth="16" strokeLinecap="round" />
        <line x1="30" y1="280" x2="370" y2="280" stroke="#f1f5f9" strokeWidth="2" strokeDasharray="10 8" strokeDashoffset={-roadFlow} />

        {/* Vertical cross streets */}
        <line x1="130" y1="40" x2="130" y2="360" stroke="#cbd5e1" strokeWidth="16" strokeLinecap="round" />
        <line x1="250" y1="40" x2="250" y2="360" stroke="#cbd5e1" strokeWidth="16" strokeLinecap="round" />

        {/* Connective Delivery Route Pulse */}
        <polyline
          points="110,150 210,150 210,250 290,250 290,130"
          fill="none"
          stroke={C.blue}
          strokeWidth="4"
          strokeDasharray="8 6"
          strokeDashoffset={-t * 35}
          opacity="0.8"
        />

        {/* Warehouses / Dark Store Hubs */}
        {hubs.map((h, i) => {
          const p = prog(t, h.delay, h.delay + 0.35, ease.back);
          const pRing = ((t * 1.5 + i * 0.4) % 1);
          const bob = Math.sin(t * 3 + i) * 3;

          return (
            <g key={i} transform={`translate(${h.x} ${h.y + bob}) scale(${p})`} opacity={clamp(p * 2)}>
              {/* Radar pulse wave */}
              {pulse && (
                <circle
                  r={12 + pRing * 28}
                  fill="none"
                  stroke={i === 2 ? C.gold : C.blue}
                  strokeWidth="3"
                  opacity={Math.max(0, 0.7 - pRing * 0.7)}
                />
              )}

              {/* Warehouse Building Icon */}
              <rect x="-18" y="-12" width="36" height="24" rx="4" fill={C.navy} />
              <polygon points="-22,-10 0,-24 22,-10" fill={i === 2 ? C.gold : C.blue} />
              {/* Rollup Door */}
              <rect x="-6" y="0" width="12" height="12" rx="1" fill="#fff" opacity="0.9" />
              <line x1="-5" y1="4" x2="5" y2="4" stroke={C.navy} strokeWidth="1.5" />
              <line x1="-5" y1="8" x2="5" y2="8" stroke={C.navy} strokeWidth="1.5" />

              {/* Hub Pin Head */}
              <circle cx="0" cy="-28" r="7" fill={C.redSoft} stroke="#fff" strokeWidth="2" />
              <polygon points="-5,-25 5,-25 0,-18" fill={C.redSoft} />
            </g>
          );
        })}
      </g>
    </Svg>
  );
}

/**
 * Stopwatch ticking down with groceries dropping into a grocery bag.
 */
export function StopwatchTimer({t, d, bag = true}) {
  const enter = prog(t, 0.05, 0.4, ease.back);
  const needleAngle = (t * 360 * 0.6) % 360; // Ticking sweep
  const pulse = Math.sin(t * 8) * 0.03;

  // Grocery items dropping into bag
  const items = [
    {type: 'bottle', delay: 0.3, x: 260, yEnd: 240, color: '#60a5fa'},
    {type: 'bread', delay: 0.5, x: 285, yEnd: 230, color: '#d97706'},
    {type: 'apple', delay: 0.7, x: 310, yEnd: 250, color: C.redSoft}
  ];

  return (
    <Svg>
      {/* Left: Stopwatch */}
      <g transform={`translate(150 180) scale(${0.75 + 0.25 * enter + pulse})`} opacity={clamp(enter * 2)}>
        {/* Top Button / Crown */}
        <rect x="-14" y="-125" width="28" height="16" rx="4" fill={C.navy} />
        <rect x="-6" y="-140" width="12" height="18" rx="3" fill="#e2e8f0" stroke={C.navy} strokeWidth="3" />
        <line x1="-35" y1="-105" x2="-22" y2="-90" stroke={C.navy} strokeWidth="8" strokeLinecap="round" />
        <line x1="35" y1="-105" x2="22" y2="-90" stroke={C.navy} strokeWidth="8" strokeLinecap="round" />

        {/* Watch Outer Ring */}
        <circle r="92" fill="#fff" stroke={C.navy} strokeWidth="12" />
        <circle r="78" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="3" />

        {/* Progress Arc (Time slipping away) */}
        <circle
          r="78"
          fill="none"
          stroke={C.redSoft}
          strokeWidth="6"
          strokeDasharray="490"
          strokeDashoffset={clamp(t / Math.max(d, 3), 0, 1) * 490}
          transform="rotate(-90)"
          strokeLinecap="round"
        />

        {/* Clock Ticks */}
        {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
          <line
            key={deg}
            x1="0"
            y1="-72"
            x2="0"
            y2={deg % 90 === 0 ? '-60' : '-66'}
            stroke={deg % 90 === 0 ? C.navy : '#94a3b8'}
            strokeWidth={deg % 90 === 0 ? '4' : '2'}
            transform={`rotate(${deg})`}
          />
        ))}

        {/* Needle Hand */}
        <g transform={`rotate(${needleAngle})`}>
          <polygon points="-4,10 4,10 1.5,-68 -1.5,-68" fill={C.redSoft} />
          <circle r="8" fill={C.navy} />
          <circle r="3" fill="#fff" />
        </g>

        {/* Digital Seconds Badge */}
        <g transform="translate(0 38)">
          <rect x="-42" y="-14" width="84" height="28" rx="8" fill={C.navy} />
          <text textAnchor="middle" y="5" fontSize="16" fontWeight="900" fill="#fff" fontFamily="Arial">
            10 MIN
          </text>
        </g>
      </g>

      {/* Right: Grocery Bag & Dropping Items */}
      {bag && (
        <g transform="translate(0 20)">
          {/* Grocery Items Falling */}
          {items.map((it, i) => {
            const drop = prog(t, it.delay, it.delay + 0.35, ease.back);
            const yCurrent = lerp(80, it.yEnd, drop);
            const rot = lerp(-25, 5 * (i % 2 === 0 ? 1 : -1), drop);

            return (
              <g
                key={i}
                transform={`translate(${it.x} ${yCurrent}) rotate(${rot})`}
                opacity={clamp(drop * 2)}
              >
                {it.type === 'bottle' && (
                  <g>
                    <rect x="-10" y="-28" width="20" height="38" rx="5" fill={it.color} stroke="#1e3a8a" strokeWidth="2" />
                    <rect x="-5" y="-36" width="10" height="8" rx="2" fill="#fff" stroke="#1e3a8a" strokeWidth="2" />
                    <rect x="-8" y="-18" width="16" height="12" rx="2" fill="#fff" />
                  </g>
                )}
                {it.type === 'bread' && (
                  <g>
                    <polygon points="-8,-35 8,-35 12,0 -12,0" fill={it.color} stroke="#78350f" strokeWidth="2" />
                    <line x1="-6" y1="-26" x2="6" y2="-26" stroke="#fef3c7" strokeWidth="2" />
                    <line x1="-8" y1="-16" x2="8" y2="-16" stroke="#fef3c7" strokeWidth="2" />
                  </g>
                )}
                {it.type === 'apple' && (
                  <g>
                    <circle r="14" fill={it.color} stroke="#991b1b" strokeWidth="2" />
                    <path d="M0,-14 Q4,-22 10,-20" stroke="#15803d" strokeWidth="3" fill="none" />
                    <ellipse cx="-4" cy="-4" rx="3" ry="5" fill="#fca5a5" opacity="0.6" />
                  </g>
                )}
              </g>
            );
          })}

          {/* Brown Grocery Bag Front */}
          <g transform="translate(285 280)">
            {/* Bag Shadow */}
            <ellipse cy="62" rx="58" ry="12" fill="rgba(30,30,50,0.12)" />

            {/* Bag Body */}
            <polygon points="-52,-40 52,-40 44,58 -44,58" fill="#d97706" stroke="#92400e" strokeWidth="4" />
            <polygon points="-46,-40 46,-40 40,54 -40,54" fill="#f59e0b" />

            {/* Bag Handle Cutouts */}
            <rect x="-20" y="-22" width="40" height="14" rx="7" fill="#b45309" stroke="#78350f" strokeWidth="2" />

            {/* Bag Fold Marks */}
            <polyline points="-32,54 0,10 32,54" fill="none" stroke="#d97706" strokeWidth="3" opacity="0.8" />
            <line x1="0" y1="10" x2="0" y2="54" stroke="#d97706" strokeWidth="3" opacity="0.8" />
          </g>
        </g>
      )}
    </Svg>
  );
}

/**
 * Fast delivery rider on a scooter zooming down the street.
 */
export function DeliveryScooter({t, d, fast = true}) {
  const enter = prog(t, 0.05, 0.45, ease.out);
  const roadDash = (t * 220) % 80;
  const bob = Math.sin(t * 14) * 3; // Engine vibration / road bumps
  const wheelSpin = (t * 720) % 360;

  return (
    <Svg>
      {/* Street / Road Surface */}
      <g opacity={clamp(enter * 2)}>
        <line x1="20" y1="320" x2="380" y2="320" stroke={C.navy} strokeWidth="8" strokeLinecap="round" />
        <line
          x1="20"
          y1="340"
          x2="380"
          y2="340"
          stroke="#cbd5e1"
          strokeWidth="6"
          strokeDasharray="24 20"
          strokeDashoffset={roadDash}
        />

        {/* Speed Wind Lines behind */}
        {fast && (
          <g opacity={0.6 + 0.4 * Math.sin(t * 10)}>
            <line x1="30" y1="210" x2="100" y2="210" stroke={C.blue} strokeWidth="4" strokeLinecap="round" strokeDasharray="30 20" strokeDashoffset={-roadDash} />
            <line x1="10" y1="240" x2="80" y2="240" stroke={C.blue} strokeWidth="3" strokeLinecap="round" strokeDasharray="20 15" strokeDashoffset={-roadDash * 1.2} />
            <line x1="40" y1="270" x2="110" y2="270" stroke={C.blue} strokeWidth="4" strokeLinecap="round" strokeDasharray="25 15" strokeDashoffset={-roadDash} />
          </g>
        )}
      </g>

      {/* Scooter & Rider */}
      <g transform={`translate(${lerp(-60, 20, enter)} ${bob})`}>
        {/* Headlight Beam */}
        <polygon points="310,240 395,215 395,295 310,255" fill="url(#headlightGrad)" opacity="0.45" />
        <defs>
          <linearGradient id="headlightGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fef08a" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#fef08a" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Back Wheel */}
        <g transform="translate(130 300)">
          <circle r="26" fill="#1e293b" stroke="#64748b" strokeWidth="6" />
          <circle r="14" fill="#94a3b8" />
          <g transform={`rotate(${wheelSpin})`}>
            <line x1="-12" y1="0" x2="12" y2="0" stroke="#fff" strokeWidth="3" />
            <line x1="0" y1="-12" x2="0" y2="12" stroke="#fff" strokeWidth="3" />
          </g>
        </g>

        {/* Front Wheel */}
        <g transform="translate(290 300)">
          <circle r="26" fill="#1e293b" stroke="#64748b" strokeWidth="6" />
          <circle r="14" fill="#94a3b8" />
          <g transform={`rotate(${wheelSpin})`}>
            <line x1="-12" y1="0" x2="12" y2="0" stroke="#fff" strokeWidth="3" />
            <line x1="0" y1="-12" x2="0" y2="12" stroke="#fff" strokeWidth="3" />
          </g>
        </g>

        {/* Scooter Chassis / Body */}
        {/* Floorboard */}
        <line x1="140" y1="300" x2="250" y2="300" stroke={C.navy} strokeWidth="14" strokeLinecap="round" />
        {/* Rear Mudguard / Seat Base */}
        <path d="M120,300 Q130,265 170,265 L215,265" fill="none" stroke={C.green} strokeWidth="18" strokeLinecap="round" />
        {/* Front Steering Column */}
        <line x1="240" y1="300" x2="275" y2="215" stroke={C.navy} strokeWidth="12" strokeLinecap="round" />
        {/* Handlebars */}
        <line x1="260" y1="215" x2="295" y2="215" stroke={C.navy} strokeWidth="8" strokeLinecap="round" />
        <circle cx="295" cy="215" r="5" fill="#f87171" />

        {/* Headlight Lamp */}
        <polygon points="275,230 305,235 305,255 275,250" fill={C.green} />
        <circle cx="305" cy="245" r="7" fill="#fef08a" stroke={C.navy} strokeWidth="2" />

        {/* Rider Body */}
        {/* Leg forward on floorboard */}
        <polyline points="195,255 225,260 235,295" fill="none" stroke={C.navy} strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />

        {/* Torso leaning forward slightly */}
        <line x1="190" y1="250" x2="225" y2="185" stroke={C.navy} strokeWidth="22" strokeLinecap="round" />

        {/* Arm reaching to handlebar */}
        <polyline points="215,190 255,200 285,215" fill="none" stroke={C.navy} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />

        {/* Helmet / Head */}
        <circle cx="240" cy="150" r="22" fill={C.green} stroke={C.navy} strokeWidth="4" />
        {/* Helmet Visor */}
        <path d="M242,142 Q260,146 258,158 Q246,160 242,154 Z" fill="#0f172a" />

        {/* Big Delivery Backpack on Back */}
        <g transform="translate(155 175) rotate(-10)">
          <rect x="-24" y="-35" width="48" height="65" rx="10" fill="#f59e0b" stroke="#78350f" strokeWidth="4" />
          <line x1="-20" y1="-10" x2="20" y2="-10" stroke="#fff" strokeWidth="4" strokeDasharray="6 4" />
          {/* Reflective Band */}
          <rect x="-20" y="8" width="40" height="8" rx="2" fill="#22c55e" />
          <text textAnchor="middle" y="2" fontSize="11" fontWeight="900" fill="#78350f" fontFamily="Arial">
            EXPRESS
          </text>
        </g>
      </g>
    </Svg>
  );
}

/**
 * Glowing box combining a location pin and a microchip.
 */
export function PackageBox({t, d, glow = true}) {
  const enter = prog(t, 0.05, 0.45, ease.back);
  const pulse = 1 + 0.04 * Math.sin(t * 5);
  const traceDash = (t * 60) % 80;

  return (
    <Svg>
      {/* Background Soft Glow Aura */}
      {glow && (
        <circle
          cx="200"
          cy="200"
          r={120 + 15 * Math.sin(t * 4)}
          fill="none"
          stroke={C.blueSoft}
          strokeWidth="30"
          opacity={0.35 + 0.15 * Math.sin(t * 3)}
        />
      )}

      {/* Isometric Smart Delivery Box */}
      <g transform={`translate(200 230) scale(${0.85 * enter})`} opacity={clamp(enter * 2)}>
        {/* Isometric Box Faces */}
        {/* Top Face */}
        <polygon points="0,-70 85,-25 0,20 -85,-25" fill="#f8fafc" stroke="#94a3b8" strokeWidth="4" />
        {/* Left Face */}
        <polygon points="-85,-25 0,20 0,110 -85,65" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="4" />
        {/* Right Face */}
        <polygon points="0,20 85,-25 85,65 0,110" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="4" />

        {/* Shipping Tape */}
        <polygon points="0,-70 12,-64 12,25 0,20" fill="#f59e0b" opacity="0.8" />
        <polygon points="0,20 12,25 12,116 0,110" fill="#d97706" opacity="0.8" />

        {/* Microchip Circuit Traces on Box Left Face */}
        <g stroke={C.blue} strokeWidth="3" fill="none" opacity="0.85">
          <polyline points="-60,10 -35,10 -20,35" strokeDasharray="8 6" strokeDashoffset={-traceDash} />
          <circle cx="-60" cy="10" r="3" fill={C.blue} />
          <polyline points="-70,40 -45,40 -30,65" strokeDasharray="8 6" strokeDashoffset={-traceDash} />
          <circle cx="-70" cy="40" r="3" fill={C.blue} />
        </g>
      </g>

      {/* Floating Holographic Location Pin with Integrated Microchip Core */}
      <g transform={`translate(200 ${135 + Math.sin(t * 3) * 8}) scale(${pulse})`}>
        {/* Glowing Pin Body */}
        <path
          d="M0,-85 C-42,-85 -55,-45 0,15 C55,-45 42,-85 0,-85 Z"
          fill="url(#pinGrad)"
          stroke="#3b82f6"
          strokeWidth="5"
        />
        <defs>
          <linearGradient id="pinGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>
        </defs>

        {/* Microchip Center in Pin */}
        <rect x="-24" y="-68" width="48" height="48" rx="8" fill="#0f172a" stroke="#60a5fa" strokeWidth="3" />

        {/* Chip Pins / Legs */}
        {[-14, 0, 14].map((offset) => (
          <React.Fragment key={offset}>
            {/* Top pins */}
            <line x1={offset} y1="-68" x2={offset} y2="-76" stroke="#93c5fd" strokeWidth="3" />
            {/* Bottom pins */}
            <line x1={offset} y1="-20" x2={offset} y2="-12" stroke="#93c5fd" strokeWidth="3" />
            {/* Left pins */}
            <line x1="-24" y1={-44 + offset} x2="-32" y2={-44 + offset} stroke="#93c5fd" strokeWidth="3" />
            {/* Right pins */}
            <line x1="24" y1={-44 + offset} x2="32" y2={-44 + offset} stroke="#93c5fd" strokeWidth="3" />
          </React.Fragment>
        ))}

        {/* Chip Core CPU Logo / Pulse */}
        <rect x="-12" y="-56" width="24" height="24" rx="4" fill="#2563eb" />
        <circle cx="0" cy="-44" r="5" fill="#fef08a" opacity={0.7 + 0.3 * Math.sin(t * 8)} />

        {/* Orbiting Sparkles */}
        {[0, 120, 240].map((angle, idx) => {
          const aRad = ((t * 2 + angle * (Math.PI / 180)) % (Math.PI * 2));
          const sx = Math.cos(aRad) * 65;
          const sy = Math.sin(aRad) * 35 - 45;
          return (
            <circle
              key={idx}
              cx={sx}
              cy={sy}
              r={3 + hash(idx) * 2}
              fill="#67e8f9"
              opacity={0.8}
            />
          );
        })}
      </g>
    </Svg>
  );
}

/**
 * Supermarket / Grocery shopping cart with groceries popping in.
 */
export function ShoppingCart({t, d, items = 3}) {
  const enter = prog(t, 0.05, 0.45, ease.back);
  const roll = (t * 240) % 360;

  return (
    <Svg>
      <g transform={`translate(200 200) scale(${0.8 + 0.2 * enter}) translate(-200 -200)`} opacity={clamp(enter * 2)}>
        {/* Cart Basket */}
        <polygon points="110,130 310,130 280,240 140,240" fill="none" stroke={C.navy} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
        {/* Wire Grid Lines */}
        <line x1="125" y1="165" x2="298" y2="165" stroke="#94a3b8" strokeWidth="3" />
        <line x1="135" y1="200" x2="288" y2="200" stroke="#94a3b8" strokeWidth="3" />
        <line x1="160" y1="130" x2="165" y2="240" stroke="#94a3b8" strokeWidth="3" />
        <line x1="210" y1="130" x2="210" y2="240" stroke="#94a3b8" strokeWidth="3" />
        <line x1="260" y1="130" x2="255" y2="240" stroke="#94a3b8" strokeWidth="3" />

        {/* Chassis Frame & Handle */}
        <polyline points="90,105 125,130 140,240 270,240 295,290 120,290" fill="none" stroke={C.navy} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
        {/* Handle Grip */}
        <rect x="75" y="95" width="24" height="14" rx="4" fill={C.redSoft} />

        {/* Wheels */}
        <g transform="translate(145 310)">
          <circle r="18" fill="#1e293b" stroke="#cbd5e1" strokeWidth="4" />
          <g transform={`rotate(${roll})`}>
            <line x1="-10" y1="0" x2="10" y2="0" stroke="#fff" strokeWidth="2.5" />
            <line x1="0" y1="-10" x2="0" y2="10" stroke="#fff" strokeWidth="2.5" />
          </g>
        </g>
        <g transform="translate(285 310)">
          <circle r="18" fill="#1e293b" stroke="#cbd5e1" strokeWidth="4" />
          <g transform={`rotate(${roll})`}>
            <line x1="-10" y1="0" x2="10" y2="0" stroke="#fff" strokeWidth="2.5" />
            <line x1="0" y1="-10" x2="0" y2="10" stroke="#fff" strokeWidth="2.5" />
          </g>
        </g>

        {/* Cart Items Popping In */}
        {items >= 1 && (
          <g transform={`translate(160 ${lerp(60, 160, prog(t, 0.25, 0.55, ease.back))}) scale(${prog(t, 0.25, 0.55)})`}>
            <rect x="-18" y="-30" width="36" height="50" rx="6" fill="#60a5fa" stroke="#1d4ed8" strokeWidth="3" />
            <text textAnchor="middle" y="2" fontSize="11" fontWeight="bold" fill="#fff">MILK</text>
          </g>
        )}
        {items >= 2 && (
          <g transform={`translate(210 ${lerp(60, 175, prog(t, 0.45, 0.75, ease.back))}) scale(${prog(t, 0.45, 0.75)})`}>
            <circle r="22" fill={C.redSoft} stroke="#991b1b" strokeWidth="3" />
            <path d="M0,-20 Q4,-28 10,-26" stroke="#15803d" strokeWidth="3" fill="none" />
          </g>
        )}
        {items >= 3 && (
          <g transform={`translate(255 ${lerp(60, 155, prog(t, 0.65, 0.95, ease.back))}) scale(${prog(t, 0.65, 0.95)})`}>
            <polygon points="-12,-35 12,-35 16,10 -16,10" fill="#f59e0b" stroke="#b45309" strokeWidth="3" />
          </g>
        )}

        {/* Item Counter Badge */}
        <g transform="translate(305 110)">
          <circle r="20" fill={C.green} stroke="#fff" strokeWidth="3" />
          <text textAnchor="middle" y="7" fontSize="18" fontWeight="900" fill="#fff" fontFamily="Arial">
            +3
          </text>
        </g>
      </g>
    </Svg>
  );
}

/**
 * Modern smartphone with 10-min delivery order status app.
 */
export function SmartphoneApp({t, d, status = 'delivering'}) {
  const enter = prog(t, 0.05, 0.45, ease.back);
  const bob = Math.sin(t * 2.5) * 6;
  const progress = clamp(t / Math.max(d, 3));

  return (
    <Svg>
      <g transform={`translate(200 ${200 + bob}) scale(${0.85 + 0.15 * enter}) translate(-200 -200)`} opacity={clamp(enter * 2)}>
        {/* Phone Body */}
        <rect x="110" y="50" width="180" height="310" rx="28" fill={C.navy} stroke="#64748b" strokeWidth="5" />
        {/* Screen */}
        <rect x="120" y="65" width="160" height="280" rx="20" fill="#f8fafc" />

        {/* Camera Notch */}
        <rect x="165" y="72" width="70" height="14" rx="7" fill={C.navy} />
        <circle cx="215" cy="79" r="3" fill="#3b82f6" />

        {/* App Header */}
        <rect x="130" y="95" width="140" height="26" rx="6" fill="#e2e8f0" />
        <text textAnchor="middle" x="200" y="113" fontSize="12" fontWeight="800" fill={C.navy} fontFamily="Arial">
          FLASH DELIVERY
        </text>

        {/* Live Tracking Map Screen */}
        <rect x="130" y="130" width="140" height="120" rx="10" fill="#e0f2fe" stroke="#bae6fd" strokeWidth="2" />

        {/* Route Path */}
        <path d="M145,220 Q175,170 210,190 T255,145" fill="none" stroke="#94a3b8" strokeWidth="6" strokeLinecap="round" />
        <path
          d="M145,220 Q175,170 210,190 T255,145"
          fill="none"
          stroke={C.blue}
          strokeWidth="6"
          strokeDasharray="180"
          strokeDashoffset={(1 - progress) * 180}
          strokeLinecap="round"
        />

        {/* Delivery Rider Pin along route */}
        <g transform={`translate(${lerp(145, 255, progress)} ${lerp(220, 145, progress) + Math.sin(progress * Math.PI) * -30})`}>
          <circle r="12" fill={C.green} stroke="#fff" strokeWidth="2" />
          <circle r="4" fill="#fff" />
        </g>

        {/* Destination Home Pin */}
        <g transform="translate(255 145)">
          <circle r="10" fill={C.redSoft} stroke="#fff" strokeWidth="2" />
          <polygon points="-6,-2 6,-2 0,8" fill={C.redSoft} />
        </g>

        {/* Order ETA Status Pill */}
        <g transform="translate(200 275)">
          <rect x="-60" y="-15" width="120" height="30" rx="15" fill={C.green} />
          <text textAnchor="middle" y="5" fontSize="13" fontWeight="900" fill="#fff" fontFamily="Arial">
            ARRIVING 8 MIN
          </text>
        </g>

        {/* Home Indicator Bar */}
        <rect x="160" y="332" width="80" height="4" rx="2" fill={C.navy} opacity="0.6" />
      </g>
    </Svg>
  );
}

/**
 * Hyper-growth Rocket launch with flame exhaust.
 */
export function RocketGrowth({t, d, launch = true}) {
  const enter = prog(t, 0.05, 0.45, ease.back);
  const flamePulse = 0.8 + 0.4 * Math.sin(t * 18);
  const rocketShift = Math.sin(t * 8) * 4;

  return (
    <Svg>
      <g transform={`translate(200 200) scale(${0.75 + 0.25 * enter}) translate(-200 -200)`} opacity={clamp(enter * 2)}>
        {/* Speed Trails */}
        <line x1="120" y1="360" x2="60" y2="420" stroke="#cbd5e1" strokeWidth="4" strokeDasharray="15 10" />
        <line x1="280" y1="360" x2="340" y2="420" stroke="#cbd5e1" strokeWidth="4" strokeDasharray="15 10" />

        {/* Rocket assembly tilted 45 degrees */}
        <g transform={`translate(200 180) rotate(45) translate(-200 -180) translate(0 ${rocketShift})`}>
          {/* Flame Plume */}
          {launch && (
            <g transform={`translate(200 280) scale(${flamePulse})`}>
              <polygon points="-22,0 0,65 22,0" fill="#f59e0b" />
              <polygon points="-14,0 0,45 14,0" fill="#ef4444" />
              <polygon points="-8,0 0,25 8,0" fill="#fef08a" />
            </g>
          )}

          {/* Rocket Wings */}
          <polygon points="160,240 130,270 170,270" fill={C.redSoft} stroke={C.navy} strokeWidth="3" />
          <polygon points="240,240 270,270 230,270" fill={C.redSoft} stroke={C.navy} strokeWidth="3" />

          {/* Fuselage */}
          <path d="M165,270 L165,150 Q165,80 200,60 Q235,80 235,150 L235,270 Z" fill="#f8fafc" stroke={C.navy} strokeWidth="5" />

          {/* Nose Cone */}
          <path d="M165,150 Q165,80 200,60 Q235,80 235,150 Z" fill={C.redSoft} stroke={C.navy} strokeWidth="5" />

          {/* Porthole Window */}
          <circle cx="200" cy="180" r="18" fill="#38bdf8" stroke={C.navy} strokeWidth="4" />
          <circle cx="200" cy="180" r="12" fill="#e0f2fe" />

          {/* Stripe Accent */}
          <rect x="165" y="225" width="70" height="12" fill={C.blue} />
        </g>
      </g>
    </Svg>
  );
}

/**
 * Fulfillment warehouse / dark store.
 */
export function StoreWarehouse({t, d, dispatch = true}) {
  const enter = prog(t, 0.05, 0.45, ease.back);
  const conveyor = (t * 60) % 40;

  return (
    <Svg>
      <g transform={`translate(200 200) scale(${0.8 + 0.2 * enter}) translate(-200 -200)`} opacity={clamp(enter * 2)}>
        {/* Warehouse Building */}
        <polygon points="70,140 200,80 330,140 330,310 70,310" fill="#f1f5f9" stroke={C.navy} strokeWidth="5" />
        {/* Roof overhang */}
        <polygon points="55,140 200,70 345,140" fill={C.navy} />

        {/* Windows / Storage High Rack View */}
        <rect x="95" y="160" width="60" height="40" rx="4" fill="#3b82f6" opacity="0.3" stroke={C.navy} strokeWidth="2" />
        <rect x="245" y="160" width="60" height="40" rx="4" fill="#3b82f6" opacity="0.3" stroke={C.navy} strokeWidth="2" />

        {/* Large Roll-up Dispatch Bay Door */}
        <rect x="140" y="210" width="120" height="100" rx="4" fill="#334155" stroke={C.navy} strokeWidth="3" />
        {/* Roll-up Slats */}
        {[225, 240, 255, 270, 285].map((y) => (
          <line key={y} x1="140" y1={y} x2="260" y2={y} stroke="#64748b" strokeWidth="3" />
        ))}

        {/* Dispatch Conveyor / Ramp */}
        <polygon points="150,305 250,305 270,335 130,335" fill="#94a3b8" stroke={C.navy} strokeWidth="3" />
        <line x1="135" y1="320" x2="265" y2="320" stroke="#f1f5f9" strokeWidth="3" strokeDasharray="10 8" strokeDashoffset={-conveyor} />

        {/* Dispatch Package Sliding Out */}
        {dispatch && (
          <g transform={`translate(${lerp(185, 215, (t * 0.8) % 1)} 295)`}>
            <rect x="-14" y="-12" width="28" height="24" rx="3" fill="#f59e0b" stroke="#78350f" strokeWidth="2" />
            <line x1="-14" y1="0" x2="14" y2="0" stroke="#d97706" strokeWidth="3" />
          </g>
        )}

        {/* Warehouse Sign */}
        <g transform="translate(200 135)">
          <rect x="-45" y="-12" width="90" height="24" rx="6" fill={C.green} />
          <text textAnchor="middle" y="5" fontSize="12" fontWeight="900" fill="#fff" fontFamily="Arial">
            DARK STORE
          </text>
        </g>
      </g>
    </Svg>
  );
}

import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';

/**
 * Procedural Vector Stickman / Character Engine for Remotion.
 * Crisp SVG rendering, spring-driven kinematics, expressive poses and props.
 */
export function StickmanCharacter({
  pose = 'idle',             // idle | pointing | holding_money | holding_invoice | confused | celebrating | stress_panic | sitting_desk | walking
  expression = 'neutral',    // neutral | happy | sad | stressed | surprised | focused
  shirtColor = '#3b82f6',
  pantsColor = '#1e293b',
  skinColor = '#fed7aa',
  outlineColor = '#ffffff',
  size = 360,
  flip = false,              // mirror horizontally
  style = {}
}) {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  // Entrance spring
  const enterSpring = spring({
    frame,
    fps,
    config: {damping: 14, stiffness: 100}
  });

  // Breathing / idle motion
  const breath = Math.sin(frame / 12) * 3;
  const jitter = (pose === 'stress_panic') ? Math.sin(frame * 2) * 2.5 : 0;

  // Walking cycle if pose is walking
  const walkPhase = (frame * 0.2) % (Math.PI * 2);
  const walkLegL = Math.sin(walkPhase) * 25;
  const walkLegR = Math.sin(walkPhase + Math.PI) * 25;
  const walkArmL = Math.sin(walkPhase + Math.PI) * 20;
  const walkArmR = Math.sin(walkPhase) * 20;

  // Head bob
  const headBob = (pose === 'walking') ? Math.abs(Math.sin(walkPhase)) * 4 : breath;

  // Scale and positioning based on pose
  const isSitting = pose === 'sitting_desk';

  return (
    <div style={{
      width: size,
      height: size,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transform: `scale(${enterSpring}) scaleX(${flip ? -1 : 1}) translate(${jitter}px, ${jitter}px)`,
      transformOrigin: 'bottom center',
      ...style
    }}>
      <svg
        viewBox="0 0 200 240"
        width={size}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{overflow: 'visible'}}
      >
        <defs>
          <filter id="charShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="rgba(0,0,0,0.3)" />
          </filter>
        </defs>

        {/* Ambient Ground Shadow */}
        <ellipse
          cx="100"
          cy={isSitting ? "220" : "230"}
          rx={isSitting ? "50" : "40"}
          ry="7"
          fill="rgba(0,0,0,0.25)"
        />

        {/* --- LEGS & CHAIR --- */}
        {isSitting ? (
          <g id="sitting-chair-legs">
            {/* Chair back and seat */}
            <path d="M 60 140 L 60 215 M 50 175 L 85 175" stroke="#475569" strokeWidth="5" strokeLinecap="round" />
            {/* Bent Legs */}
            <path
              d="M 85 155 L 115 155 L 115 220"
              stroke={pantsColor}
              strokeWidth="9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Shoes */}
            <ellipse cx="120" cy="222" rx="9" ry="5" fill="#0f172a" />
            {/* Desk */}
            <rect x="110" y="160" width="70" height="8" rx="2" fill="#334155" />
            <line x1="165" y1="168" x2="165" y2="225" stroke="#334155" strokeWidth="4" />
            {/* Laptop on desk */}
            <path d="M 125 159 L 145 159 L 150 144" stroke="#94a3b8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="122" y="159" width="28" height="3" rx="1" fill="#cbd5e1" />
          </g>
        ) : (
          <g id="standing-legs">
            {pose === 'walking' ? (
              <>
                {/* Left Leg (Walking) */}
                <line
                  x1="90" y1="150"
                  x2={90 + walkLegL} y2="225"
                  stroke={pantsColor}
                  strokeWidth="9"
                  strokeLinecap="round"
                />
                <ellipse cx={90 + walkLegL + 3} cy="227" rx="8" ry="4.5" fill="#0f172a" />

                {/* Right Leg (Walking) */}
                <line
                  x1="110" y1="150"
                  x2={110 + walkLegR} y2="225"
                  stroke={pantsColor}
                  strokeWidth="9"
                  strokeLinecap="round"
                />
                <ellipse cx={110 + walkLegR + 3} cy="227" rx="8" ry="4.5" fill="#0f172a" />
              </>
            ) : (
              <>
                {/* Left Leg */}
                <path
                  d="M 90 150 L 86 185 L 84 225"
                  stroke={pantsColor}
                  strokeWidth="9"
                  strokeLinecap="round"
                />
                <ellipse cx="82" cy="227" rx="8.5" ry="4.5" fill="#0f172a" />

                {/* Right Leg */}
                <path
                  d="M 110 150 L 114 185 L 116 225"
                  stroke={pantsColor}
                  strokeWidth="9"
                  strokeLinecap="round"
                />
                <ellipse cx="118" cy="227" rx="8.5" ry="4.5" fill="#0f172a" />
              </>
            )}
          </g>
        )}

        {/* --- TORSO --- */}
        <g id="torso" transform={`translate(0, ${headBob})`}>
          {/* Main body / jacket */}
          <path
            d="M 80 88 C 80 85, 120 85, 120 88 L 115 152 C 115 154, 85 154, 85 152 Z"
            fill={shirtColor}
            stroke={outlineColor}
            strokeWidth="3.5"
            strokeLinejoin="round"
            filter="url(#charShadow)"
          />

          {/* Tie or Collar Detail */}
          <path d="M 96 88 L 100 115 L 104 88" fill="#e2e8f0" stroke="#0f172a" strokeWidth="1.5" />
          <polygon points="98,115 102,115 104,132 100,137 96,132" fill="#ef4444" />
        </g>

        {/* --- HEAD & FACE --- */}
        <g id="head-group" transform={`translate(0, ${headBob})`}>
          {/* Neck */}
          <line x1="100" y1="78" x2="100" y2="88" stroke={skinColor} strokeWidth="8" strokeLinecap="round" />

          {/* Head Base */}
          <circle
            cx="100"
            cy="55"
            r="26"
            fill={skinColor}
            stroke={outlineColor}
            strokeWidth="3.5"
            filter="url(#charShadow)"
          />

          {/* Hair (Clean modern side-part) */}
          <path
            d="M 75 52 C 74 36, 92 28, 114 31 C 124 33, 128 42, 126 50 C 122 40, 112 36, 98 38 C 86 40, 80 46, 75 52 Z"
            fill="#1e293b"
          />

          {/* Expressions */}
          {pose === 'stress_panic' || expression === 'stressed' ? (
            /* Panicked expression: wide round eyes, wavy mouth, sweat droplet */
            <g id="face-stressed">
              <circle cx="92" cy="54" r="4.5" fill="#ffffff" stroke="#0f172a" strokeWidth="1.5" />
              <circle cx="92" cy="54" r="2" fill="#0f172a" />
              <circle cx="108" cy="54" r="4.5" fill="#ffffff" stroke="#0f172a" strokeWidth="1.5" />
              <circle cx="108" cy="54" r="2" fill="#0f172a" />
              {/* Worried brows */}
              <line x1="87" y1="46" x2="96" y2="48" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" />
              <line x1="113" y1="46" x2="104" y2="48" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" />
              {/* Wavy mouth */}
              <path d="M 94 66 Q 97 64, 100 66 T 106 66" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" fill="none" />
              {/* Blue sweat bead */}
              <path d="M 124 45 Q 128 52, 125 56 Q 122 56, 122 52 Z" fill="#38bdf8" />
            </g>
          ) : pose === 'confused' ? (
            /* Confused expression: one raised eyebrow, small O-mouth, question mark */
            <g id="face-confused">
              <circle cx="93" cy="54" r="3" fill="#0f172a" />
              <circle cx="107" cy="54" r="3" fill="#0f172a" />
              <line x1="88" y1="47" x2="97" y2="47" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" />
              <path d="M 103 45 Q 107 42, 112 45" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" fill="none" />
              <ellipse cx="100" cy="65" rx="3.5" ry="4" fill="#0f172a" />
              {/* Floating animated question mark */}
              <text x="124" y="38" fill="#f59e0b" fontSize="18" fontWeight="bold" fontFamily="sans-serif">?</text>
            </g>
          ) : pose === 'celebrating' || expression === 'happy' ? (
            /* Happy / celebrating: smiling curved eyes, broad grin */
            <g id="face-celebrating">
              <path d="M 89 54 Q 93 49, 97 54" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" fill="none" />
              <path d="M 103 54 Q 107 49, 111 54" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" fill="none" />
              <path d="M 92 63 Q 100 73, 108 63 Z" fill="#ef4444" stroke="#0f172a" strokeWidth="1.5" />
            </g>
          ) : (
            /* Default confident neutral */
            <g id="face-neutral">
              <circle cx="93" cy="54" r="3" fill="#0f172a" />
              <circle cx="107" cy="54" r="3" fill="#0f172a" />
              <line x1="89" y1="47" x2="97" y2="47" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" />
              <line x1="103" y1="47" x2="111" y2="47" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" />
              <path d="M 95 65 Q 100 69, 105 65" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" fill="none" />
            </g>
          )}
        </g>

        {/* --- ARMS & PROPS (Pose-dependent) --- */}
        <g id="arms-group" transform={`translate(0, ${headBob})`}>
          {pose === 'pointing' ? (
            <>
              {/* Left hand relaxed at side */}
              <path d="M 82 92 L 72 125 L 75 145" stroke={shirtColor} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="75" cy="147" r="4.5" fill={skinColor} />

              {/* Right arm dramatically pointing forward/right */}
              <path d="M 118 92 L 145 92 L 178 92" stroke={shirtColor} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
              {/* Pointing hand with extended finger */}
              <circle cx="180" cy="92" r="5" fill={skinColor} />
              <line x1="180" y1="92" x2="192" y2="92" stroke={skinColor} strokeWidth="3.5" strokeLinecap="round" />
            </>
          ) : pose === 'holding_money' ? (
            <>
              {/* Left Arm bending inward holding cash */}
              <path d="M 82 92 L 95 125 L 115 120" stroke={shirtColor} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
              {/* Right Arm bending inward */}
              <path d="M 118 92 L 115 125 L 125 120" stroke={shirtColor} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />

              {/* Stack of Green Rupee Cash */}
              <g id="prop-money-stack" transform="translate(105, 105)">
                <rect x="0" y="4" width="34" height="20" rx="3" fill="#15803d" stroke="#166534" strokeWidth="1.5" />
                <rect x="3" y="0" width="34" height="20" rx="3" fill="#22c55e" stroke="#16a34a" strokeWidth="1.5" />
                <circle cx="20" cy="10" r="5" fill="#15803d" />
                <text x="18" y="14" fill="#ffffff" fontSize="9" fontWeight="bold" fontFamily="sans-serif">₹</text>
              </g>
              <circle cx="106" cy="120" r="4.5" fill={skinColor} />
              <circle cx="138" cy="120" r="4.5" fill={skinColor} />
            </>
          ) : pose === 'holding_invoice' ? (
            <>
              {/* Left Arm holding paper sheet */}
              <path d="M 82 92 L 75 120 L 90 125" stroke={shirtColor} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
              {/* Right Arm pointing to paper */}
              <path d="M 118 92 L 125 110 L 115 125" stroke={shirtColor} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />

              {/* Paper Invoice with Due Stamp */}
              <g id="prop-invoice" transform="translate(75, 100) rotate(-6)">
                <rect x="0" y="0" width="28" height="38" rx="2" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5" />
                <line x1="5" y1="8" x2="23" y2="8" stroke="#cbd5e1" strokeWidth="2" />
                <line x1="5" y1="14" x2="23" y2="14" stroke="#cbd5e1" strokeWidth="2" />
                <line x1="5" y1="20" x2="18" y2="20" stroke="#cbd5e1" strokeWidth="2" />
                {/* Red DUE stamp */}
                <rect x="4" y="24" width="20" height="9" rx="2" fill="none" stroke="#ef4444" strokeWidth="1.5" />
                <text x="6" y="31" fill="#ef4444" fontSize="6.5" fontWeight="900" fontFamily="sans-serif">DUE</text>
              </g>
            </>
          ) : pose === 'celebrating' ? (
            <>
              {/* Both arms raised triumphantly in V-shape */}
              <path d="M 82 92 L 62 65 L 50 35" stroke={shirtColor} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="49" cy="33" r="5" fill={skinColor} />

              <path d="M 118 92 L 138 65 L 150 35" stroke={shirtColor} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="151" cy="33" r="5" fill={skinColor} />

              {/* Celebration star bursts */}
              <g id="stars" opacity="0.85">
                <polygon points="35,25 38,30 44,30 39,34 41,39 35,36 30,39 32,34 27,30 33,30" fill="#facc15" />
                <polygon points="165,22 168,27 174,27 169,31 171,36 165,33 160,36 162,31 157,27 163,27" fill="#38bdf8" />
              </g>
            </>
          ) : pose === 'stress_panic' ? (
            <>
              {/* Both hands clutching head in despair */}
              <path d="M 82 92 L 70 70 L 80 50" stroke={shirtColor} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="81" cy="48" r="5" fill={skinColor} />

              <path d="M 118 92 L 130 70 L 120 50" stroke={shirtColor} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="119" cy="48" r="5" fill={skinColor} />
            </>
          ) : pose === 'sitting_desk' ? (
            <>
              {/* Arms reaching to keyboard */}
              <path d="M 82 92 L 95 130 L 122 152" stroke={shirtColor} strokeWidth="7.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="123" cy="153" r="4" fill={skinColor} />

              <path d="M 118 92 L 125 125 L 138 152" stroke={shirtColor} strokeWidth="7.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="139" cy="153" r="4" fill={skinColor} />
            </>
          ) : pose === 'walking' ? (
            <>
              {/* Left arm swinging with walk */}
              <line x1="82" y1="92" x2={75 + walkArmL} y2="135" stroke={shirtColor} strokeWidth="8" strokeLinecap="round" />
              <circle cx={75 + walkArmL} cy="138" r="4.5" fill={skinColor} />

              {/* Right arm swinging with walk */}
              <line x1="118" y1="92" x2={125 + walkArmR} y2="135" stroke={shirtColor} strokeWidth="8" strokeLinecap="round" />
              <circle cx={125 + walkArmR} cy="138" r="4.5" fill={skinColor} />
            </>
          ) : (
            /* Default relaxed idle arms */
            <>
              <path d="M 82 92 L 72 125 L 75 145" stroke={shirtColor} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="75" cy="147" r="4.5" fill={skinColor} />

              <path d="M 118 92 L 128 125 L 125 145" stroke={shirtColor} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="125" cy="147" r="4.5" fill={skinColor} />
            </>
          )}
        </g>
      </svg>
    </div>
  );
}

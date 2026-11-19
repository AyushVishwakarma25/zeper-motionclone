import React from 'react';
import {useCurrentFrame, useVideoConfig, spring, interpolate, AbsoluteFill} from 'remotion';
import {StickmanCharacter} from '../components/StickmanCharacter';
import {AnimatedProp} from '../components/AnimatedProps';
import {DynamicEnvironment} from '../components/DynamicEnvironment';
import {CashFlowSplit, TimelineGap, AnimatedBarChart} from '../components/DataVisualizations';

/**
 * CharacterStory Template
 * Primary narrative vehicle for human-centered explainer videos.
 * Combines dynamic art direction environment, animated vector character,
 * contextual narrative props, and clean punchy on-screen typography.
 */
export function CharacterStory({
  scene = {},
  headline = '',
  onScreenText = '',
  visualMetaphor = '',
  characterPose = 'idle',
  characterAction = '',
  characterExpression = 'neutral',
  propType = 'money_stack',
  propAmount = '',
  artDirection = 'editorial_flat',
  accent = '#00f2fe',
  bg = '#0a0a12',
  dataVizType = null
}) {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();

  const isVertical = height > width;
  const isSquare = Math.abs(height - width) < 50;

  // Resolve on-screen text (Prioritize dedicated on_screen_text, then short headline, fallback to empty)
  const displayText = onScreenText || scene.on_screen_text || headline || scene.headline || scene.title || '';
  const metaphor = visualMetaphor || scene.visual_metaphor || '';

  // Resolve pose and expression from scene attributes or props
  let resolvedPose = characterPose || scene.character_pose || 'idle';
  const actionLower = (characterAction || scene.character_action || '').toLowerCase();
  if (actionLower.includes('point')) resolvedPose = 'pointing';
  else if (actionLower.includes('money') || actionLower.includes('cash') || actionLower.includes('paid')) resolvedPose = 'holding_money';
  else if (actionLower.includes('invoice') || actionLower.includes('bill')) resolvedPose = 'holding_invoice';
  else if (actionLower.includes('stress') || actionLower.includes('panic') || actionLower.includes('worry')) resolvedPose = 'stress_panic';
  else if (actionLower.includes('confus')) resolvedPose = 'confused';
  else if (actionLower.includes('celebrat') || actionLower.includes('happy')) resolvedPose = 'celebrating';
  else if (actionLower.includes('desk') || actionLower.includes('laptop') || actionLower.includes('sit')) resolvedPose = 'sitting_desk';
  else if (actionLower.includes('walk') || actionLower.includes('move')) resolvedPose = 'walking';

  let resolvedExpression = characterExpression || scene.character_expression || 'neutral';
  if (resolvedPose === 'stress_panic') resolvedExpression = 'stressed';
  else if (resolvedPose === 'celebrating') resolvedExpression = 'happy';
  else if (resolvedPose === 'confused') resolvedExpression = 'surprised';

  // Resolve props
  const resolvedProp = propType || scene.prop_type || scene.props || 'money_stack';
  const resolvedAmount = propAmount || scene.prop_amount || scene.stat || '';

  // Resolve art direction
  const resolvedArt = artDirection || scene.art_direction || scene.environment || 'editorial_flat';

  // Typography entrance spring
  const textSpring = spring({
    frame: Math.max(0, frame - 4),
    fps,
    config: {damping: 14, stiffness: 110}
  });

  const textY = interpolate(textSpring, [0, 1], [30, 0]);
  const textOpacity = interpolate(frame, [4, 14], [0, 1], {extrapolateRight: 'clamp'});

  // Badge entrance
  const badgeSpring = spring({
    frame: Math.max(0, frame - 2),
    fps,
    config: {damping: 16, stiffness: 130}
  });

  // Calculate layout dimensions
  const charSize = isVertical ? Math.min(width * 0.75, 480) : Math.min(height * 0.65, 440);
  const propSize = isVertical ? Math.min(width * 0.42, 220) : Math.min(height * 0.35, 200);

  // Check if data viz is requested
  const vizType = dataVizType || scene.data_viz_type || (scene.template === 'finance_breakdown' ? 'cash_flow' : scene.template === 'timeline_gap' ? 'timeline' : null);

  return (
    <AbsoluteFill style={{overflow: 'hidden'}}>
      {/* Dynamic Art Direction Environment */}
      <DynamicEnvironment
        artDirection={resolvedArt}
        accent={accent}
        bg={bg}
      />

      {/* Main Safe-Area Composition Container */}
      <AbsoluteFill
        style={{
          padding: isVertical ? '90px 48px 120px 48px' : '60px 80px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          boxSizing: 'border-box',
          zIndex: 10
        }}
      >
        {/* Top Section: Metaphor Badge & On-Screen Punchy Headline */}
        <div style={{width: '100%', maxWidth: isVertical ? '100%' : '900px'}}>
          {metaphor && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 16px',
                borderRadius: '999px',
                background: `${accent}1f`,
                border: `1.5px solid ${accent}55`,
                color: accent,
                fontSize: isVertical ? '14px' : '15px',
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                transform: `scale(${badgeSpring})`,
                transformOrigin: 'left center',
                marginBottom: '14px',
                boxShadow: `0 4px 16px ${accent}22`
              }}
            >
              <span style={{display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: accent}} />
              {metaphor}
            </div>
          )}

          {displayText && (
            <div
              style={{
                transform: `translateY(${textY}px)`,
                opacity: textOpacity,
                fontSize: isVertical ? '38px' : '44px',
                lineHeight: 1.15,
                fontWeight: 900,
                color: '#ffffff',
                fontFamily: 'Inter, system-ui, sans-serif',
                letterSpacing: '-0.02em',
                textShadow: '0 4px 24px rgba(0,0,0,0.6)'
              }}
            >
              {displayText}
            </div>
          )}
        </div>

        {/* Center / Body Section: Character + Props + Optional Visualizations */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: isVertical ? 'column' : 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: isVertical ? '24px' : '60px',
            margin: isVertical ? '30px 0' : '20px 0',
            position: 'relative'
          }}
        >
          {/* Character Stage */}
          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <StickmanCharacter
              pose={resolvedPose}
              expression={resolvedExpression}
              size={charSize}
              shirtColor={accent}
            />

            {/* If vertical and has prop, place prop floating near hand/shoulder */}
            {isVertical && resolvedProp && !vizType && (
              <div
                style={{
                  position: 'absolute',
                  top: resolvedPose === 'sitting_desk' ? '20%' : '15%',
                  right: '-10%',
                  zIndex: 15
                }}
              >
                <AnimatedProp
                  type={resolvedProp}
                  size={propSize}
                  amount={resolvedAmount}
                />
              </div>
            )}
          </div>

          {/* Interactive Prop or Data Visualization Stage */}
          {vizType ? (
            <div style={{flex: 1, width: '100%', maxWidth: isVertical ? '100%' : '580px'}}>
              {vizType === 'cash_flow' && (
                <CashFlowSplit
                  revenue={resolvedAmount || '₹10,00,000'}
                  cogs="₹6,00,000"
                  salaries="₹2,00,000"
                  rent="₹1,00,000"
                  net="₹1,00,000"
                  accent={accent}
                />
              )}
              {vizType === 'timeline' && (
                <TimelineGap
                  invoiceDays={60}
                  payableDays={30}
                  gapDays={30}
                  accent={accent}
                />
              )}
              {vizType === 'bar_chart' && (
                <AnimatedBarChart
                  data={scene.chart_data || [
                    {label: 'Sales Revenue', value: 100, color: '#22c55e'},
                    {label: 'Realized Cash', value: 35, color: '#ef4444'},
                    {label: 'Pending Invoices', value: 65, color: '#f59e0b'}
                  ]}
                  title={scene.chart_title || 'Cash Realization Gap'}
                  accent={accent}
                />
              )}
            </div>
          ) : (
            !isVertical && resolvedProp && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '24px',
                  borderRadius: '24px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.08)'
                }}
              >
                <AnimatedProp
                  type={resolvedProp}
                  size={propSize}
                  amount={resolvedAmount}
                />
              </div>
            )
          )}
        </div>

        {/* Bottom subtle anchor line (broadcast safe spacing) */}
        <div style={{height: '10px'}} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
export default CharacterStory;

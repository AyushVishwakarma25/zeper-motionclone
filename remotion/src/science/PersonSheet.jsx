import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {Person} from './Person.jsx';
import {S} from './theme.mjs';

export function PersonSheet({atSeconds = null}) {
  const f = useCurrentFrame(), {fps} = useVideoConfig(), t = atSeconds ?? f / fps;
  const cast = [
    {skin: S.skin.deep, hair: {style: 'short', color: S.hair.black}, shirt: S.teal, headphones: true, controller: true, mood: 'neutral'},
    {skin: S.skin.tan, hair: {style: 'bob', color: S.hair.brown}, shirt: S.blue, mood: 'smile', mouth: 'C'},
    {skin: S.skin.light, hair: {style: 'curly', color: S.hair.ginger}, shirt: '#e8b030', glasses: true, mood: 'smile', mouth: 'D'},
    {skin: S.skin.pale, hair: {style: 'bald', color: S.hair.gray}, shirt: S.purple, mood: 'worried', mouth: 'E'},
    {skin: S.skin.brown, hair: {style: 'long', color: S.hair.black}, shirt: '#c0405a', arms: 'cheer', mood: 'cheer', mouth: 'D'},
    {skin: S.skin.tan, hair: {style: 'short', color: S.hair.gray}, shirt: S.purple, view: 'back', mood: 'neutral'},
  ];
  return (<AbsoluteFill style={{background: S.bg}}>{cast.map((c, i) => <div key={i} style={{position: 'absolute', left: 10 + (i % 3) * 235, top: 40 + Math.floor(i / 3) * 360, width: 225, height: 315}}><Person t={t} seed={i + 1} {...c} /></div>)}</AbsoluteFill>);
}
export default PersonSheet;

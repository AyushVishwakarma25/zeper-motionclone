import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {DynamicSvgIcon} from '../src/explainer/DynamicSvgIcon.js';

test('DynamicSvgIcon renders structured declarative layers', () => {
  const spec = {
    viewBox: '0 0 400 400',
    layers: [
      {
        tag: 'rect',
        props: {x: 20, y: 30, width: 360, height: 340, rx: 16, fill: '#f8fafc'},
        anim: {enter: {delay: 0.05, duration: 0.4}}
      },
      {
        tag: 'circle',
        props: {cx: 200, cy: 200, r: 80, fill: '#3b82f6'},
        anim: {pulse: {freq: 4, amp: 0.05}}
      }
    ]
  };

  const element = DynamicSvgIcon({spec, t: 0.5, d: 3});
  assert.ok(element);
  assert.equal(element.type, 'svg');
  assert.equal(element.props.viewBox, '0 0 400 400');
});

test('DynamicSvgIcon sanitizes and renders raw svg markup string', () => {
  const spec = {
    viewBox: '0 0 400 400',
    svg_markup: '<circle cx="200" cy="200" r="50" fill="green" /><script>alert("hack")</script>'
  };

  const element = DynamicSvgIcon({spec, t: 0.2, d: 3});
  assert.ok(element);
  assert.equal(element.type, 'svg');
  const innerHtml = element.props.children.props.dangerouslySetInnerHTML.__html;
  assert.ok(innerHtml.includes('circle'));
  assert.ok(!innerHtml.includes('script'), 'Script tags must be stripped');
});

test('DynamicSvgIcon renders fallback badge when spec is minimal', () => {
  const spec = {id: 'custom_ai_chip', title: 'AI Chip'};
  const element = DynamicSvgIcon({spec, t: 0.1, d: 3});
  assert.ok(element);
  assert.equal(element.type, 'svg');
});

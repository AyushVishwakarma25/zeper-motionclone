import {ShieldCrack, Flask, Gauge, Radar, LockHack} from './concepts.jsx';
import {CalendarFill, CarHouseX, InvestorsCash, ExpectLine, WhyMark} from './everyday.jsx';
import {GoldBars, SilverCoin, Candles, AiBars, Bond} from './finance.jsx';

// The catalog the Director chooses from. `use` tells it WHEN each icon fits; `params` are the only knobs it may set.
export const ICONS = {
  gold_bars: {C: GoldBars, use: 'gold, wealth, safe haven asset', params: {fall: 'bool: show a red falling arrow'}},
  silver_coin: {C: SilverCoin, use: 'silver, a price sliding down a slope', params: {}},
  candles: {C: Candles, use: 'stock market, trading chart, a rise then a crash', params: {}},
  ai_bars: {C: AiBars, use: 'AI stocks, tech growth, a rising bar chart with an AI chip', params: {}},
  bond: {C: Bond, use: 'government bonds, US treasury, debt certificates', params: {}},
  shield_crack: {C: ShieldCrack, use: 'safe haven, protection that fails', params: {crack: 'bool'}},
  flask: {C: Flask, use: 'lab, science, something manufactured or synthetic (gold from a lab)', params: {makes: 'gold|none'}},
  gauge: {C: Gauge, use: 'trust, confidence, risk level meter', params: {from: '0..1', to: '0..1: 0 = Low, 1 = High'}},
  radar: {C: Radar, use: 'military, targeting, surveillance, an attack plan', params: {lock: 'bool'}},
  lock_hack: {C: LockHack, use: 'hack, security breach, exchange or bank theft', params: {hacked: 'bool'}},
  calendar_fill: {C: CalendarFill, use: 'saving over months, an emergency fund, a timeline of a year', params: {months: '0..12 months filled'}},
  car_house_x: {C: CarHouseX, use: 'big purchases to avoid or postpone (car, house)', params: {cross: 'bool'}},
  investors_cash: {C: InvestorsCash, use: 'big investors pulling money out of a falling market into cash', params: {}},
  expect_line: {C: ExpectLine, use: 'a chart versus what people expected; hype versus reality', params: {label: 'short text'}},
  why_mark: {C: WhyMark, use: 'a pause on the question; the audience wonders why', params: {text: 'short text'}},
};
export const catalog = () => Object.fromEntries(Object.entries(ICONS).map(([k, v]) => [k, {use: v.use, params: v.params}]));

import { describe, it, expect } from 'vitest';
import {
  jaccardSimilarity,
  isHeadlineSimilarToHistory,
  pickDesign,
  HistoryItem,
  DesignSelection
} from '../src/design/uniqueness.js';

describe('Uniqueness Engine - Jaccard Similarity', () => {
  it('returns 1.0 for identical sentences', () => {
    const s1 = 'Why your WordPress website is slow';
    const s2 = 'Why your WordPress website is slow';
    expect(jaccardSimilarity(s1, s2)).toBe(1.0);
  });

  it('returns 0.0 for completely disjoint sentences', () => {
    const s1 = 'Ultra fast NVMe Cloud VPS';
    const s2 = 'Chocolate chip cookie recipe baking';
    expect(jaccardSimilarity(s1, s2)).toBe(0);
  });

  it('detects high similarity between slight rephrasings', () => {
    const s1 = '3 quick ways to speed up your WordPress site';
    const s2 = '3 quick ways to speed up your WordPress blog';
    const score = jaccardSimilarity(s1, s2);
    expect(score).toBeGreaterThan(0.6);
  });

  it('flags headline exceeding 0.6 similarity against history', () => {
    const history: HistoryItem[] = [
      {
        date: '2026-11-10',
        slot: 1,
        template: 'T02-split-card',
        palette: 'ocean-blue',
        decoration: 'dots-grid',
        layoutVariant: 0,
        headline: 'Why you need NVMe VPS for trading',
        pillar: 'tips'
      }
    ];

    const duplicate = isHeadlineSimilarToHistory('Why you need NVMe VPS for trading today', history);
    expect(duplicate.similar).toBe(true);

    const novel = isHeadlineSimilarToHistory('How to configure DNS records in cPanel', history);
    expect(novel.similar).toBe(false);
  });
});

describe('Uniqueness Engine - Design Selection Rules', () => {
  it('prevents reusing the same template on the same day', () => {
    const date = '2026-11-18';
    const history: HistoryItem[] = [];
    const todayDesigns: DesignSelection[] = [
      {
        template: 'T01-bold-statement',
        palette: 'ocean-blue',
        decoration: 'mesh-gradient',
        layoutVariant: 0,
        seed: 111,
        reason: 'test'
      }
    ];

    const pick = pickDesign({
      date,
      slot: 2,
      totalSlotsToday: 5,
      pillar: 'growth',
      format: 'single',
      allowedTemplates: ['T01-bold-statement', 'T02-split-card', 'T08-browser-mockup'],
      history,
      todayDesigns
    });

    expect(pick.template).not.toBe('T01-bold-statement');
    expect(['T02-split-card', 'T08-browser-mockup']).toContain(pick.template);
  });

  it('prevents reusing the same palette on the same day', () => {
    const date = '2026-11-18';
    const history: HistoryItem[] = [];
    const todayDesigns: DesignSelection[] = [
      {
        template: 'T01-bold-statement',
        palette: 'ocean-blue',
        decoration: 'mesh-gradient',
        layoutVariant: 0,
        seed: 111,
        reason: 'test'
      }
    ];

    const pick = pickDesign({
      date,
      slot: 2,
      totalSlotsToday: 5,
      pillar: 'growth',
      format: 'single',
      allowedTemplates: ['T02-split-card'],
      history,
      todayDesigns
    });

    expect(pick.palette).not.toBe('ocean-blue');
  });

  it('guarantees brand accent palette in at least 2 of 5 daily posts', () => {
    const date = '2026-11-18';
    const history: HistoryItem[] = [];
    const todayDesigns: DesignSelection[] = [];

    // Run 5 slots
    for (let slot = 1; slot <= 5; slot++) {
      const pick = pickDesign({
        date,
        slot,
        totalSlotsToday: 5,
        pillar: slot === 5 ? 'educational' : 'tips',
        format: slot === 5 ? 'carousel' : 'single',
        allowedTemplates: slot === 5 ? ['T11-carousel'] : ['T01-bold-statement', 'T02-split-card', 'T03-checklist', 'T04-big-number'],
        history,
        todayDesigns
      });
      todayDesigns.push(pick);
    }

    const brandAccents = todayDesigns.filter(d =>
      ['ocean-blue', 'electric-indigo', 'navy-sky', 'slate-cyan'].includes(d.palette)
    );
    expect(brandAccents.length).toBeGreaterThanOrEqual(2);
  });

  it('is completely deterministic for identical date and slot', () => {
    const date = '2026-11-18';
    const pick1 = pickDesign({
      date,
      slot: 3,
      pillar: 'growth',
      format: 'single',
      allowedTemplates: ['T01-bold-statement', 'T02-split-card'],
      history: [],
      todayDesigns: []
    });

    const pick2 = pickDesign({
      date,
      slot: 3,
      pillar: 'growth',
      format: 'single',
      allowedTemplates: ['T01-bold-statement', 'T02-split-card'],
      history: [],
      todayDesigns: []
    });

    expect(pick1).toEqual(pick2);
  });
});

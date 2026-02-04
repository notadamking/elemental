import { describe, expect, test } from 'bun:test';
import { reciprocalRankFusion, type RankedResult } from './fusion.js';

describe('reciprocalRankFusion', () => {
  test('returns empty array for empty rankings', () => {
    expect(reciprocalRankFusion([])).toEqual([]);
  });

  test('returns empty array for empty ranking sets', () => {
    expect(reciprocalRankFusion([[], []])).toEqual([]);
  });

  test('handles single ranking set', () => {
    const ranking: RankedResult[] = [
      { documentId: 'a', rank: 1 },
      { documentId: 'b', rank: 2 },
      { documentId: 'c', rank: 3 },
    ];
    const fused = reciprocalRankFusion([ranking]);
    expect(fused).toHaveLength(3);
    expect(fused[0].documentId).toBe('a');
    expect(fused[1].documentId).toBe('b');
    expect(fused[2].documentId).toBe('c');
  });

  test('combines overlapping rankings', () => {
    const ftsRanking: RankedResult[] = [
      { documentId: 'a', rank: 1 },
      { documentId: 'b', rank: 2 },
      { documentId: 'c', rank: 3 },
    ];
    const semanticRanking: RankedResult[] = [
      { documentId: 'b', rank: 1 },
      { documentId: 'a', rank: 2 },
      { documentId: 'd', rank: 3 },
    ];

    const fused = reciprocalRankFusion([ftsRanking, semanticRanking]);

    // 'a' and 'b' appear in both rankings and should have higher scores
    const docIds = fused.map((r) => r.documentId);
    expect(docIds).toContain('a');
    expect(docIds).toContain('b');
    expect(docIds).toContain('c');
    expect(docIds).toContain('d');

    // 'a' and 'b' should be ranked higher than 'c' and 'd' (appear in both lists)
    const aScore = fused.find((r) => r.documentId === 'a')!.score;
    const bScore = fused.find((r) => r.documentId === 'b')!.score;
    const cScore = fused.find((r) => r.documentId === 'c')!.score;
    const dScore = fused.find((r) => r.documentId === 'd')!.score;

    expect(aScore).toBeGreaterThan(cScore);
    expect(bScore).toBeGreaterThan(dScore);
  });

  test('handles disjoint rankings', () => {
    const ranking1: RankedResult[] = [
      { documentId: 'a', rank: 1 },
      { documentId: 'b', rank: 2 },
    ];
    const ranking2: RankedResult[] = [
      { documentId: 'c', rank: 1 },
      { documentId: 'd', rank: 2 },
    ];

    const fused = reciprocalRankFusion([ranking1, ranking2]);

    expect(fused).toHaveLength(4);
    // Rank 1 items should score higher than rank 2 items
    const aScore = fused.find((r) => r.documentId === 'a')!.score;
    const bScore = fused.find((r) => r.documentId === 'b')!.score;
    expect(aScore).toBeGreaterThan(bScore);
  });

  test('respects limit parameter', () => {
    const ranking: RankedResult[] = [
      { documentId: 'a', rank: 1 },
      { documentId: 'b', rank: 2 },
      { documentId: 'c', rank: 3 },
    ];
    const fused = reciprocalRankFusion([ranking], 60, 2);
    expect(fused).toHaveLength(2);
  });

  test('uses custom k value', () => {
    const ranking: RankedResult[] = [
      { documentId: 'a', rank: 1 },
    ];
    // With k=60 (default), score = 1/(60+1) ≈ 0.01639
    const defaultK = reciprocalRankFusion([ranking], 60);
    expect(defaultK[0].score).toBeCloseTo(1 / 61, 5);

    // With k=1, score = 1/(1+1) = 0.5
    const smallK = reciprocalRankFusion([ranking], 1);
    expect(smallK[0].score).toBeCloseTo(0.5, 5);
  });

  test('scores are sorted descending', () => {
    const ranking1: RankedResult[] = [
      { documentId: 'a', rank: 1 },
      { documentId: 'b', rank: 5 },
    ];
    const ranking2: RankedResult[] = [
      { documentId: 'b', rank: 1 },
      { documentId: 'a', rank: 5 },
    ];

    const fused = reciprocalRankFusion([ranking1, ranking2]);

    for (let i = 0; i < fused.length - 1; i++) {
      expect(fused[i].score).toBeGreaterThanOrEqual(fused[i + 1].score);
    }
  });
});

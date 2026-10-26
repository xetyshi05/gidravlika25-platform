import { usage } from './server-resources.service';

describe('server resource usage', () => {
  it('returns a bounded percentage', () => {
    expect(usage(256, 1024)).toEqual({
      usedBytes: 256,
      totalBytes: 1024,
      usedPercent: 25,
    });
    expect(usage(2048, 1024).usedPercent).toBe(100);
    expect(usage(-1, 1024).usedPercent).toBe(0);
    expect(usage(1, 0).usedPercent).toBe(0);
  });
});

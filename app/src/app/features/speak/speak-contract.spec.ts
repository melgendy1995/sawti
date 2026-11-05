import { cssGridColumn, cssGridRow, spokenText } from './speak-contract';

describe('speak grid placement', () => {
  it('puts document column 0 on the physical right for an RTL board', () => {
    expect(cssGridColumn(0, 5, 'rtl')).toBe(5);
    expect(cssGridColumn(4, 5, 'rtl')).toBe(1);
    expect(cssGridColumn(0, 2, 'rtl')).toBe(2);
    expect(cssGridColumn(1, 2, 'rtl')).toBe(1);
  });

  it('puts document column 0 on the physical left for an LTR board', () => {
    expect(cssGridColumn(0, 5, 'ltr')).toBe(1);
    expect(cssGridColumn(4, 5, 'ltr')).toBe(5);
  });

  it('numbers rows from the top', () => {
    expect(cssGridRow(0)).toBe(1);
    expect(cssGridRow(2)).toBe(3);
  });

  it('speaks the override when it is set, otherwise the label', () => {
    expect(spokenText({ label: 'أكل', spoken: 'الأكل' })).toBe('الأكل');
    expect(spokenText({ label: 'مية', spoken: null })).toBe('مية');
    expect(spokenText({ label: 'مية', spoken: '   ' })).toBe('مية');
  });
});

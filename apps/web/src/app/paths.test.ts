import { describe, expect, it } from 'vitest';

import { scopedPath } from './paths.js';

describe('deployment paths', () => {
  it('keeps API, attachment, and download paths inside the configured application directory', () => {
    expect(scopedPath('/api/tasks', '/qetodo/')).toBe('/qetodo/api/tasks');
    expect(scopedPath('/api/transfer/export.json', '/qetodo/')).toBe('/qetodo/api/transfer/export.json');
    expect(scopedPath('icons/app-icon.png', '/qetodo/')).toBe('/qetodo/icons/app-icon.png');
    expect(scopedPath('/api/tasks', '/')).toBe('/api/tasks');
  });
});

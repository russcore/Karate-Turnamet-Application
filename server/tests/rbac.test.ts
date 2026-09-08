import { describe, expect, it } from 'vitest';
import { assertTatamiAccess } from '../src/auth/guards.js';
import type { AuthUser } from '../src/types.js';

const admin: AuthUser = { id: 1, username: 'admin', role: 'admin', tatamiIds: [] };
const editor1: AuthUser = { id: 2, username: 'tatami1', role: 'tatami_editor', tatamiIds: [1] };
const viewer: AuthUser = { id: 3, username: 'view', role: 'viewer', tatamiIds: [] };

describe('tatami access control', () => {
  it('admin may act on any tatami', () => {
    expect(assertTatamiAccess(admin, 1)).toBe(true);
    expect(assertTatamiAccess(admin, 99)).toBe(true);
    expect(assertTatamiAccess(admin, null)).toBe(true);
  });

  it('a tatami editor may act only on assigned tatami', () => {
    expect(assertTatamiAccess(editor1, 1)).toBe(true);
    expect(assertTatamiAccess(editor1, 2)).toBe(false); // cross-tatami -> denied (403 at the route)
    expect(assertTatamiAccess(editor1, null)).toBe(false);
  });

  it('viewers and anonymous users cannot edit', () => {
    expect(assertTatamiAccess(viewer, 1)).toBe(false);
    expect(assertTatamiAccess(null, 1)).toBe(false);
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessAdmin, canManageClubs, toAdminEffectiveRole } from '../lib/adminPermissions.ts';

test('toAdminEffectiveRole prioritizes club_role over global role', () => {
  assert.equal(toAdminEffectiveRole('USER', 'CLUB_ADMIN'), 'CLUB_ADMIN');
  assert.equal(toAdminEffectiveRole('GLOBAL_ADMIN', null), 'GLOBAL_ADMIN');
  assert.equal(toAdminEffectiveRole(undefined, 'RECORDER'), 'RECORDER');
  assert.equal(toAdminEffectiveRole(undefined, undefined), 'UNKNOWN');
});

test('admin access and club management permissions are role-based', () => {
  assert.equal(canAccessAdmin('GLOBAL_ADMIN'), true);
  assert.equal(canAccessAdmin('CLUB_ADMIN'), true);
  assert.equal(canAccessAdmin('USER'), false);
  assert.equal(canAccessAdmin('RECORDER'), false);

  assert.equal(canManageClubs('GLOBAL_ADMIN'), true);
  assert.equal(canManageClubs('CLUB_ADMIN'), false);
});

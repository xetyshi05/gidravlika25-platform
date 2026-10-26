import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CrmAdminGuard } from './crm-admin.guard';

describe('CrmAdminGuard', () => {
  const guard = new CrmAdminGuard();

  function context(role?: string) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          currentUser: role ? { id: 'user-1', name: 'User', role } : undefined,
        }),
      }),
    } as ExecutionContext;
  }

  it('allows a CRM administrator', () => {
    expect(guard.canActivate(context('ADMIN'))).toBe(true);
  });

  it.each([['MANAGER'], [undefined]])('rejects a non-admin role: %s', (role) => {
    expect(() => guard.canActivate(context(role))).toThrow(ForbiddenException);
  });
});

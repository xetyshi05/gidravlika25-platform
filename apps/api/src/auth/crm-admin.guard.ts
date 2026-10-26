import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class CrmAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      currentUser?: { id: string; name: string; role: string };
    }>();
    if (request.currentUser?.role !== 'ADMIN') {
      throw new ForbiddenException('Требуются права администратора.');
    }
    return true;
  }
}

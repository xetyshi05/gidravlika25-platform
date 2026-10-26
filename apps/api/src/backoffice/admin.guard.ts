import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      backofficeUser?: {
        id: string;
        name: string;
        login: string;
        role: string;
      };
    }>();
    const user = await this.auth.getUser(request.headers.authorization, 'BACKOFFICE');
    if (user.role !== 'ADMIN') throw new ForbiddenException('Требуются права администратора.');
    request.backofficeUser = {
      id: user.id,
      name: user.name,
      login: user.login,
      role: user.role,
    };
    return true;
  }
}

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class AuthenticatedGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      currentUser?: { id: string; name: string; role: string };
    }>();
    const user = await this.auth.getUser(request.headers.authorization, 'CRM');
    request.currentUser = { id: user.id, name: user.name, role: user.role };
    return true;
  }
}

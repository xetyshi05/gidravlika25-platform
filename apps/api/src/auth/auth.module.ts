import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthenticatedGuard } from './authenticated.guard';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthenticatedGuard],
  exports: [AuthService, AuthenticatedGuard],
})
export class AuthModule {}

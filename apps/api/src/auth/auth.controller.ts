import { Body, Controller, Get, Headers, Ip, Post } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  AuthSession,
  BootstrapStatus,
  CurrentUser,
  OkResult,
  RecoveryCodes,
  TwoFactorRequired,
  TwoFactorSetup,
} from './auth.response';
import { CreateInitialAdminDto } from './dto/create-initial-admin.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyTwoFactorDto } from './dto/verify-two-factor.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}
  @Get('bootstrap-status') bootstrapStatus(): Promise<BootstrapStatus> {
    return this.authService.bootstrapStatus();
  }
  @Post('setup') setup(
    @Body() dto: CreateInitialAdminDto,
    @Headers('x-bootstrap-secret') bootstrapSecret?: string,
  ): Promise<TwoFactorRequired> {
    return this.authService.setup(dto, bootstrapSecret);
  }
  @Post('login') login(
    @Body() dto: LoginDto,
    @Ip() ipAddress: string,
    @Headers('x-application') application?: string,
  ): Promise<TwoFactorRequired> {
    return this.authService.login(dto, application, ipAddress);
  }
  @Get('two-factor/challenge') twoFactorChallenge(
    @Headers('x-two-factor-challenge') challengeToken?: string,
  ): Promise<TwoFactorSetup> {
    return this.authService.twoFactorChallenge(challengeToken);
  }
  @Post('two-factor/verify') verifyTwoFactor(
    @Body() dto: VerifyTwoFactorDto,
    @Headers('x-two-factor-challenge') challengeToken?: string,
  ): Promise<AuthSession> {
    return this.authService.verifyTwoFactor(dto, challengeToken);
  }
  @ApiBearerAuth()
  @Get('me')
  async me(
    @Headers('authorization') authorization?: string,
    @Headers('x-application') application?: string,
  ): Promise<CurrentUser> {
    const user = await this.authService.getUser(authorization, application);
    return { id: user.id, name: user.name, login: user.login, role: user.role };
  }
  @ApiBearerAuth()
  @Post('recovery-codes')
  regenerateRecoveryCodes(
    @Headers('authorization') authorization?: string,
    @Headers('x-application') application?: string,
  ): Promise<RecoveryCodes> {
    return this.authService.regenerateRecoveryCodes(authorization, application);
  }
  @ApiBearerAuth()
  @Post('logout')
  logout(@Headers('authorization') authorization?: string): Promise<OkResult> {
    return this.authService.logout(authorization);
  }
}

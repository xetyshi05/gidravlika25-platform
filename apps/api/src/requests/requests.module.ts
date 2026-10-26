import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';
import { PublicRequestSecurityService } from './public-request-security.service';
import { PublicRequestCaptchaService } from './public-request-captcha.service';

@Module({
  imports: [AuthModule],
  controllers: [RequestsController],
  providers: [RequestsService, PublicRequestSecurityService, PublicRequestCaptchaService],
})
export class RequestsModule {}

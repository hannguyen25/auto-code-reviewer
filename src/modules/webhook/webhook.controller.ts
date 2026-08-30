import { Controller, Post, Body, Headers, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { GithubSignatureGuard } from '../../common/guards/github-signature.guard';

@Controller('webhook')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post()
  @UseGuards(GithubSignatureGuard)
  @HttpCode(HttpStatus.ACCEPTED) // NFR-1.2: Trả về HTTP 202 ngay lập tức (<200ms)
  async handleWebhook(
    @Headers('x-github-event') event: string,
    @Body() payload: any,
  ) {
    if (event === 'pull_request') {
      const allowedActions = ['opened', 'reopened', 'synchronize'];
      if (allowedActions.includes(payload.action)) {
        await this.webhookService.handlePullRequestEvent(payload);
      }
    }
    return { status: 'ACCEPTED', event };
  }
}
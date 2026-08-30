import { Module } from '@nestjs/common';
import { GithubDispatcherService } from './github-dispatcher.service';

@Module({
  providers: [GithubDispatcherService],
  exports: [GithubDispatcherService],
})
export class GithubDispatcherModule {}
import { Module } from '@nestjs/common';
import { OrchestratorProcessor } from './orchestrator.processor';
import { ReviewGraphWorkflow } from './graphs/review.graph';
import { DiffParserModule } from '../diff-parser/diff-parser.module';
import { GithubDispatcherModule } from '../github-dispatcher/github-dispatcher.module';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [
    DiffParserModule,
    GithubDispatcherModule,
    MetricsModule,
  ],
  providers: [
    OrchestratorProcessor,
    ReviewGraphWorkflow, 
  ],
  exports: [ReviewGraphWorkflow],
})
export class OrchestratorModule {}
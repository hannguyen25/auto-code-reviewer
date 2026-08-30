import { Global, Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { AppMetricsService } from './metrics.service';

@Global()
@Module({
  imports: [
    PrometheusModule.register({
      path: '/metrics', // Prometheus Server sẽ crawl metrics tại http://localhost:3000/metrics
      defaultMetrics: {
        enabled: true, // Tự động thu thập CPU, RAM, Event Loop lag của Node.js process
      },
    }),
  ],
  providers: [AppMetricsService],
  exports: [AppMetricsService],
})
export class MetricsModule {}
import { Module } from '@nestjs/common';
import { SandboxService } from './sandbox.service';

@Module({
  providers: [SandboxService],
  exports: [SandboxService], // BẮT BUỘC: Export service để module khác sử dụng
})
export class SandboxModule {}
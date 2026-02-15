import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkersModule } from './workers.module';
import { startChannelInfoProcessor } from './processors/channel-info.processor';
async function bootstrap() {
  const logger = new Logger('WorkersBootstrap');

  const app = await NestFactory.createApplicationContext(WorkersModule);

  // Start channel info processor
  startChannelInfoProcessor();

  // Ad poster is now handled by SchedulerProcessor via BullMQ (CHECK_SCHEDULED_POSTS every 60s)
  // EscrowReleaseService is managed by NestJS ScheduleModule (@Interval)

  logger.log('Workers service started');

  // Graceful shutdown
  const shutdown = async () => {
    logger.log('Shutting down workers...');
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrap();

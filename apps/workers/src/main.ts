import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkersModule } from './workers.module';
import { startChannelInfoProcessor } from './processors/channel-info.processor';
import { startAdPosterProcessor } from './processors/ad-poster.processor';

async function bootstrap() {
  const logger = new Logger('WorkersBootstrap');

  const app = await NestFactory.createApplicationContext(WorkersModule);

  // Start channel info processor
  startChannelInfoProcessor();

  // Start ad poster processor
  startAdPosterProcessor();

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

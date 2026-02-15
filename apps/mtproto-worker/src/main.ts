import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { MtprotoWorkerModule } from './mtproto-worker.module';

async function bootstrap() {
  const logger = new Logger('MTProtoWorker');

  // Create HTTP application for internal API endpoints
  const app = await NestFactory.create(MtprotoWorkerModule);

  const port = process.env.MTPROTO_PORT || 3001;
  await app.listen(port);

  logger.log(`MTProto worker service started on port ${port}`);

  const shutdown = async () => {
    logger.log('Shutting down MTProto worker...');
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrap();

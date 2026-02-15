import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES, AutopostJobData } from '@tam/queue-contracts';
import { AutopostService } from '../services/autopost.service';

@Processor(QUEUE_NAMES.AUTOPOST)
export class AutopostProcessor extends WorkerHost {
  private readonly logger = new Logger(AutopostProcessor.name);

  constructor(private autopostService: AutopostService) {
    super();
  }

  async process(job: Job<AutopostJobData>): Promise<void> {
    const {
      dealId,
      telegramChannelId,
      contentText,
      contentMediaUrls,
    } = job.data;

    this.logger.log(`Processing autopost: deal ${dealId}`);

    const result = await this.autopostService.postToChannel(
      dealId,
      telegramChannelId,
      contentText,
      contentMediaUrls
    );

    if (!result.success) {
      throw new Error(result.error ?? 'Autopost failed');
    }

    this.logger.log(
      `Autopost completed for deal ${dealId}: ${result.postUrl}`
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Autopost job ${job.id} failed: ${error.message}`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Autopost job ${job.id} completed`);
  }
}

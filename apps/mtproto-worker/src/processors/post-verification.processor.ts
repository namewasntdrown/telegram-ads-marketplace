import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES, PostVerificationJobData } from '@tam/queue-contracts';
import { PostVerificationService } from '../services/post-verification.service';

@Processor(QUEUE_NAMES.POST_VERIFICATION)
export class PostVerificationProcessor extends WorkerHost {
  private readonly logger = new Logger(PostVerificationProcessor.name);

  constructor(private postVerificationService: PostVerificationService) {
    super();
  }

  async process(job: Job<PostVerificationJobData>): Promise<void> {
    const {
      dealId,
      telegramChannelId,
      postMessageId,
      minViewsRequired,
    } = job.data;

    this.logger.log(`Processing post verification: deal ${dealId}`);

    await this.postVerificationService.processVerification(
      dealId,
      telegramChannelId,
      postMessageId,
      minViewsRequired
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(
      `Post verification job ${job.id} failed: ${error.message}`
    );
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Post verification job ${job.id} completed`);
  }
}

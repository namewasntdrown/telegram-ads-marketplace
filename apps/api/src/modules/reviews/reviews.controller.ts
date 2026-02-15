import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto, ReviewResponseDto, ReviewsListDto } from './dto/review.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('channels/:channelId/reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  async create(
    @Param('channelId') channelId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateReviewDto
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.create(channelId, userId, dto);
  }

  @Get()
  async findAll(@Param('channelId') channelId: string): Promise<ReviewsListDto> {
    return this.reviewsService.findByChannel(channelId);
  }

  @Get('can-review')
  @UseGuards(AuthGuard('jwt'))
  async canReview(
    @Param('channelId') channelId: string,
    @CurrentUser('id') userId: string,
    @Query('dealId') dealId: string
  ): Promise<{ canReview: boolean; reason?: string }> {
    return this.reviewsService.checkCanReview(channelId, userId, dealId);
  }
}

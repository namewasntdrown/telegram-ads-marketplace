import { IsString, IsInt, IsOptional, Min, Max, MinLength, MaxLength } from 'class-validator';

export class CreateReviewDto {
  @IsString()
  dealId: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  comment?: string;
}

export class ReviewResponseDto {
  id: string;
  channelId: string;
  reviewerId: string;
  reviewerName?: string;
  dealId?: string;
  rating: number;
  comment?: string;
  createdAt: string;
}

export class ReviewsListDto {
  items: ReviewResponseDto[];
  total: number;
  avgRating: number;
}

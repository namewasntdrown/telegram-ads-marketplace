import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Star, MessageSquare } from 'lucide-react';
import { api } from '../api/client';
import { Card } from './ui';
import { StarRating } from './StarRating';
import { useTranslation } from '../i18n';

interface Review {
  id: string;
  reviewerName?: string;
  rating: number;
  comment?: string;
  createdAt: string;
}

interface ReviewsListProps {
  channelId: string;
}

export function ReviewsList({ channelId }: ReviewsListProps) {
  const { t, language } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ['channel-reviews', channelId],
    queryFn: async () => {
      const response = await api.get<{
        items: Review[];
        total: number;
        avgRating: number;
      }>(`/channels/${channelId}/reviews`);
      return response.data;
    },
    enabled: !!channelId,
  });

  if (isLoading) {
    return (
      <Card>
        <div className="space-y-4">
          <div className="h-6 w-32 skeleton rounded" />
          <div className="h-20 skeleton rounded-xl" />
          <div className="h-20 skeleton rounded-xl" />
        </div>
      </Card>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <Card>
        <div className="text-center py-8">
          <MessageSquare size={32} className="mx-auto text-tg-hint mb-3" />
          <p className="text-tg-hint">{t.reviews.noReviews}</p>
        </div>
      </Card>
    );
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <Card>
      {/* Header with avg rating */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Star size={18} className="text-amber-400" />
          {t.reviews.reviews}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-amber-400">
            {data.avgRating.toFixed(1)}
          </span>
          <span className="text-sm text-tg-hint">
            ({data.total} {t.reviews.reviewsCount})
          </span>
        </div>
      </div>

      {/* Reviews list */}
      <div className="space-y-4">
        {data.items.map((review, index) => (
          <motion.div
            key={review.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="p-4 rounded-xl bg-white/5"
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-medium">{review.reviewerName || 'Anonymous'}</p>
                <p className="text-xs text-tg-hint">{formatDate(review.createdAt)}</p>
              </div>
              <StarRating rating={review.rating} size={16} readonly />
            </div>
            {review.comment && (
              <p className="text-sm text-tg-hint mt-2">{review.comment}</p>
            )}
          </motion.div>
        ))}
      </div>
    </Card>
  );
}

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Button } from './ui';
import { StarRating } from './StarRating';
import { useTelegram } from '../hooks/useTelegram';
import { useTranslation } from '../i18n';

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelId: string;
  channelTitle: string;
  dealId: string;
}

export function ReviewModal({
  isOpen,
  onClose,
  channelId,
  channelTitle,
  dealId,
}: ReviewModalProps) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const { hapticFeedback, hapticNotification } = useTelegram();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const submitMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/channels/${channelId}/reviews`, {
        dealId,
        rating,
        comment: comment.trim() || undefined,
      });
      return response.data;
    },
    onSuccess: () => {
      hapticNotification?.('success');
      queryClient.invalidateQueries({ queryKey: ['channel', channelId] });
      queryClient.invalidateQueries({ queryKey: ['channel-reviews', channelId] });
      queryClient.invalidateQueries({ queryKey: ['deal', dealId] });
      onClose();
    },
    onError: () => {
      hapticNotification?.('error');
    },
  });

  const handleSubmit = () => {
    hapticFeedback?.('medium');
    submitMutation.mutate();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-md mx-auto"
          >
            <div className="neu-card rounded-2xl p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">{t.reviews.leaveReview}</h2>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Channel name */}
              <p className="text-sm text-tg-hint mb-4">
                {t.reviews.reviewFor} <span className="text-accent font-medium">{channelTitle}</span>
              </p>

              {/* Rating */}
              <div className="mb-6">
                <label className="block text-sm font-medium mb-3">
                  {t.reviews.yourRating}
                </label>
                <div className="flex justify-center">
                  <StarRating
                    rating={rating}
                    onChange={setRating}
                    size={36}
                  />
                </div>
              </div>

              {/* Comment */}
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">
                  {t.reviews.comment} <span className="text-tg-hint">({t.reviews.optional})</span>
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={t.reviews.commentPlaceholder}
                  rows={3}
                  maxLength={500}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-accent focus:outline-none resize-none"
                />
                <p className="text-xs text-tg-hint mt-1 text-right">
                  {comment.length}/500
                </p>
              </div>

              {/* Submit button */}
              <Button
                variant="primary"
                fullWidth
                onClick={handleSubmit}
                disabled={submitMutation.isPending || rating === 0}
              >
                {submitMutation.isPending ? (
                  t.reviews.submitting
                ) : (
                  <>
                    <Send size={18} />
                    {t.reviews.submit}
                  </>
                )}
              </Button>

              {submitMutation.isError && (
                <p className="text-red-400 text-sm mt-3 text-center">
                  {t.reviews.error}
                </p>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

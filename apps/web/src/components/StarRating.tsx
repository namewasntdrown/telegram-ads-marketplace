import { Star } from 'lucide-react';
import { motion } from 'framer-motion';

interface StarRatingProps {
  rating: number;
  maxRating?: number;
  size?: number;
  onChange?: (rating: number) => void;
  readonly?: boolean;
}

export function StarRating({
  rating,
  maxRating = 5,
  size = 24,
  onChange,
  readonly = false,
}: StarRatingProps) {
  const handleClick = (index: number) => {
    if (!readonly && onChange) {
      onChange(index + 1);
    }
  };

  return (
    <div className="flex gap-1">
      {Array.from({ length: maxRating }, (_, index) => {
        const isFilled = index < rating;
        return (
          <motion.button
            key={index}
            type="button"
            whileTap={readonly ? undefined : { scale: 0.9 }}
            onClick={() => handleClick(index)}
            disabled={readonly}
            className={`transition-colors ${
              readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110'
            }`}
          >
            <Star
              size={size}
              className={`transition-colors ${
                isFilled
                  ? 'fill-amber-400 text-amber-400'
                  : 'fill-transparent text-gray-300'
              }`}
            />
          </motion.button>
        );
      })}
    </div>
  );
}

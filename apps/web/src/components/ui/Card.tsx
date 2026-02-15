import { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface CardProps {
  children: ReactNode;
  variant?: 'default' | 'elevated' | 'bordered' | 'flat';
  className?: string;
  onClick?: () => void;
  animate?: boolean;
}

export function Card({
  children,
  variant = 'default',
  className = '',
  onClick,
  animate = true
}: CardProps) {
  const variantClasses = {
    default: 'tg-card',
    elevated: 'tg-card-elevated',
    bordered: 'tg-card-bordered',
    flat: 'tg-card-flat',
  };

  const content = (
    <div
      className={`${variantClasses[variant]} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );

  if (!animate) return content;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {content}
    </motion.div>
  );
}

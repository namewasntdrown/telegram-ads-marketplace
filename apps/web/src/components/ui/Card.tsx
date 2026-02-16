import { ReactNode } from 'react';

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
}: CardProps) {
  const variantClasses = {
    default: 'tg-card',
    elevated: 'tg-card-elevated',
    bordered: 'tg-card-bordered',
    flat: 'tg-card-flat',
  };

  return (
    <div
      className={`${variantClasses[variant]} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

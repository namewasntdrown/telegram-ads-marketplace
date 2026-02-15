import { useEffect, useState } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export function AnimatedCounter({
  value,
  duration = 1,
  decimals = 2,
  prefix = '',
  suffix = '',
  className = '',
}: AnimatedCounterProps) {
  const spring = useSpring(0, { duration: duration * 1000 });
  const display = useTransform(spring, (current) =>
    `${prefix}${current.toFixed(decimals)}${suffix}`
  );
  const [displayValue, setDisplayValue] = useState(`${prefix}0${suffix}`);

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  useEffect(() => {
    return display.on('change', (latest) => {
      setDisplayValue(latest);
    });
  }, [display]);

  return (
    <motion.span className={className}>
      {displayValue}
    </motion.span>
  );
}

interface BalanceDisplayProps {
  amount: string | number;
  currency?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function BalanceDisplay({
  amount,
  currency = 'TON',
  size = 'lg',
}: BalanceDisplayProps) {
  const numericValue = typeof amount === 'string' ? parseFloat(amount) || 0 : amount;

  const sizeClasses = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-4xl',
    xl: 'text-5xl',
  };

  return (
    <div className={`font-bold text-tg-text ${sizeClasses[size]}`}>
      <AnimatedCounter
        value={numericValue}
        decimals={numericValue % 1 === 0 ? 0 : 2}
        suffix={` ${currency}`}
      />
    </div>
  );
}

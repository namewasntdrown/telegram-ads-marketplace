import { motion } from 'framer-motion';

interface SegmentOption {
  value: string;
  label: string;
}

interface SegmentedControlProps {
  options: SegmentOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function SegmentedControl({
  options,
  value,
  onChange,
  className = '',
}: SegmentedControlProps) {
  const selectedIndex = options.findIndex((opt) => opt.value === value);

  return (
    <div className={`relative flex p-1 tg-segment ${className}`}>
      {/* Sliding indicator */}
      <motion.div
        className="absolute top-1 bottom-1 rounded-tg bg-tg-bg shadow-tg-card"
        style={{
          width: `calc(${100 / options.length}% - 4px)`,
        }}
        animate={{
          left: `calc(${(selectedIndex * 100) / options.length}% + 2px)`,
        }}
        transition={{
          type: 'spring',
          stiffness: 350,
          damping: 30,
        }}
      />

      {/* Options */}
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`relative z-10 flex-1 py-2 px-4 text-sm font-medium rounded-tg transition-colors duration-150 ${
            value === option.value ? 'text-tg-text' : 'text-tg-text-secondary'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

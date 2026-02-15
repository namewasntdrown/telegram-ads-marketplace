interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular' | 'card';
  width?: string | number;
  height?: string | number;
}

export function Skeleton({
  className = '',
  variant = 'rectangular',
  width,
  height,
}: SkeletonProps) {
  const baseClasses = 'skeleton animate-pulse';

  const variantClasses = {
    text: 'rounded h-4',
    circular: 'rounded-full',
    rectangular: 'rounded-tg',
    card: 'rounded-tg-md',
  };

  const style = {
    width: width ?? (variant === 'circular' ? '40px' : '100%'),
    height: height ?? (variant === 'circular' ? '40px' : variant === 'text' ? '16px' : '100px'),
  };

  return (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      style={style}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="tg-card animate-pulse">
      <div className="flex items-center gap-4 mb-4">
        <Skeleton variant="circular" width={48} height={48} />
        <div className="flex-1">
          <Skeleton variant="text" width="60%" className="mb-2" />
          <Skeleton variant="text" width="40%" height={12} />
        </div>
      </div>
      <Skeleton variant="rectangular" height={60} className="mb-3" />
      <Skeleton variant="rectangular" height={40} />
    </div>
  );
}

export function ChannelCardSkeleton() {
  return (
    <div className="tg-card animate-pulse">
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-3">
          <Skeleton variant="circular" width={44} height={44} />
          <div>
            <Skeleton variant="text" width={120} className="mb-1" />
            <Skeleton variant="text" width={80} height={12} />
          </div>
        </div>
        <Skeleton variant="rectangular" width={70} height={28} className="rounded-lg" />
      </div>
      <div className="flex gap-4 mb-3">
        <Skeleton variant="text" width={80} height={14} />
        <Skeleton variant="text" width={80} height={14} />
      </div>
      <Skeleton variant="rectangular" height={44} className="rounded-tg" />
    </div>
  );
}

export function ListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

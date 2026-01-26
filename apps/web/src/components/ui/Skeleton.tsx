/**
 * Skeleton Component (TB120)
 *
 * Provides loading placeholder UI with shimmer animation.
 * Used to show content structure while data is loading.
 */

import { HTMLAttributes, forwardRef } from 'react';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Width of the skeleton (default: '100%') */
  width?: string | number;
  /** Height of the skeleton (default: '1rem') */
  height?: string | number;
  /** Border radius (default: '0.25rem') */
  radius?: string | number;
  /** Show animation (default: true) */
  animate?: boolean;
  /** Variant for common use cases */
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
}

/**
 * Base skeleton with shimmer animation
 */
export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  (
    {
      width = '100%',
      height = '1rem',
      radius = '0.25rem',
      animate = true,
      variant,
      className = '',
      style,
      ...props
    },
    ref
  ) => {
    // Determine dimensions based on variant
    let computedWidth = width;
    let computedHeight = height;
    let computedRadius = radius;

    switch (variant) {
      case 'text':
        computedHeight = '1rem';
        computedRadius = '0.25rem';
        break;
      case 'circular':
        computedRadius = '50%';
        break;
      case 'rectangular':
        computedRadius = '0';
        break;
      case 'rounded':
        computedRadius = '0.5rem';
        break;
    }

    const baseClasses = 'bg-gray-200 dark:bg-gray-700';
    const animationClasses = animate
      ? 'animate-pulse'
      : '';

    return (
      <div
        ref={ref}
        className={`${baseClasses} ${animationClasses} ${className}`}
        style={{
          width: typeof computedWidth === 'number' ? `${computedWidth}px` : computedWidth,
          height: typeof computedHeight === 'number' ? `${computedHeight}px` : computedHeight,
          borderRadius: typeof computedRadius === 'number' ? `${computedRadius}px` : computedRadius,
          ...style,
        }}
        data-testid="skeleton"
        {...props}
      />
    );
  }
);

Skeleton.displayName = 'Skeleton';

/**
 * Skeleton for text content (single line)
 */
export function SkeletonText({
  width = '100%',
  className = '',
  ...props
}: Omit<SkeletonProps, 'variant' | 'height'>) {
  return (
    <Skeleton
      variant="text"
      width={width}
      className={className}
      {...props}
    />
  );
}

/**
 * Skeleton for avatar/profile images
 */
export function SkeletonAvatar({
  size = 40,
  className = '',
  ...props
}: Omit<SkeletonProps, 'variant' | 'width' | 'height'> & { size?: number }) {
  return (
    <Skeleton
      variant="circular"
      width={size}
      height={size}
      className={className}
      {...props}
    />
  );
}

/**
 * Skeleton for card content
 */
export function SkeletonCard({
  className = '',
  ...props
}: Omit<SkeletonProps, 'variant'>) {
  return (
    <div className={`p-4 border border-gray-200 dark:border-gray-700 rounded-lg ${className}`} {...props}>
      <div className="flex items-start gap-3">
        <SkeletonAvatar size={32} />
        <div className="flex-1 space-y-2">
          <SkeletonText width="60%" />
          <SkeletonText width="80%" />
          <SkeletonText width="40%" />
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for task card
 */
export function SkeletonTaskCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`p-3 border border-gray-200 dark:border-gray-700 rounded-lg ${className}`}
      data-testid="skeleton-task-card"
    >
      <div className="flex items-start gap-3">
        <Skeleton width={20} height={20} radius="0.25rem" />
        <div className="flex-1 space-y-2">
          <SkeletonText width="70%" />
          <div className="flex items-center gap-2">
            <Skeleton width={50} height={18} radius="0.75rem" />
            <Skeleton width={60} height={18} radius="0.75rem" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for table row
 */
export function SkeletonTableRow({
  columns = 4,
  className = '',
}: {
  columns?: number;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-4 p-3 border-b border-gray-100 dark:border-gray-800 ${className}`}>
      {Array.from({ length: columns }).map((_, i) => (
        <SkeletonText
          key={i}
          width={i === 0 ? '30%' : `${20 + Math.random() * 20}%`}
        />
      ))}
    </div>
  );
}

/**
 * Skeleton for a list of items
 */
export function SkeletonList({
  count = 5,
  itemHeight = 60,
  gap = 8,
  className = '',
}: {
  count?: number;
  itemHeight?: number;
  gap?: number;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{ display: 'flex', flexDirection: 'column', gap: `${gap}px` }}
      data-testid="skeleton-list"
    >
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton
          key={i}
          height={itemHeight}
          radius="0.5rem"
        />
      ))}
    </div>
  );
}

/**
 * Skeleton for dashboard stat card
 */
export function SkeletonStatCard({ className = '' }: { className?: string }) {
  return (
    <div className={`p-4 border border-gray-200 dark:border-gray-700 rounded-lg ${className}`}>
      <SkeletonText width="40%" />
      <Skeleton height={32} width="60%" className="mt-2" />
      <SkeletonText width="30%" className="mt-2" />
    </div>
  );
}

/**
 * Skeleton for page content
 */
export function SkeletonPage({ className = '' }: { className?: string }) {
  return (
    <div className={`space-y-6 ${className}`} data-testid="skeleton-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton width={200} height={32} radius="0.25rem" />
        <Skeleton width={100} height={36} radius="0.375rem" />
      </div>
      {/* Content cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>
      {/* List */}
      <SkeletonList count={5} />
    </div>
  );
}

export default Skeleton;

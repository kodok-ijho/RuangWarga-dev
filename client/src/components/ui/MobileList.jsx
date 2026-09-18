import React from 'react';
import { LoadingState } from './LoadingState';
import { EmptyState } from './EmptyState';

export function MobileList({
  items = [],
  renderItem,
  desktopContent,
  isLoading = false,
  loadingState,
  emptyState,
  className = '',
  mobileClassName = 'space-y-3',
}) {
  if (isLoading) {
    return loadingState || <LoadingState />;
  }

  if (!items || items.length === 0) {
    return emptyState || <EmptyState />;
  }

  return (
    <div className={`w-full ${className}`}>
      {/* Tampilan Mobile Card List (tampil di smartphone < 1024px) */}
      <div className={`block lg:hidden ${mobileClassName}`}>
        {items.map((item, index) => renderItem(item, index))}
      </div>

      {/* Tampilan Desktop Table (tampil di laptop/desktop >= 1024px) */}
      <div className="hidden lg:block">
        {desktopContent}
      </div>
    </div>
  );
}

export default MobileList;

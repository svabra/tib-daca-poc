import { ProductActivityItem } from '../../core/catalog.models';

export function recentProductActivity(
  items: readonly ProductActivityItem[],
  limit = 3,
): readonly ProductActivityItem[] {
  return items.slice(0, Math.max(0, limit));
}

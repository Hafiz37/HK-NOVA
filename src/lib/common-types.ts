export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page?: number;
    limit: number;
    total?: number;
    totalPages?: number;
    hasNext: boolean;
    hasPrev?: boolean;
    cursor?: string;
  };
}
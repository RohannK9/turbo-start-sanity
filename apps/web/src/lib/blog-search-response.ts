import type { Blog } from "@/types";
export type BlogSearchResponse = {
  results: Blog[];
  page: number;
  totalPages: number;
  totalHits: number;
};

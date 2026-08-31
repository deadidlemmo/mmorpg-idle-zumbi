import { API_ENDPOINTS } from "../../../services/api/endpoints";
import { apiClient } from "../../../services/api/apiClient";
import type {
  WikiCatalogFilters,
  WikiCatalogResponse,
  WikiEntityDetail,
  WikiEntityKind,
  WikiSearchResponse,
  WikiSummaryResponse,
} from "../types/wiki.types";

export async function getWikiSummary(signal?: AbortSignal) {
  const response = await apiClient.get<WikiSummaryResponse>(
    API_ENDPOINTS.wiki.summary,
    { signal },
  );
  return response.data;
}

export async function searchWiki(query: string, signal?: AbortSignal) {
  const response = await apiClient.get<WikiSearchResponse>(
    API_ENDPOINTS.wiki.search,
    { params: { q: query }, signal },
  );
  return response.data;
}

export async function getWikiCatalog(
  kind: WikiEntityKind,
  filters: WikiCatalogFilters,
  signal?: AbortSignal,
) {
  const response = await apiClient.get<WikiCatalogResponse>(
    API_ENDPOINTS.wiki.catalog(kind),
    { params: filters, signal },
  );
  return response.data;
}

export async function getWikiEntity(
  kind: WikiEntityKind,
  slug: string,
  signal?: AbortSignal,
) {
  const response = await apiClient.get<WikiEntityDetail>(
    API_ENDPOINTS.wiki.entity(kind, slug),
    { signal },
  );
  return response.data;
}

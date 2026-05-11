import { useCallback, useEffect, useState } from 'react';
import {
  extractInventoryApiError,
  getCharacterInventory,
} from '../api/inventory.api';
import type { InventoryResponse } from '../types/inventory.types';

export function useInventory(characterId?: string) {
  const [data, setData] = useState<InventoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(characterId));
  const [error, setError] = useState<string | null>(null);

  const loadInventory = useCallback(async () => {
    if (!characterId) return;

    try {
      setIsLoading(true);
      setError(null);
      const inventory = await getCharacterInventory(characterId);
      setData(inventory);
    } catch (requestError) {
      setError(extractInventoryApiError(requestError));
    } finally {
      setIsLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!characterId) return;

      try {
        setIsLoading(true);
        setError(null);
        const inventory = await getCharacterInventory(characterId);

        if (isMounted) {
          setData(inventory);
        }
      } catch (requestError) {
        if (isMounted) {
          setError(extractInventoryApiError(requestError));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [characterId]);

  return {
    data,
    items: data?.items ?? [],
    isLoading,
    error,
    refetch: loadInventory,
  };
}

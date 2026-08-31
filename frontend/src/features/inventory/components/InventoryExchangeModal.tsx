import { ArrowRightLeft, X } from "lucide-react";
import { useEffect } from "react";
import { EconomyExchangePanel } from "../../economy/components/EconomyExchangePanel";
import type { InventoryEntry } from "../types/inventory.types";

interface InventoryExchangeModalProps {
  characterId: string;
  entry: InventoryEntry | null;
  onClose: () => void;
  onExchangeComplete: (balance: number) => void | Promise<void>;
}

export function InventoryExchangeModal({
  characterId,
  entry,
  onClose,
  onExchangeComplete,
}: InventoryExchangeModalProps) {
  useEffect(() => {
    if (!entry) return undefined;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [entry, onClose]);

  if (!entry) return null;

  return (
    <div
      className="inventory-exchange-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inventory-exchange-modal-title"
    >
      <button
        type="button"
        className="inventory-exchange-modal__backdrop"
        onClick={onClose}
        aria-label="Fechar trocas"
      />
      <section className="inventory-exchange-modal__panel">
        <header className="inventory-exchange-modal__header">
          <span aria-hidden="true">
            <ArrowRightLeft size={21} />
          </span>
          <div>
            <small>Trocar pela mochila</small>
            <h2 id="inventory-exchange-modal-title">{entry.item.name}</h2>
          </div>
          <strong>{entry.quantity.toLocaleString("pt-BR")} disponíveis</strong>
          <button type="button" onClick={onClose} aria-label="Fechar">
            <X size={19} />
          </button>
        </header>

        <EconomyExchangePanel
          characterId={characterId}
          sourceItemId={entry.item.id}
          onExchangeComplete={onExchangeComplete}
        />
      </section>
    </div>
  );
}

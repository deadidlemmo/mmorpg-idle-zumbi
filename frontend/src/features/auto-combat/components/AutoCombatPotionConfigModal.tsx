import type { PotionInventoryOption } from "../types/auto-combat-page.types";

type AutoCombatPotionConfigModalProps = {
  getHealLabel: (potion: PotionInventoryOption) => string;
  isLoading: boolean;
  isOpen: boolean;
  message: string;
  onClear: () => void | Promise<void>;
  onClose: () => void;
  onSave: () => void | Promise<void>;
  onSelect: (potionItemId: string) => void;
  options: PotionInventoryOption[];
  optionsCountLabel: string;
  selectedPotionItemId: string;
};

export function AutoCombatPotionConfigModal({
  getHealLabel,
  isLoading,
  isOpen,
  message,
  onClear,
  onClose,
  onSave,
  onSelect,
  options,
  optionsCountLabel,
  selectedPotionItemId,
}: AutoCombatPotionConfigModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="auto-combat-potion-config-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <article
        className="auto-combat-potion-config-panel auto-combat-potion-config-panel--minimal auto-combat-potion-config-panel--modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auto-combat-potion-config-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="auto-combat-potion-config-panel__header">
          <div>
            <span>Poção automática</span>
            <strong id="auto-combat-potion-config-title">
              Escolha a poção da batalha
            </strong>
          </div>

          <button
            type="button"
            className="auto-combat-potion-config-panel__close"
            aria-label="Fechar configuração de poção"
            onClick={onClose}
          >
            Fechar
          </button>
        </div>

        <div className="auto-combat-potion-config-grid auto-combat-potion-config-grid--minimal">
          <section className="auto-combat-potion-picker">
            <div className="auto-combat-potion-picker__header">
              <div className="auto-combat-potion-picker__title">
                <span>Poções disponíveis</span>
                <strong>
                  {options.length > 0
                    ? optionsCountLabel
                    : "Inventário sem poções"}
                </strong>
              </div>
            </div>

            {options.length > 0 ? (
              <div className="auto-combat-potion-grid">
                {options.map((potion) => {
                  const potionQuantity = Math.max(
                    0,
                    Math.floor(Number(potion.quantity) || 0),
                  );
                  const isSelected = selectedPotionItemId === potion.itemId;
                  const isUnavailable = potionQuantity <= 0;

                  return (
                    <button
                      key={potion.itemId}
                      type="button"
                      className={[
                        "auto-combat-potion-option",
                        isSelected ? "is-selected" : "",
                        isUnavailable ? "is-unavailable" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      disabled={isLoading || isUnavailable}
                      onClick={() => onSelect(potion.itemId)}
                    >
                      <span className="auto-combat-potion-option__icon">+</span>

                      <span className="auto-combat-potion-option__content">
                        <strong>{potion.name}</strong>
                        <small>{getHealLabel(potion)}</small>
                      </span>

                      <span className="auto-combat-potion-option__quantity">
                        x{potionQuantity}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="auto-combat-potion-grid auto-combat-potion-grid--empty">
                <div className="auto-combat-potion-empty-state">
                  <span className="auto-combat-potion-empty-state__icon">
                    +
                  </span>
                  <strong>Inventário sem poções</strong>
                  <p>
                    Nenhuma poção de cura foi encontrada no inventário deste
                    personagem.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>

        {message ? (
          <p className="auto-combat-potion-config-message">{message}</p>
        ) : null}

        <div className="auto-combat-potion-config-actions auto-combat-potion-config-actions--minimal">
          <button
            type="button"
            className="auto-combat-primary-button"
            disabled={isLoading}
            onClick={() => void onSave()}
          >
            {isLoading ? "Salvando..." : "Salvar configuração"}
          </button>

          <button
            type="button"
            className="auto-combat-secondary-button auto-combat-secondary-button--danger"
            disabled={isLoading}
            onClick={() => void onClear()}
          >
            Remover
          </button>
        </div>
      </article>
    </div>
  );
}

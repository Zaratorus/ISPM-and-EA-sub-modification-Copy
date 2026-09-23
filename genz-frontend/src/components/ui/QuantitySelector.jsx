import styles from "./QuantitySelector.module.css";

export default function QuantitySelector({ value, onChange, min = 1, max = 99, disabled = false }) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));

  const handleInput = (e) => {
    const n = Number(e.target.value.replace(/\D/g, ""));
    if (Number.isNaN(n)) return;
    onChange(Math.min(max, Math.max(min, n)));
  };

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.btn}
        onClick={dec}
        disabled={disabled || value <= min}
        aria-label="Decrease quantity"
      >
        −
      </button>
      <input
        className={styles.input}
        type="text"
        inputMode="numeric"
        value={value}
        onChange={handleInput}
        disabled={disabled}
        aria-label="Quantity"
      />
      <button
        type="button"
        className={styles.btn}
        onClick={inc}
        disabled={disabled || value >= max}
        aria-label="Increase quantity"
      >
        +
      </button>
    </div>
  );
}

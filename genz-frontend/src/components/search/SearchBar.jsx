import { useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./SearchBar.module.css";

export default function SearchBar({ autoFocus = false, onSubmitted, initialValue = "" }) {
  const [value, setValue] = useState(initialValue);
  const navigate = useNavigate();

  function handleSubmit(e) {
    e.preventDefault();
    const term = value.trim();
    navigate(term ? `/shop?q=${encodeURIComponent(term)}` : "/shop");
    onSubmitted?.(term);
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} role="search">
      <input
        type="search"
        className={styles.input}
        placeholder="Search for shirts, perfumes, accessories…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus={autoFocus}
        aria-label="Search products"
      />
      <button type="submit" className={styles.submit}>
        Search
      </button>
    </form>
  );
}

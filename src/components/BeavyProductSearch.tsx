import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getBeavyFamilyProducts,
  searchBeavyCatalog,
  type BeavyFamilyProduct,
  type BeavyFamilySearchResult,
} from "../services/beavy-catalog-search";
import "./BeavyProductSearch.css";

type Props = {
  supabase: SupabaseClient;
  onSelectProduct: (product: BeavyFamilyProduct) => void;
  categorySlug?: string | null;
  placeholder?: string;
};

export default function BeavyProductSearch({
  supabase,
  onSelectProduct,
  categorySlug = null,
  placeholder = "Caută lapte, banane, cafea...",
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BeavyFamilySearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedFamily, setExpandedFamily] = useState<string | null>(null);
  const [familyProducts, setFamilyProducts] = useState<Record<string, BeavyFamilyProduct[]>>({});
  const [loadingFamily, setLoadingFamily] = useState<string | null>(null);

  useEffect(() => {
    const cleanQuery = query.trim();
    if (cleanQuery.length < 2) {
      setResults([]);
      setError(null);
      setLoading(false);
      setExpandedFamily(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      setExpandedFamily(null);
      try {
        const data = await searchBeavyCatalog(supabase, cleanQuery, {
          limit: 12,
          categorySlug,
        });
        if (!cancelled) {
          setResults(data);
          setFamilyProducts({});
        }
      } catch (err) {
        if (!cancelled) {
          setResults([]);
          setError(err instanceof Error ? err.message : "A apărut o eroare la căutare.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, categorySlug, supabase]);

  async function toggleFamily(family: BeavyFamilySearchResult) {
    if (expandedFamily === family.family_id) {
      setExpandedFamily(null);
      return;
    }
    setExpandedFamily(family.family_id);
    if (familyProducts[family.family_id]) return;

    setLoadingFamily(family.family_id);
    setError(null);
    try {
      const products = await getBeavyFamilyProducts(supabase, family.family_id, {
        query: query.trim(),
        limit: 50,
      });
      setFamilyProducts((current) => ({ ...current, [family.family_id]: products }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nu am putut încărca variantele.");
      setExpandedFamily(null);
    } finally {
      setLoadingFamily(null);
    }
  }

  const showPrompt = query.trim().length < 2;

  return (
    <section className="beavy-search" aria-label="Căutare produse Beavy">
      <label className="beavy-search__label" htmlFor="beavy-product-search">
        Ce punem pe listă?
      </label>

      <div className="beavy-search__input-wrap">
        <span className="beavy-search__search-icon" aria-hidden="true">⌕</span>
        <input
          id="beavy-product-search"
          className="beavy-search__input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
        />
        {query && (
          <button
            className="beavy-search__clear"
            type="button"
            onClick={() => setQuery("")}
            aria-label="Șterge căutarea"
          >
            ×
          </button>
        )}
      </div>

      <p className="beavy-search__hint">
        Scrie produsul așa cum îl știi. Nu trebuie să știi marca sau gramajul.
      </p>

      {showPrompt && (
        <div className="beavy-search__empty">
          <span aria-hidden="true">🛒</span>
          <p>Începe cu un produs: lapte, ouă, banane sau cafea.</p>
        </div>
      )}
      {loading && <p className="beavy-search__status" role="status">Căutăm în catalog...</p>}
      {error && <p className="beavy-search__error" role="alert">{error}</p>}
      {!loading && !error && !showPrompt && results.length === 0 && (
        <div className="beavy-search__empty">
          <span aria-hidden="true">🔎</span>
          <p>Nu am găsit încă un produs potrivit pentru „{query.trim()}”. Încearcă o denumire mai scurtă.</p>
        </div>
      )}

      <div className="beavy-search__families">
        {results.map((family) => {
          const expanded = expandedFamily === family.family_id;
          const products = familyProducts[family.family_id] ?? [];
          return (
            <article className="beavy-family" key={family.family_id}>
              <button
                type="button"
                className="beavy-family__header"
                onClick={() => void toggleFamily(family)}
                aria-expanded={expanded}
              >
                <span className="beavy-family__copy">
                  <strong>{family.family_name}</strong>
                  <small>{family.category_name}</small>
                </span>
                <span className="beavy-family__count">
                  {family.matched_product_count} variante
                </span>
                <span className="beavy-family__chevron" aria-hidden="true">
                  {expanded ? "−" : "+"}
                </span>
              </button>

              {!expanded && family.matching_products?.length > 0 && (
                <div className="beavy-family__preview">
                  {family.matching_products.slice(0, 2).map((product) => (
                    <div className="beavy-family__preview-row" key={product.id}>
                      <span>{product.brand ?? "Produs fără brand"}</span>
                      <span>{product.package_size ?? "Gramaj variabil"}</span>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="beavy-family__view"
                    onClick={() => void toggleFamily(family)}
                  >
                    Vezi variantele potrivite
                  </button>
                </div>
              )}

              {expanded && (
                <div className="beavy-family__products">
                  {loadingFamily === family.family_id && (
                    <p className="beavy-search__status">Încărcăm variantele...</p>
                  )}
                  {products.map((product) => (
                    <div className="beavy-product" key={product.product_id}>
                      <div className="beavy-product__image">
                        {product.image_url ? (
                          <img src={product.image_url} alt="" loading="lazy" />
                        ) : (
                          <span aria-hidden="true">🛍️</span>
                        )}
                      </div>
                      <div className="beavy-product__details">
                        <strong>{product.canonical_name}</strong>
                        <small>
                          {[product.brand, product.package_size, product.subcategory]
                            .filter(Boolean).join(" · ")}
                        </small>
                      </div>
                      <button
                        type="button"
                        className="beavy-product__add"
                        onClick={() => onSelectProduct(product)}
                      >
                        Adaugă
                      </button>
                    </div>
                  ))}
                  {!loadingFamily && products.length === 0 && (
                    <p className="beavy-search__status">Nu există variante potrivite pentru această căutare.</p>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

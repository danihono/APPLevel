import React, { useEffect, useState } from 'react';
import { Info, Search, ShoppingCart } from 'lucide-react';
import type { Branch, Product } from '../types';

interface StoreViewProps {
  products: Product[];
  branch: Branch;
}

const StoreView: React.FC<StoreViewProps> = ({ products, branch }) => {
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(branch);
  const [searchTerm, setSearchTerm] = useState('');
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    setSelectedBranch(branch);
  }, [branch]);

  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.category.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="view-shell">
      <section className="app-panel app-panel--hero app-panel-pad">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="app-section-label">Merch</p>
            <h1 className="app-section-title">Uma vitrine premium para a loja da academia.</h1>
            <p className="app-section-copy">Busca, produtos e chamadas de acao agora conversam com a barra dourada do resto do app.</p>
          </div>
          <div className="app-orb">
            <ShoppingCart size={16} />
            {cartCount} itens
          </div>
        </div>
      </section>

      <section className="app-panel app-panel-pad">
        <label className="app-field">
          <span className="app-field__label">Academia ativa</span>
          <select
            className="app-select"
            onChange={() => undefined}
            value={selectedBranch?.id || ''}
            disabled
          >
            <option value={selectedBranch?.id || ''}>{selectedBranch?.name || branch.name}</option>
          </select>
        </label>
        <div className="mt-4 flex items-start gap-2 text-sm text-[color:var(--text-muted)]">
          <Info size={16} className="mt-0.5 shrink-0" />
          <p>Os itens exibidos abaixo vem da colecao real `store_items` da academia.</p>
        </div>
      </section>

      <section className="app-search">
        <Search size={18} />
        <input
          type="text"
          placeholder="O que voce esta procurando?"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="app-input pl-11"
        />
      </section>

      {filteredProducts.length > 0 ? (
        <section className="app-grid-2">
          {filteredProducts.map((product) => (
            <article key={product.id} className="app-panel overflow-hidden">
              <div className="relative aspect-square bg-black/5">
                <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setCartCount((previous) => previous + 1)}
                  className="app-button app-button--gold app-button--icon absolute bottom-3 right-3"
                >
                  <ShoppingCart size={16} />
                </button>
              </div>
              <div className="app-panel-pad">
                <p className="app-section-label">{product.vendor}</p>
                <h3 className="mt-2 text-lg font-bold leading-tight">{product.name}</h3>
                <div className="mt-5 flex items-center justify-between gap-4">
                  <span className="text-xl font-bold text-[color:var(--gold-mid)]">R$ {product.price.toFixed(2)}</span>
                  <span className="app-badge app-badge--muted">{product.category}</span>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <div className="app-empty">Nenhum item cadastrado na store desta academia ainda.</div>
      )}
    </div>
  );
};

export default StoreView;

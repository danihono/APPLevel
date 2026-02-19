
import React, { useState } from 'react';
import { ShoppingCart, Search, Info } from 'lucide-react';
import { MOCK_PRODUCTS, MOCK_BRANCHES } from '../constants';
import { Branch } from '../types';

const StoreView: React.FC = () => {
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [cartCount, setCartCount] = useState(0);

  return (
    <div className="space-y-6 animate-fadeIn pb-8">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">LEVEL <span className="text-gold">Store</span></h1>
        <div className="relative">
          <ShoppingCart size={24} className="text-gray-700 dark:text-gray-300" />
          {cartCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-gold text-black text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
              {cartCount}
            </span>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-dark-card rounded-2xl p-4 border border-gray-100 dark:border-white/5 shadow-sm">
        <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Selecione sua Filial para Apoiar</label>
        <select 
          className="w-full bg-gray-50 dark:bg-white/5 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-gold outline-none appearance-none"
          onChange={(e) => setSelectedBranch(MOCK_BRANCHES.find(b => b.id === e.target.value) || null)}
          value={selectedBranch?.id || ''}
        >
          <option value="">Escolha uma filial...</option>
          {MOCK_BRANCHES.map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <div className="mt-3 flex items-start gap-2 text-[10px] text-gray-400">
          <Info size={12} className="shrink-0 mt-0.5" />
          <p>Toda compra realizada contribui com 12% de comissão para a filial selecionada.</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        <input 
          type="text" 
          placeholder="O que você está procurando?" 
          className="w-full bg-gray-50 dark:bg-white/5 border-none rounded-2xl py-4 pl-12 pr-4 text-sm focus:ring-2 focus:ring-gold outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {MOCK_PRODUCTS.map((prod) => (
          <div key={prod.id} className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm overflow-hidden flex flex-col">
            <div className="aspect-square bg-gray-100 dark:bg-white/5 relative">
              <img src={prod.image} alt={prod.name} className="w-full h-full object-cover" />
              <button 
                onClick={() => setCartCount(prev => prev + 1)}
                className="absolute bottom-2 right-2 bg-white dark:bg-dark p-2 rounded-lg shadow-md text-gold active:scale-90 transition-transform"
              >
                <ShoppingCart size={18} />
              </button>
            </div>
            <div className="p-3 flex-1 flex flex-col justify-between">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase">{prod.vendor}</p>
                <h3 className="text-sm font-bold line-clamp-2 leading-tight">{prod.name}</h3>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="font-bold text-gold">R$ {prod.price.toFixed(2)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StoreView;

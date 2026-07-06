import React from 'react';
import { Product } from '../../types';

interface Props {
  products: Product[];
  included: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (include: boolean) => void;
}

/** Scrollable product list with per-item include/exclude checkboxes. */
export const ProductList: React.FC<Props> = ({ products, included, onToggle, onToggleAll }) => {
  const selectedCount = products.filter((p) => included.has(p.id)).length;
  const allSelected = selectedCount === products.length;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-gray-100 px-3 py-1.5 flex items-center justify-between">
        <span className="text-[10px] font-semibold text-gray-600">
          {selectedCount} of {products.length} selected
        </span>
        <button
          onClick={() => onToggleAll(!allSelected)}
          className="text-[10px] font-medium text-blue-600 hover:text-blue-800"
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
      </div>
      <div className="max-h-56 overflow-y-auto divide-y divide-gray-100">
        {products.map((p) => {
          const on = included.has(p.id);
          return (
            <label key={p.id} className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer ${on ? '' : 'opacity-45'}`}>
              <input type="checkbox" checked={on} onChange={() => onToggle(p.id)} className="w-3.5 h-3.5 accent-blue-600 shrink-0" />
              <span className="text-[10px] font-bold text-blue-600 w-6 shrink-0">#{p.itemNumber}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-700 truncate">{p.title}</p>
                <p className="text-[10px] font-semibold text-red-600">{p.price || '—'}</p>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
};

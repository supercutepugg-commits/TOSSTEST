import { createContext, useContext, useState, useEffect } from 'react';
import { api } from './api';

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [stores, setStores] = useState([]);
  const [currentStore, setCurrentStore] = useState(null);

  const loadStores = async () => {
    try {
      const list = await api.getStores();
      setStores(list);
      if (!currentStore && list.length > 0) {
        const saved = localStorage.getItem('currentStoreId');
        if (saved) {
          const found = list.find(s => s.id === Number(saved));
          if (found) setCurrentStore(found);
        }
      }
    } catch {}
  };

  useEffect(() => { loadStores(); }, []);

  const clearStore = () => {
    setCurrentStore(null);
    localStorage.removeItem('currentStoreId');
  };

  return (
    <StoreContext.Provider value={{ stores, currentStore, reloadStores: loadStores, clearStore }}>
      {children}
    </StoreContext.Provider>
  );
}

export const useStore = () => useContext(StoreContext);

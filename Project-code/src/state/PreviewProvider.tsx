import React, { createContext, useContext, useMemo, useState } from 'react';

type CustomersPreview = { count: number; names: string[] };

type PreviewState = {
  customers?: CustomersPreview; // later warehouse, activity, history
};

type PreviewContextType = {
  previews: PreviewState;
  setCustomersPreview: (p: CustomersPreview) => void;
  clearCustomersPreview: () => void;
};

const PreviewContext = createContext<PreviewContextType | null>(null);

export function PreviewProvider({ children }: { children: React.ReactNode }) {
  const [previews, setPreviews] = useState<PreviewState>({});

  const value = useMemo<PreviewContextType>(() => ({
    previews,
    setCustomersPreview: (p) => setPreviews((s) => ({ ...s, customers: p })),
    clearCustomersPreview: () => setPreviews((s) => ({ ...s, customers: undefined })),
  }), [previews]);

  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
}

export function usePreview() {
  const ctx = useContext(PreviewContext);
  if (!ctx) throw new Error('usePreview must be used within PreviewProvider');
  return ctx;
}

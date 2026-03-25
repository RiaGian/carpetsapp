import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'

//the customers preview 
type CustomersPreview = {
  count: number        // total number of customers
  names: string[]      // list of customer names (e.g., the latest ones)
}

// Overall preview state --> later warehouse, etc
type PreviewState = {
  customers?: CustomersPreview
}

// holds preview data and update methods 
type PreviewContextType = {
  previews: PreviewState
  setCustomersPreview: (p: CustomersPreview) => void
  clearCustomersPreview: () => void
}

/** Create a React context with a null default value */
const PreviewContext = createContext<PreviewContextType | null>(null)


//PreviewProvider
// global preview data --> customer summaries, stats, etc
export function PreviewProvider({ children }: { children: React.ReactNode }) {
  const [previews, setPreviews] = useState<PreviewState>({})

  //  the customers preview object 
  const setCustomersPreview = useCallback(
    (p: CustomersPreview) => setPreviews(s => ({ ...s, customers: p })),
    []
  )

  // clears the customers preview section
  const clearCustomersPreview = useCallback(
    () => setPreviews(s => ({ ...s, customers: undefined })),
    []
  )

  // Memoize context value 
  const value = useMemo(
    () => ({ previews, setCustomersPreview, clearCustomersPreview }),
    [previews, setCustomersPreview, clearCustomersPreview]
  )

  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>
}


 //Hook to access the PreviewContext anywhere in the app.
 //Throws an error if used outside the PreviewProvider
export function usePreview() {
  const ctx = useContext(PreviewContext)
  if (!ctx) throw new Error('usePreview must be used within PreviewProvider')
  return ctx
}

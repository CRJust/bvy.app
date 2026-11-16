import type { ReactNode } from 'react';
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

type TabBarContextType = {
  isTabBarHidden: boolean;
  setIsTabBarHidden: (hidden: boolean) => void;
  /** Indexul vizual spre care glisează imediat indicatorul burgundy */
  visualTabIndex: number | null;
  /** True în timpul scurtului fade-out (90ms) al paginii vechi */
  isPageExiting: boolean;
  /** Declanșează tranziția: glisare indicator + fade-out pagină veche -> schimbare tab */
  triggerTabTransition: (targetIndex: number, onSwitchTab: () => void) => void;
  /** Sincronizează indexul când navigarea vine din interiorul paginii (router.push) */
  syncVisualTabIndex: (actualIndex: number) => void;
};

const TabBarContext = createContext<TabBarContextType>({
  isTabBarHidden: false,
  setIsTabBarHidden: () => {},
  visualTabIndex: null,
  isPageExiting: false,
  triggerTabTransition: (_idx, cb) => cb(),
  syncVisualTabIndex: () => {},
});

export function TabBarProvider({ children }: { children: ReactNode }) {
  const [isTabBarHidden, setIsTabBarHidden] = useState(false);
  const [visualTabIndex, setVisualTabIndex] = useState<number | null>(null);
  const [isPageExiting, setIsPageExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerTabTransition = useCallback(
    (targetIndex: number, onSwitchTab: () => void) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      // 1. Indicatorul burgundy glisează spre noul tab
      setVisualTabIndex(targetIndex);
      // 2. Navigarea este instantanee (0ms latență) pentru fluiditate nativă
      onSwitchTab();
      setIsPageExiting(false);
    },
    []
  );

  const syncVisualTabIndex = useCallback((actualIndex: number) => {
    setVisualTabIndex(actualIndex);
  }, []);

  return (
    <TabBarContext.Provider
      value={{
        isTabBarHidden,
        setIsTabBarHidden,
        visualTabIndex,
        isPageExiting,
        triggerTabTransition,
        syncVisualTabIndex,
      }}
    >
      {children}
    </TabBarContext.Provider>
  );
}

export function useTabBar() {
  return useContext(TabBarContext);
}

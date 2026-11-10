import type { ReactNode } from 'react';
import { createContext, useContext, useState } from 'react';

type TabBarContextType = {
  isTabBarHidden: boolean;
  setIsTabBarHidden: (hidden: boolean) => void;
};

const TabBarContext = createContext<TabBarContextType>({
  isTabBarHidden: false,
  setIsTabBarHidden: () => {},
});

export function TabBarProvider({ children }: { children: ReactNode }) {
  const [isTabBarHidden, setIsTabBarHidden] = useState(false);

  return (
    <TabBarContext.Provider value={{ isTabBarHidden, setIsTabBarHidden }}>
      {children}
    </TabBarContext.Provider>
  );
}

export function useTabBar() {
  return useContext(TabBarContext);
}
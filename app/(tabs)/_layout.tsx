import { Tabs, useRouter, usePathname } from "expo-router";
import { ShoppingCart, History, Settings, TrendingUp } from "lucide-react-native";
import React from "react";
import Colors from "@/constants/colors";
import { NavigationBlockerProvider, useNavigationBlocker } from "@/hooks/navigation-blocker";

function TabsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const { checkNavigation } = useNavigationBlocker();

  const handleTabPress = (routePath: string) => (e: any) => {
    if (pathname === routePath) {
      return;
    }

    e.preventDefault();
    
    if (pathname === '/setup') {
      checkNavigation(() => {
        router.push(routePath as any);
      });
    } else {
      router.push(routePath as any);
    }
  };

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.light.tint,
        headerShown: false,
        tabBarStyle: {
          height: 80,
          paddingBottom: 20,
          paddingTop: 12,
          backgroundColor: Colors.light.tabBarBackground,
        },
      }}
    >
      <Tabs.Screen
        name="setup"
        options={{
          title: "Setup",
          tabBarIcon: ({ color }) => <Settings size={24} color={color} />,
        }}
        listeners={{
          tabPress: handleTabPress('/setup'),
        }}
      />
      <Tabs.Screen
        name="panel"
        options={{
          title: "Panel",
          tabBarIcon: ({ color }) => <ShoppingCart size={24} color={color} />,
        }}
        listeners={{
          tabPress: handleTabPress('/panel'),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "Registry",
          tabBarIcon: ({ color }) => <History size={24} color={color} />,
        }}
        listeners={{
          tabPress: handleTabPress('/history'),
        }}
      />
      <Tabs.Screen
        name="totals"
        options={{
          title: "Totals",
          tabBarIcon: ({ color }) => <TrendingUp size={24} color={color} />,
        }}
        listeners={{
          tabPress: handleTabPress('/totals'),
        }}
      />
      <Tabs.Screen
        name="panel-layout-A-backup"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  return (
    <NavigationBlockerProvider>
      <TabsContent />
    </NavigationBlockerProvider>
  );
}

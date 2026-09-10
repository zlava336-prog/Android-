import React from 'react';
import {
  Home,
  Layers,
  Smartphone,
  Sliders,
  FileText,
  ShieldCheck,
  AlertOctagon,
  Info,
  CheckSquare,
  Share2,
  FileCheck,
  ShoppingBag,
  Video,
  Cpu,
} from 'lucide-react';

export type NavScreen =
  | 'home'
  | 'master_workflow'
  | 'product_research'
  | 'content_review'
  | 'video_studio'
  | 'multi_job'
  | 'current_job'
  | 'apps'
  | 'settings'
  | 'logs'
  | 'permissions'
  | 'emergency_stop'
  | 'about'
  | 'tests';

interface MaterialNavBarProps {
  currentScreen: NavScreen;
  onSelectScreen: (screen: NavScreen) => void;
  isEmergencyActive: boolean;
  theme: 'dark' | 'light';
}

interface NavItem {
  id: NavScreen;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'master_workflow', label: 'E2E Workflow', icon: Cpu, badge: 'Phase 2O' },
  { id: 'product_research', label: 'Product Research', icon: ShoppingBag, badge: 'Step 2K' },
  { id: 'content_review', label: 'Content Review', icon: FileCheck, badge: 'Step 2J' },
  { id: 'video_studio', label: 'Video Studio', icon: Video, badge: 'Step 2M' },
  { id: 'multi_job', label: 'Multi-Platform Job', icon: Share2, badge: 'New' },
  { id: 'current_job', label: 'Current Job', icon: Layers },
  { id: 'apps', label: 'Adapter Registry', icon: Smartphone },
  { id: 'settings', label: 'Settings', icon: Sliders },
  { id: 'logs', label: 'Logs', icon: FileText },
  { id: 'permissions', label: 'Permissions', icon: ShieldCheck },
  { id: 'emergency_stop', label: 'Emergency Stop', icon: AlertOctagon },
  { id: 'tests', label: 'Unit Tests', icon: CheckSquare, badge: '900+' },
  { id: 'about', label: 'About', icon: Info },
];

export const MaterialNavBar: React.FC<MaterialNavBarProps> = ({
  currentScreen,
  onSelectScreen,
  isEmergencyActive,
  theme,
}) => {
  const isLight = theme === 'light';

  return (
    <nav
      className={`border-b md:border-b-0 md:border-r transition-colors ${
        isLight
          ? 'bg-neutral-50/80 border-neutral-200 text-neutral-800'
          : 'bg-neutral-900/40 border-neutral-800 text-neutral-200'
      } md:w-64 shrink-0`}
    >
      {/* Desktop/Tablet Sidebar layout */}
      <div className="p-3 hidden md:flex flex-col gap-1 h-full">
        <div className="px-3 py-2 text-[11px] font-semibold tracking-wider uppercase text-neutral-400">
          Navigation
        </div>
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const isActive = currentScreen === item.id;
          const isEmergencyItem = item.id === 'emergency_stop';

          return (
            <button
              key={item.id}
              onClick={() => onSelectScreen(item.id)}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                isActive
                  ? isEmergencyItem
                    ? 'bg-red-600 text-white shadow-sm'
                    : isLight
                    ? 'bg-blue-600 text-white font-semibold shadow-xs'
                    : 'bg-blue-600 text-white font-semibold shadow-xs'
                  : isEmergencyItem && isEmergencyActive
                  ? 'bg-red-500/20 text-red-400 font-bold border border-red-500/40 animate-pulse'
                  : isLight
                  ? 'hover:bg-neutral-200/70 text-neutral-600 hover:text-neutral-900'
                  : 'hover:bg-neutral-800/60 text-neutral-300 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`w-4 h-4 ${
                    isActive
                      ? 'text-white'
                      : isEmergencyItem && isEmergencyActive
                      ? 'text-red-400'
                      : 'text-neutral-400'
                  }`}
                />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-neutral-700/60 text-neutral-300'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Mobile Horizontal scroll tab bar */}
      <div className="flex md:hidden overflow-x-auto no-scrollbar py-2 px-3 gap-1.5">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const isActive = currentScreen === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectScreen(item.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white font-semibold shadow-xs'
                  : isLight
                  ? 'bg-neutral-200/50 text-neutral-700'
                  : 'bg-neutral-800/60 text-neutral-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

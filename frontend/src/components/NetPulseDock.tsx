import React from 'react'
import {
  ArrowUpDown,
  Network,
  Server,
  Radio,
  Cpu,
  ShieldCheck,
  Building2,
  Users,
  KeyRound,
  Search,
  UserCog,
} from 'lucide-react'
import { Dock, DockIcon, DockItem, DockLabel } from '@/components/ui/dock'
import type { MainSectionType } from './Sidebar'
import { useAuth } from '../context/AuthContext'

interface NetPulseDockProps {
  activeSection: MainSectionType
  onSelectSection: (section: MainSectionType) => void
  activeAlertsCount?: number
  onOpenSearch?: () => void
  onOpenProfile?: () => void
}

interface DockNavItem {
  id: MainSectionType
  label: string
  icon: React.ComponentType<{ className?: string }>
  badge?: number
  superAdminOnly?: boolean
}

export const NetPulseDock: React.FC<NetPulseDockProps> = ({
  activeSection,
  onSelectSection,
  activeAlertsCount = 0,
  onOpenSearch,
  onOpenProfile,
}) => {
  const { isSuperAdmin, user } = useAuth()

  const mainItems: DockNavItem[] = [
    {
      id: 'bgp',
      label: 'Protocolo BGP',
      icon: ArrowUpDown,
    },
    {
      id: 'ospf',
      label: 'Protocolo OSPF',
      icon: Network,
    },
    {
      id: 'devices',
      label: 'Equipamentos & Borda',
      icon: Server,
    },
    {
      id: 'telemetry',
      label: 'NOC & Telemetria',
      icon: Radio,
      badge: activeAlertsCount,
    },
    {
      id: 'diagnostics',
      label: 'Ferramentas de Rede',
      icon: Cpu,
    },
    {
      id: 'audit',
      label: 'Auditoria & Logs',
      icon: ShieldCheck,
    },
    {
      id: 'license',
      label: 'Licença & Sistema',
      icon: KeyRound,
    },
  ]

  const adminItems: DockNavItem[] = [
    {
      id: 'tenants',
      label: 'Empresas & Clientes',
      icon: Building2,
      superAdminOnly: true,
    },
    {
      id: 'users',
      label: 'Usuários & Permissões',
      icon: Users,
      superAdminOnly: true,
    },
  ]

  const visibleAdminItems = adminItems.filter(
    (item) => !item.superAdminOnly || isSuperAdmin
  )

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 max-w-full px-2 pointer-events-auto"
      role="navigation"
      aria-label="Menu Principal NetPulse Dock"
    >
      <Dock
        className="items-center pb-2 bg-[#13151D]/95 border border-[#242836] shadow-2xl backdrop-blur-xl rounded-2xl px-4"
        panelHeight={68}
        magnification={84}
        distance={140}
      >
        {/* Itens Principais */}
        {mainItems.map((item) => {
          const isActive = activeSection === item.id
          const Icon = item.icon

          return (
            <DockItem
              key={item.id}
              onClick={() => onSelectSection(item.id)}
              className={`aspect-square rounded-2xl transition-all duration-100 border ${
                isActive
                  ? 'bg-[#25334D] border-[#3B5B8C] text-[#93B4E6] shadow-lg shadow-[#4A72B2]/20 ring-1 ring-[#4A72B2]/50'
                  : 'bg-[#1C202C] border-[#242836] text-slate-400 hover:text-slate-100 hover:bg-[#252C3D]'
              }`}
            >
              <DockLabel>{item.label}</DockLabel>
              <DockIcon>
                <div className="relative flex items-center justify-center w-full h-full">
                  <Icon className="w-full h-full" />
                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      aria-label={`${item.badge} alertas ativos`}
                      className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-rose-500 ring-2 ring-[#13151D] animate-pulse"
                    />
                  )}
                </div>
              </DockIcon>
              {isActive && (
                <span className="absolute -bottom-1.5 w-1.5 h-1.5 rounded-full bg-[#4A72B2]" />
              )}
            </DockItem>
          )
        })}

        {/* Separador se houver itens de administrador */}
        {visibleAdminItems.length > 0 && (
          <div className="h-7 w-px bg-[#242836] mx-1 self-center shrink-0" />
        )}

        {/* Itens de Gestão / Admin */}
        {visibleAdminItems.map((item) => {
          const isActive = activeSection === item.id
          const Icon = item.icon

          return (
            <DockItem
              key={item.id}
              onClick={() => onSelectSection(item.id)}
              className={`aspect-square rounded-2xl transition-all duration-100 border ${
                isActive
                  ? 'bg-[#25334D] border-[#3B5B8C] text-[#93B4E6] shadow-lg shadow-[#4A72B2]/20 ring-1 ring-[#4A72B2]/50'
                  : 'bg-[#1C202C] border-[#242836] text-slate-400 hover:text-slate-100 hover:bg-[#252C3D]'
              }`}
            >
              <DockLabel>{item.label}</DockLabel>
              <DockIcon>
                <Icon className="w-full h-full" />
              </DockIcon>
              {isActive && (
                <span className="absolute -bottom-1.5 w-1.5 h-1.5 rounded-full bg-[#4A72B2]" />
              )}
            </DockItem>
          )
        })}

        {/* Separador para Atalhos Rápidos */}
        <div className="h-7 w-px bg-[#242836] mx-1 self-center shrink-0" />

        {onOpenSearch && (
          <DockItem
            onClick={onOpenSearch}
            className="aspect-square rounded-2xl transition-all duration-100 border bg-[#1C202C] border-[#242836] text-slate-400 hover:text-slate-100 hover:bg-[#252C3D]"
          >
            <DockLabel>Buscar Ações (Ctrl + K)</DockLabel>
            <DockIcon>
              <Search className="w-full h-full text-slate-400 hover:text-white" />
            </DockIcon>
          </DockItem>
        )}

        {/* Perfil & Preferências */}
        {onOpenProfile && (
          <DockItem
            onClick={onOpenProfile}
            className="aspect-square rounded-2xl transition-all duration-100 border bg-[#1C202C] border-[#242836] text-slate-400 hover:text-slate-100 hover:bg-[#252C3D]"
          >
            <DockLabel>{user?.name ? `Perfil: ${user.name}` : 'Meu Perfil & Preferências'}</DockLabel>
            <DockIcon>
              <UserCog className="w-full h-full text-[#4A72B2] hover:text-[#93B4E6]" />
            </DockIcon>
          </DockItem>
        )}
      </Dock>
    </div>
  )
}

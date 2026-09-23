import React from 'react'

interface SkeletonProps {
  className?: string
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => (
  <div className={`bg-slate-800/60 animate-pulse rounded-lg ${className}`} />
)

/** Skeleton para Cards de Grupos de AS (Download / Upload) */
export const CardSkeleton: React.FC<{ compact?: boolean }> = ({ compact = false }) => (
  <div
    className={`rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 sm:p-5 flex flex-col justify-between space-y-4 animate-pulse ${
      compact ? 'p-3.5 space-y-3' : ''
    }`}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <Skeleton className="h-5 w-14 rounded-full" />
    </div>

    <div className="space-y-2 pt-2 border-t border-slate-800/60">
      <div className="flex justify-between items-center">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-16" />
      </div>
      <div className="flex justify-between items-center">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-4 w-20 rounded" />
      </div>
    </div>

    <div className="pt-2 flex items-center gap-2">
      <Skeleton className="h-8 flex-1 rounded-xl" />
      <Skeleton className="h-8 w-8 rounded-xl" />
    </div>
  </div>
)

/** Skeleton para Cards de Equipamentos do Inventário */
export const DeviceCardSkeleton: React.FC<{ compact?: boolean }> = ({ compact = false }) => (
  <div
    className={`rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 flex flex-col justify-between space-y-4 animate-pulse ${
      compact ? 'p-3.5 space-y-3' : ''
    }`}
  >
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <Skeleton className="h-5 w-16 rounded-full" />
    </div>

    <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-800/60">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-4 w-20" />
    </div>

    <div className="pt-2 flex items-center gap-2">
      <Skeleton className="h-8 flex-1 rounded-xl" />
      <Skeleton className="h-8 w-8 rounded-xl" />
      <Skeleton className="h-8 w-8 rounded-xl" />
    </div>
  </div>
)

/** Skeleton para Linhas de Tabelas (BGP Sessions, OSPF, Rotas) */
export const TableRowSkeleton: React.FC<{ columns?: number }> = ({ columns = 5 }) => (
  <tr className="border-b border-slate-800/50 animate-pulse">
    {Array.from({ length: columns }).map((_, idx) => (
      <td key={idx} className="py-3 px-4">
        <Skeleton className="h-4 w-full max-w-[120px]" />
      </td>
    ))}
  </tr>
)

/** Skeleton para Indicadores de Métricas / KPIs */
export const MetricCardSkeleton: React.FC = () => (
  <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 sm:p-5 space-y-3 animate-pulse">
    <div className="flex items-center justify-between">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-8 rounded-xl" />
    </div>
    <Skeleton className="h-8 w-20" />
    <Skeleton className="h-3 w-32" />
  </div>
)

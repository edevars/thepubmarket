import { LoadingSkeletonGrid } from '@/components/states/LoadingSkeletonGrid'

/** Estado de carga del catálogo (Suspense del App Router). */
export default function CatalogLoading() {
  return (
    <main className="mx-auto w-full max-w-[1280px] px-5 py-6 sm:px-6">
      <LoadingSkeletonGrid />
    </main>
  )
}

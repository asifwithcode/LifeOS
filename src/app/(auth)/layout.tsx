export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg-subtle px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 grid size-10 place-items-center rounded-xl bg-fg text-[15px] font-semibold text-bg">L</div>
          <h1 className="text-lg font-semibold tracking-tight">LifeOS</h1>
          <p className="mt-1 text-[13px] text-fg-muted">Where you are, where you&apos;re going, and what to do today.</p>
        </div>
        {children}
      </div>
    </div>
  );
}

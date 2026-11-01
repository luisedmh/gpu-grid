/** The GPU Grid logo: a 3x3 grid of cells, like GPUs in a cluster. */
export function BrandMark() {
  return (
    <div className="grid size-8 grid-cols-3 gap-0.5 rounded-lg bg-brand-500 p-1.5">
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={`rounded-[2px] ${i % 2 === 0 ? 'bg-white' : 'bg-white/45'}`} />
      ))}
    </div>
  );
}

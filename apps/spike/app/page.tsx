// Captured at module load (build time). Different builds produce different timestamps,
// which is exactly what we need for visually verifying which build is deployed.
const BUILD_TIME = new Date().toISOString();

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center font-mono">
      <div className="space-y-4 max-w-xl">
        <h1 className="text-4xl">Spike — Railway DX verification</h1>
        <p className="text-zinc-400">Build timestamp: {BUILD_TIME}</p>
        <p className="text-zinc-500 text-sm">
          Per DEC-20260503-C and to-do #3 from Session 3B. Throwaway spike.
        </p>
      </div>
    </main>
  );
}

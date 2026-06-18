/**
 * Cross-link between the two GitHub Pages deploys of this demo.
 *
 * Both are the same code built twice (see .github/workflows/deploy.yml):
 *   - production build → site root, talks to https://sphere.unicity.network
 *   - staging build    → /staging/,  talks to https://unicity-sphere.github.io/sphere/main
 *
 * The current environment is derived purely from the baked-in base path
 * (`import.meta.env.BASE_URL`), and the button always points at the *other*
 * deploy. Deriving the sibling path from the base means a repo rename needs
 * no change here. On the dev server (base `/`) it shows "Production → Staging"
 * pointing at `/staging/` — there is no real pair locally, but keeping it
 * visible lets the placement be verified in `npm run dev`.
 */
export function EnvSwitch() {
  const base = import.meta.env.BASE_URL;
  const normalized = base.endsWith('/') ? base : base + '/';
  const isStaging = normalized.endsWith('/staging/');

  const targetHref = isStaging
    ? normalized.slice(0, -'staging/'.length) // strip the staging segment → prod root
    : normalized + 'staging/'; //               append the staging segment → staging

  const currentLabel = isStaging ? 'Staging' : 'Production';
  const targetLabel = isStaging ? 'Production' : 'Staging';

  return (
    <a
      href={targetHref}
      title={`You are on ${currentLabel}. Switch to ${targetLabel}.`}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/70 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isStaging ? 'bg-amber-400' : 'bg-green-500'}`} />
      <span className="text-white/45">{currentLabel}</span>
      <span aria-hidden="true">→</span>
      <span>{targetLabel}</span>
    </a>
  );
}

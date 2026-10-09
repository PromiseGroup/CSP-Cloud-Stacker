/* ─────────────────────────────────────────────────────────────────────────────
   Cloud Stacker · theme config.  ONE SWITCH: EVENT_ENABLED.
   true  → Directions EMEA 2026 (Paris) copy, ERP block names, event badge, Eiffel accent
   false → the generic Microsoft-cloud game (nothing else to change, nothing to delete)
   Preview either mode without editing:  preview.html?event=0   /   preview.html?event=1
   ───────────────────────────────────────────────────────────────────────────── */
window.THEME = (() => {
  const EVENT_ENABLED = true;   // ← flip to false after the event

  const generic = {
    isEvent: false,
    labels: ['Compute', 'Storage', 'Entra', 'Defender', 'SharePoint', 'Copilot', 'Intune', 'Fabric', 'Teams', 'Azure SQL', 'Sentinel', 'Purview', 'Azure AI'],
    baseLabel: 'On-prem',
    headline: 'Build your<br>cloud <em>stack.</em>',
    subhead: 'Drop each service onto the one below. Land it clean for +500. Any overhang gets sliced off.',
    eyebrow: 'RUN COMPLETE',
    // Pick the LAST entry whose min <= floors stacked. Never a negative message: the run only ends, it never "fails".
    endings: [
      { min: 0,  title: 'Nice start!',  sub: 'Every great stack starts somewhere.' },
      { min: 5,  title: 'Solid build!', sub: 'Steady hands. Keep climbing.' },
      { min: 10, title: 'Strong stack!', sub: 'That is a serious tower.' },
      { min: 16, title: 'Skyscraper!',  sub: 'Cloud architect energy.' },
    ],
    // Company logo, top-left, ALWAYS shown. null = DON'T TOUCH the game's existing logo element (the default).
    // Only set a path here if the project has no logo yet; it must be a file that really exists.
    brandLogoSrc: null,
    board: { title: 'Top stackers', scope: 'default', label: '', cta: 'Enter the prize raffle' },
    wall: 'STILL NOT ON-PREM × SCALE IT × ',
  };

  const event = {
    ...generic,
    isEvent: true,
    // Bottom → top. The climb ends on the punchline. Max ~13 names; the list loops.
    labels: ['Finance', 'Sales', 'Purchasing', 'Inventory', 'Warehouse', 'Projects', 'Service', 'E-Documents', 'AppSource', 'Power BI', 'Copilot', 'AI Agents', 'Agentic ERP'],
    baseLabel: 'On-prem NAV',            // the legacy box everyone is migrating off
    headline: 'Build your<br>ERP <em>stack.</em>',
    subhead: 'Drop each module onto the one below, from Finance up to Agentic ERP. Land it clean for +500. Any overhang gets sliced off.',
    endings: [
      { min: 0,  title: 'Nice start!',   sub: 'Every migration begins with step one.' },
      { min: 5,  title: 'Solid build!',  sub: 'Clean modules, steady hands.' },
      { min: 10, title: 'Strong stack!', sub: 'That ERP is looking production-ready.' },
      { min: 16, title: 'Go-live approved!', sub: 'Flawless. The NAV box is retired.' },
    ],
    board: { title: 'Top stackers', scope: 'directions-emea-2026', label: 'Directions EMEA 2026', cta: 'Enter the prize raffle' },
    wall: 'STILL ON NAV × UPGRADE IT × ',
    kicker: 'PARIS · 27–29 OCT 2026',
    logoSrc: 'assets/emealogo.WebP',
  };

  const q = /[?&]event=(\d)/.exec(location.search);
  const on = q ? q[1] === '1' : EVENT_ENABLED;
  return on ? event : generic;
})();

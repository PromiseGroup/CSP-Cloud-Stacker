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
    gameOverTitle: 'Stack crashed!',
    brandLogoSrc: 'assets/brand/promise-group.svg',   // company logo, top-left, ALWAYS shown (event or not)
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
    gameOverTitle: 'Go-live failed!',
    wall: 'STILL ON NAV × UPGRADE IT × ',
    kicker: 'PARIS · 27–29 OCT 2026',
    logoSrc: 'assets/event/directions-emea-2026.svg',   // drop the real logo here (white/mono, ~160×40)
  };

  const q = /[?&]event=(\d)/.exec(location.search);
  const on = q ? q[1] === '1' : EVENT_ENABLED;
  return on ? event : generic;
})();

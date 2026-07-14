/**
 * DOM overlay: HUD, objectives, bottom-sheet building/road panels, build menu,
 * happiness breakdown, settings, toasts, tutorial pointer, level banners,
 * final score screen and the dev-only debug panel.
 * The UI never mutates GameState directly — it calls Actions.
 */
import * as THREE from 'three';
import { BUILDINGS, type BuildingCategory } from '../config/buildings';
import { edgeById, plotById, DISTRICTS } from '../config/map';
import { LEVELS, levelDef } from '../config/levels';
import { SCORE_WEIGHTS } from '../config/economy';
import { applyCssVars } from '../config/theme';
import { evaluateLevel } from '../sim/objectives';
import type { Actions } from '../game/Actions';
import type { GameStateData } from '../game/GameState';
import type { Simulation } from '../sim/Simulation';
import { audio } from '../platform/audioSystem';
import { bus } from '../utils/events';
import { clamp, formatNum } from '../utils/math';
import { CATEGORY_ICONS, ICONS, icon } from './icons';

export interface UICallbacks {
  onQualityChange: (q: 'auto' | 'low' | 'medium' | 'high') => void;
  onReducedMotion: (on: boolean) => void;
  onReset: () => void;
  flyTo: (x: number, z: number, zoom: number) => Promise<void>;
  saveNow: () => void;
}

const STATUS_TEXT: Record<string, string> = {
  fire: 'ON FIRE! Fire crews respond if a station covers this area.',
  damaged: 'Damaged — needs repair before it can operate.',
  construction: 'Under construction…',
  firerisk: 'High fire risk! Extend fire-station coverage to this building.',
  noroad: 'No road access — this building is cut off.',
  nopower: 'No electricity. Connect to a powered road network with spare capacity.',
  nowater: 'No water supply. Build or upgrade water services.',
  noworkers: 'Not enough workers. Grow nearby housing.',
  nogoods: 'Shelves are empty — waiting for a goods delivery from industry.',
  materials: 'Materials ready to collect!',
  coins: 'Coins ready to collect!',
};

export class UIManager {
  private root: HTMLElement;
  private el = new Map<string, HTMLElement>();
  private selected: { plotId?: string; edgeId?: string } | null = null;
  private uiT = 0;
  private lastPanelKey = '';
  private panelTargetKey = '';
  private tutorialTarget: { x: number; z: number; y?: number; text: string } | null = null;
  private projV = new THREE.Vector3();

  constructor(
    root: HTMLElement,
    private state: GameStateData,
    private sim: Simulation,
    private actions: Actions,
    private camera: THREE.Camera,
    private cb: UICallbacks,
  ) {
    this.root = root;
    applyCssVars();
    this.buildStatic();
    bus.on('toast', ({ text }) => this.toast(text));
    bus.on('levelCompleted', (lv) => {
      const def = levelDef(lv);
      audio.play('level');
      if (def) this.toast(`⭐ ${def.title} complete! ${def.reward.text}`);
    });
    bus.on('levelStarted', (lv) => this.showLevelBanner(lv));
    bus.on('districtUnlocked', (d) => {
      const dd = DISTRICTS.find((x) => x.id === d);
      if (dd) this.toast(`🗺️ ${dd.name} unlocked!`);
    });
    bus.on('fireStarted', () => {
      audio.play('siren');
      this.toast('🔥 Fire! A building has ignited!');
    });
    bus.on('gameCompleted', () => window.setTimeout(() => this.showEndScreen(), 2600));
    bus.on('selectionChanged', () => this.refreshPanel(true));
  }

  // ---------------- static scaffold ----------------
  private buildStatic(): void {
    const container = document.createElement('div');
    container.id = 'ui-static';
    container.innerHTML = `
      <div id="hud-tl" class="hud-corner">
        <div class="chip level">${icon('trophy')}<span id="hud-level">Level 1</span></div>
        <div class="chip">${icon('people')}<span id="hud-pop">0</span></div>
        <button class="chip" id="hud-happy" aria-label="Happiness breakdown"><span class="ico" id="hud-happy-ico">${ICONS.happy}</span><span id="hud-happy-val">55%</span></button>
      </div>
      <div id="hud-tr" class="hud-corner">
        <div class="chip">${icon('coin')}<span id="hud-coins">0</span></div>
        <div class="chip">${icon('brick')}<span id="hud-mat">0</span></div>
        <button class="chip" id="hud-settings" aria-label="Settings">${icon('gear')}</button>
      </div>
      <div id="objectives"></div>
      <div id="toasts"></div>
      <div id="tut-ring" style="display:none"></div>
      <div id="tut-hand" style="display:none">👆</div>
      <div id="tut-text" style="display:none"></div>
    `;
    this.root.appendChild(container);
    for (const id of ['hud-level', 'hud-pop', 'hud-happy', 'hud-happy-ico', 'hud-happy-val', 'hud-coins', 'hud-mat', 'hud-settings', 'objectives', 'toasts', 'tut-ring', 'tut-hand', 'tut-text']) {
      this.el.set(id, document.getElementById(id)!);
    }
    this.el.get('hud-happy')!.addEventListener('click', () => {
      audio.play('tap');
      this.showHappiness();
    });
    this.el.get('hud-settings')!.addEventListener('click', () => {
      audio.play('tap');
      this.showSettings();
    });
    this.el.get('objectives')!.addEventListener('click', () => {
      this.el.get('objectives')!.classList.toggle('collapsed');
    });
  }

  toast(text: string): void {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    this.el.get('toasts')!.appendChild(t);
    window.setTimeout(() => t.remove(), 3300);
  }

  showLevelBanner(level: number): void {
    const def = levelDef(level);
    if (!def) return;
    document.getElementById('level-banner')?.remove();
    const b = document.createElement('div');
    b.id = 'level-banner';
    b.innerHTML = `<div class="big">Level ${def.level} — ${def.title}</div><div class="small">${def.intro}</div>`;
    this.root.appendChild(b);
    window.setTimeout(() => b.remove(), 4500);
  }

  // ---------------- selection ----------------
  select(target: { plotId?: string; edgeId?: string } | null): void {
    this.selected = target;
    bus.emit('selectionChanged', target?.plotId ?? null);
    this.refreshPanel(true);
  }

  get selection(): { plotId?: string; edgeId?: string } | null {
    return this.selected;
  }

  private closePanel(): void {
    document.getElementById('panel')?.remove();
    this.lastPanelKey = '';
    this.panelTargetKey = '';
  }

  private refreshPanel(force = false): void {
    if (!this.selected) {
      this.closePanel();
      return;
    }
    const targetKey = JSON.stringify(this.selected);
    const key = targetKey + this.panelStateKey();
    if (!force && key === this.lastPanelKey) return;
    this.lastPanelKey = key;

    // Reuse the existing panel element when the SAME building/road is still
    // selected — only its inner content is swapped. Recreating the element
    // would replay the `mb-rise` entrance animation on every data tick, which
    // reads as flicker. The animation should fire once per new selection.
    let panel = document.getElementById('panel');
    const sameTarget = !!panel && this.panelTargetKey === targetKey;
    if (!sameTarget) {
      panel?.remove();
      panel = document.createElement('div');
      panel.id = 'panel';
      this.root.appendChild(panel);
      this.panelTargetKey = targetKey;
    }
    const scrollTop = panel!.scrollTop;
    panel!.textContent = '';
    if (this.selected.plotId) this.fillPlotPanel(panel!, this.selected.plotId);
    else if (this.selected.edgeId) this.fillRoadPanel(panel!, this.selected.edgeId);
    const close = document.createElement('button');
    close.className = 'close';
    close.textContent = '✕';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => this.select(null));
    panel!.appendChild(close);
    panel!.scrollTop = scrollTop; // keep scroll position across in-place refreshes
  }

  /** panel re-renders when these change */
  private panelStateKey(): string {
    if (!this.selected?.plotId) {
      if (this.selected?.edgeId) return `:${this.state.roadTiers[this.selected.edgeId]}:${Math.floor(this.state.coins / 20)}`;
      return '';
    }
    const b = this.state.buildings[this.selected.plotId];
    if (!b) return `vacant:${Math.floor(this.state.coins / 20)}:${this.state.materials}:${this.state.permits.length}`;
    const status = this.sim.derived.statuses.get(b.id) ?? '';
    return `${b.tier}:${b.damaged}:${!!b.construction}:${status}:${Math.floor(b.coinsReady)}:${Math.floor(b.materialsReady)}:${Math.floor(this.state.coins / 20)}:${this.state.materials}`;
  }

  private fillPlotPanel(panel: HTMLElement, plotId: string): void {
    const b = this.state.buildings[plotId];
    if (!b) {
      this.fillBuildMenu(panel, plotId);
      return;
    }
    const def = BUILDINGS[b.defId];
    const tierDef = def.tiers[b.tier - 1];
    const rt = this.sim.derived.runtime.get(plotId);
    const status = this.sim.derived.statuses.get(plotId);

    let html = `<h2>${icon(CATEGORY_ICONS[b.defId] ?? 'build')} ${tierDef.name} <span class="tier">Tier ${b.tier}</span></h2>`;
    if (b.construction) {
      const pct = Math.round((1 - b.construction.remaining / b.construction.total) * 100);
      html += `<div class="status">🏗️ Building… ${pct}%</div><div class="bar-mini"><div style="width:${pct}%"></div></div>`;
    } else if (status === 'firerisk') {
      // name the specific cause + the specific fix, never a vague message
      html += `<div class="status">🔥 High fire risk. ${this.fireFix(b.defId, rt)}</div>`;
    } else if (status && STATUS_TEXT[status]) {
      const good = status === 'coins' || status === 'materials';
      html += `<div class="status${good ? ' ok' : ''}">${STATUS_TEXT[status]}</div>`;
    } else if (rt?.active) {
      html += `<div class="status ok">✅ Operating normally (${Math.round((rt.efficiency ?? 0) * 100)}% efficiency)</div>`;
    }
    html += `<div class="desc">${def.desc}</div>`;

    // stats
    const rows: [string, string][] = [];
    if (tierDef.populationCapacity) rows.push(['Residents', `${Math.floor(b.occupancy)} / ${tierDef.populationCapacity}`]);
    if (tierDef.jobs) rows.push(['Workers', `${Math.floor(b.workers)} / ${tierDef.jobs}`]);
    if (tierDef.powerDemand) rows.push(['Power use', `${tierDef.powerDemand}`]);
    if (tierDef.powerCapacity) rows.push(['Power output', `${tierDef.powerCapacity}`]);
    if (tierDef.waterDemand && this.sim.derived.waterEnabled) rows.push(['Water use', `${tierDef.waterDemand}`]);
    if (tierDef.waterCapacity) rows.push(['Water output', `${tierDef.waterCapacity}`]);
    if (b.defId === 'industrial') rows.push(['Goods stored', `${Math.floor(b.storedGoods)} / ${tierDef.goodsStorage}`]);
    if (b.defId === 'commercial') rows.push(['Goods on shelf', `${Math.floor(b.inventory)} / ${tierDef.goodsStorage}`]);
    if (tierDef.pollutionOutput) rows.push(['Pollution', `${tierDef.pollutionOutput}`]);
    if (tierDef.coverageRadius) rows.push(['Coverage radius', `${tierDef.coverageRadius}m`]);
    if (rt && b.defId !== 'park') rows.push(['Pollution exposure', `${Math.round(rt.exposure)}`]);
    // only surface fire risk once the fire-safety system is part of the game,
    // so early-game players aren't alarmed by a stat they can't act on yet
    const fireRelevant = this.state.level >= 7 || this.state.permits.includes('fire');
    if (fireRelevant && b.fireRisk > 5) rows.push(['Fire risk', `${Math.round(b.fireRisk)} / 100`]);
    if (rows.length) {
      html += `<div class="stat-grid">${rows.map(([k, v]) => `<div><span class="k">${k}: </span><b>${v}</b></div>`).join('')}</div>`;
    }
    panel.innerHTML = html;

    // actions
    const btns = document.createElement('div');
    btns.className = 'btn-row';
    if (b.damaged) {
      const cost = this.actions.repairCost(plotId);
      btns.appendChild(this.btn(`${icon('wrench', 'ico-s')} Repair<span class="cost">${cost}${icon('coin', 'ico-s')}</span>`, 'gold', () => this.tryAction(() => this.actions.repair(plotId))));
    }
    if (b.coinsReady >= 1 || b.materialsReady >= 1) {
      btns.appendChild(this.btn(`${icon('coin', 'ico-s')} Collect`, 'green', () => this.tryAction(() => this.actions.collect(plotId))));
    }
    if (!b.damaged && !b.construction && b.tier < def.tiers.length) {
      const next = def.tiers[b.tier];
      const blockers = this.actions.upgradeBlockers(plotId);
      const button = this.btn(
        `${icon('up', 'ico-s')} ${b.defId === 'landmark' ? 'Next phase' : 'Upgrade'}: ${next.name}<span class="cost">${next.coinCost}${icon('coin', 'ico-s')}${next.materialCost ? ` + ${next.materialCost}${icon('brick', 'ico-s')}` : ''}</span>`,
        'gold',
        () => this.tryAction(() => this.actions.upgrade(plotId)),
      );
      if (blockers.length) {
        button.disabled = true;
        const bl = document.createElement('div');
        bl.className = 'blockers';
        bl.innerHTML = `Needs: ${blockers.join(' · ')}`;
        panel.appendChild(btns);
        btns.appendChild(button);
        panel.appendChild(bl);
        this.appendUpgradePreview(panel, b.defId, b.tier);
        return;
      }
      btns.appendChild(button);
    }
    panel.appendChild(btns);
    if (!b.damaged && !b.construction && b.tier < def.tiers.length) this.appendUpgradePreview(panel, b.defId, b.tier);
  }

  /** benefits AND consequences before confirming */
  private appendUpgradePreview(panel: HTMLElement, cat: BuildingCategory, tier: number): void {
    const def = BUILDINGS[cat];
    const cur = def.tiers[tier - 1];
    const next = def.tiers[tier];
    const gains: string[] = [];
    const costs: string[] = [];
    const diff = (label: string, a?: number, b?: number, invert = false) => {
      const d = (b ?? 0) - (a ?? 0);
      if (d === 0) return;
      const positive = invert ? d < 0 : d > 0;
      (positive ? gains : costs).push(`${label} ${d > 0 ? '+' : ''}${d}`);
    };
    diff('👥 capacity', cur.populationCapacity, next.populationCapacity);
    diff('💼 jobs', cur.jobs, next.jobs);
    diff('💰 tax', cur.taxRate, next.taxRate);
    diff('⚡ output', cur.powerCapacity, next.powerCapacity);
    diff('💧 output', cur.waterCapacity, next.waterCapacity);
    diff('🏭 production', cur.productionRate, next.productionRate);
    diff('🛒 customers', cur.customers, next.customers);
    diff('🌳 happiness', cur.happinessBonus, next.happinessBonus);
    diff('🚒 coverage', cur.coverageRadius, next.coverageRadius);
    diff('⚡ demand', cur.powerDemand, next.powerDemand, true);
    diff('💧 demand', cur.waterDemand, next.waterDemand, true);
    diff('🚗 traffic', cur.trafficDemand, next.trafficDemand, true);
    diff('🌫️ pollution', cur.pollutionOutput, next.pollutionOutput, true);
    const d = document.createElement('div');
    d.className = 'desc';
    d.innerHTML = `${gains.length ? `<span style="color:var(--mb-green)">Gains: ${gains.join(', ')}</span><br>` : ''}${costs.length ? `<span style="color:var(--mb-orange)">Adds: ${costs.join(', ')}</span>` : ''}`;
    panel.appendChild(d);
  }

  /** the exact cause + fix for a building's fire risk (only industry/power get it) */
  private fireFix(defId: string, rt: { covered: boolean } | undefined): string {
    if (!rt?.covered) return 'It has no fire coverage — build or upgrade a fire station within range.';
    if (this.sim.derived.powerRatio < 1) return 'The power grid is overloaded — upgrade your power plant to ease the strain.';
    if (defId === 'power') return 'Upgrade this ageing generator to a safer power plant.';
    return 'Upgrade it to a cleaner tier to lower the risk.';
  }

  private fillBuildMenu(panel: HTMLElement, plotId: string): void {
    const plot = plotById(plotId);
    panel.innerHTML = `<h2>${icon('build')} Empty plot</h2><div class="desc">Choose what to build here.</div>`;
    for (const cat of plot.allowed) {
      const def = BUILDINGS[cat];
      const t1 = def.tiers[0];
      const can = this.actions.canBuild(plotId, cat);
      const opt = document.createElement('button');
      opt.className = 'build-opt' + (can.ok ? '' : ' locked');
      opt.innerHTML = `<span class="ico ico-big">${ICONS[CATEGORY_ICONS[cat] ?? 'build']}</span>
        <span><span class="name">${t1.name}</span><br><span class="info">${can.ok ? def.desc : can.reason}</span></span>
        <span class="price">${t1.coinCost}${icon('coin', 'ico-s')}${t1.materialCost ? `<br>${t1.materialCost}${icon('brick', 'ico-s')}` : ''}</span>`;
      opt.addEventListener('click', () => {
        audio.play('tap');
        this.tryAction(() => this.actions.build(plotId, cat));
      });
      panel.appendChild(opt);
    }
  }

  private fillRoadPanel(panel: HTMLElement, edgeId: string): void {
    const tier = this.state.roadTiers[edgeId] ?? 0;
    const rt = this.sim.graph.edges.get(edgeId)!;
    const cap = this.sim.graph.capacityOf(edgeId);
    const congestion = Math.round(rt.congestion * 100);
    const names = ['', 'Worn Road', 'City Street', 'Boulevard'];
    let statusCls = ' ok';
    let statusTxt = '✅ Traffic is flowing freely.';
    if (rt.congestion > 1) {
      statusCls = '';
      statusTxt = '🔴 Over capacity! Vehicles are crawling — deliveries and commutes suffer.';
    } else if (rt.congestion > 0.7) {
      statusCls = '';
      statusTxt = '🟠 Getting busy. Consider an upgrade or an alternate route.';
    }
    panel.innerHTML = `<h2>${icon('road')} ${names[tier]} <span class="tier">Tier ${tier}</span></h2>
      <div class="status${statusCls}">${statusTxt}</div>
      <div class="stat-grid">
        <div><span class="k">Traffic load: </span><b>${rt.load.toFixed(1)} / ${cap}</b></div>
        <div><span class="k">Congestion: </span><b>${congestion}%</b></div>
        <div><span class="k">District: </span><b>${DISTRICTS.find((d) => d.id === edgeById(edgeId).district)?.name}</b></div>
      </div>
      <div class="bar-mini"><div style="width:${clamp(congestion, 0, 100)}%;background:${congestion > 90 ? 'var(--mb-red)' : congestion > 65 ? 'var(--mb-orange)' : 'var(--mb-green)'}"></div></div>`;
    const cost = this.actions.roadUpgradeCost(edgeId);
    if (cost) {
      const row = document.createElement('div');
      row.className = 'btn-row';
      row.appendChild(
        this.btn(
          `${icon('up', 'ico-s')} Upgrade to ${names[tier + 1]}<span class="cost">${cost.coins}${icon('coin', 'ico-s')}${cost.materials ? ` + ${cost.materials}${icon('brick', 'ico-s')}` : ''} · capacity ${cap} → ${this.capAt(tier + 1)}</span>`,
          'gold',
          () => this.tryAction(() => this.actions.upgradeRoad(edgeId)),
        ),
      );
      panel.appendChild(row);
    }
  }

  private capAt(tier: number): number {
    return [0, 8, 16, 26][tier] ?? 0;
  }

  private btn(html: string, cls: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = `btn ${cls}`;
    b.innerHTML = html;
    b.addEventListener('click', onClick);
    return b;
  }

  private tryAction(fn: () => { ok: boolean; reason?: string }): void {
    const res = fn();
    if (!res.ok && res.reason) {
      audio.play('error');
      this.toast(`⚠️ ${res.reason}`);
    } else {
      this.cb.saveNow();
      this.refreshPanel(true);
    }
  }

  // ---------------- happiness modal ----------------
  private showHappiness(): void {
    const bd = this.sim.derived.happinessBreakdown;
    const rows = bd
      .map(
        (f) =>
          `<div class="row"><span>${f.icon} ${f.label}</span><span class="val ${f.value > 0 ? 'pos' : f.value < 0 ? 'neg' : ''}">${f.value > 0 ? '+' : ''}${f.value}</span></div>`,
      )
      .join('');
    this.modal(`
      <h2>😊 Happiness — ${this.state.happiness}%</h2>
      <div class="row"><span>Base contentment</span><span class="val">50</span></div>
      ${rows}
      <div class="row total"><span>City happiness</span><span class="val">${this.sim.derived.happiness}%</span></div>
      <div class="desc">Fix the biggest negative factor first — every icon above maps to a system you can improve.</div>
    `);
  }

  // ---------------- settings ----------------
  private showSettings(): void {
    const s = this.state.settings;
    const m = this.modal(`
      <h2>⚙️ Settings</h2>
      <div class="row"><span>Graphics quality</span>
        <select id="set-quality">
          ${['auto', 'low', 'medium', 'high'].map((q) => `<option value="${q}" ${s.quality === q ? 'selected' : ''}>${q}</option>`).join('')}
        </select></div>
      <div class="row"><span>Reduced motion</span><input id="set-motion" type="checkbox" ${s.reducedMotion ? 'checked' : ''}></div>
      <div class="row"><span>Music</span><input id="set-music" type="checkbox" ${s.music ? 'checked' : ''}></div>
      <div class="row"><span>Sound effects</span><input id="set-sfx" type="checkbox" ${s.sfx ? 'checked' : ''}></div>
      <div class="btn-row"><button class="btn red" id="set-reset">Reset save</button><button class="btn" id="set-close">Done</button></div>
    `);
    m.querySelector('#set-quality')!.addEventListener('change', (e) => {
      const q = (e.target as HTMLSelectElement).value as 'auto' | 'low' | 'medium' | 'high';
      this.state.settings.quality = q;
      this.cb.onQualityChange(q);
      this.cb.saveNow();
    });
    m.querySelector('#set-motion')!.addEventListener('change', (e) => {
      this.state.settings.reducedMotion = (e.target as HTMLInputElement).checked;
      this.cb.onReducedMotion(this.state.settings.reducedMotion);
      this.cb.saveNow();
    });
    m.querySelector('#set-music')!.addEventListener('change', (e) => {
      this.state.settings.music = (e.target as HTMLInputElement).checked;
      audio.setMusic(this.state.settings.music);
      this.cb.saveNow();
    });
    m.querySelector('#set-sfx')!.addEventListener('change', (e) => {
      this.state.settings.sfx = (e.target as HTMLInputElement).checked;
      audio.setSfx(this.state.settings.sfx);
      this.cb.saveNow();
    });
    m.querySelector('#set-reset')!.addEventListener('click', () => {
      if (m.dataset.confirm === '1') {
        this.cb.onReset();
      } else {
        m.dataset.confirm = '1';
        (m.querySelector('#set-reset') as HTMLButtonElement).textContent = 'Tap again to confirm reset';
      }
    });
    m.querySelector('#set-close')!.addEventListener('click', () => m.parentElement!.remove());
  }

  private modal(html: string): HTMLElement {
    document.querySelector('.modal-backdrop')?.remove();
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    const box = document.createElement('div');
    box.className = 'modal';
    box.innerHTML = html;
    back.appendChild(box);
    back.addEventListener('click', (e) => {
      if (e.target === back) back.remove();
    });
    this.root.appendChild(back);
    return box;
  }

  // ---------------- end screen ----------------
  computeScores(): { prosperity: number; happiness: number; mobility: number; sustainability: number; total: number } {
    const s = this.state;
    const d = this.sim.derived;
    const buildingScore = Object.values(s.buildings).reduce((sum, b) => sum + b.tier * 6, 0);
    const prosperity = clamp(Math.round((s.counters['coinsEarned'] ?? 0) / 60 + buildingScore * 0.6), 0, 100);
    const happiness = s.happiness;
    const mobility = d.trafficEfficiency;
    const parks = Object.values(s.buildings).filter((b) => b.defId === 'park').length;
    const renewable = Object.values(s.buildings).some((b) => b.defId === 'power' && b.tier === 3);
    const sustainability = clamp(Math.round(100 - d.pollutionAvg + parks * 6 + (renewable ? 12 : 0)), 0, 100);
    const total = Math.round(
      prosperity * SCORE_WEIGHTS.prosperity + happiness * SCORE_WEIGHTS.happiness + mobility * SCORE_WEIGHTS.mobility + sustainability * SCORE_WEIGHTS.sustainability,
    );
    return { prosperity, happiness, mobility, sustainability, total };
  }

  showEndScreen(): void {
    const sc = this.computeScores();
    this.state.bestScore = Math.max(this.state.bestScore, sc.total);
    this.cb.saveNow();
    const medal = sc.total >= 85 ? '🥇' : sc.total >= 70 ? '🥈' : '🥉';
    const worst = [
      ['Prosperity', sc.prosperity, 'Upgrade shops and offices, and keep taxes collected.'],
      ['Happiness', sc.happiness, 'Open the happiness breakdown and fix the biggest negative.'],
      ['Mobility', sc.mobility, 'Upgrade busy roads and extend the bus network.'],
      ['Sustainability', sc.sustainability, 'Add parks, clean industry and renewable power.'],
    ].sort((a, b) => (a[1] as number) - (b[1] as number))[0];
    const div = document.createElement('div');
    div.id = 'end-screen';
    div.innerHTML = `<div class="card">
      <h1>🏙️ MetroBloom is thriving!</h1>
      <div class="medal">${medal}</div>
      <div style="color:#fff;font-size:26px;font-weight:900">${sc.total} points</div>
      <div class="scores">
        <div class="score-tile"><div class="name">💰 Prosperity</div><div class="num">${sc.prosperity}</div></div>
        <div class="score-tile"><div class="name">😊 Happiness</div><div class="num">${sc.happiness}</div></div>
        <div class="score-tile"><div class="name">🚌 Mobility</div><div class="num">${sc.mobility}</div></div>
        <div class="score-tile"><div class="name">🌱 Sustainability</div><div class="num">${sc.sustainability}</div></div>
      </div>
      <div class="advice">Your city shines! To score even higher: ${worst[2]}</div>
      <div class="btn-row">
        <button class="btn green" id="end-continue">Keep building (Free Mayor Mode)</button>
        <button class="btn" id="end-restart">Restart campaign</button>
      </div>
    </div>`;
    this.root.appendChild(div);
    div.querySelector('#end-continue')!.addEventListener('click', () => {
      audio.play('tap');
      div.remove();
    });
    div.querySelector('#end-restart')!.addEventListener('click', () => this.cb.onReset());
  }

  // ---------------- tutorial pointer ----------------
  setTutorial(target: { x: number; z: number; y?: number; text: string } | null): void {
    this.tutorialTarget = target;
  }

  private updateTutorial(w: number, h: number): void {
    const hand = this.el.get('tut-hand')!;
    const text = this.el.get('tut-text')!;
    if (!this.tutorialTarget) {
      hand.style.display = 'none';
      text.style.display = 'none';
      this.el.get('tut-ring')!.style.display = 'none';
      return;
    }
    // Project at the target's own height so the marker lands ON the object
    // (roads sit ~0.2 above ground; buildings point at their base ~0.6).
    const worldY = this.tutorialTarget.y ?? 0.6;
    this.projV.set(this.tutorialTarget.x, worldY, this.tutorialTarget.z).project(this.camera);
    const sx = ((this.projV.x + 1) / 2) * w;
    const sy = ((1 - this.projV.y) / 2) * h;

    // Pulsing ring marks the exact tap point (pixel-accurate, font-independent).
    const ring = this.el.get('tut-ring')!;
    ring.style.display = 'block';
    ring.style.left = `${sx}px`;
    ring.style.top = `${sy}px`;

    // Hand gestures at the ring from the lower-right; its fingertip (anchored
    // via transform-origin in CSS) rests just off the ring so it never covers it.
    hand.style.display = 'block';
    hand.style.left = `${sx + 6}px`;
    hand.style.top = `${sy + 6}px`;

    text.style.display = 'block';
    text.textContent = this.tutorialTarget.text;
    // keep the caption below-right of the target, always fully on screen
    text.style.left = `${clamp(sx + 26, 8, w - 236)}px`;
    text.style.top = `${clamp(sy + 52, 8, h - 84)}px`;
  }

  // ---------------- per-frame ----------------
  update(dt: number): void {
    this.uiT += dt;
    if (this.uiT < 0.25) {
      this.updateTutorial(window.innerWidth, window.innerHeight);
      return;
    }
    this.uiT = 0;
    const d = this.sim.derived;
    const s = this.state;
    this.text('hud-level', s.level > LEVELS.length ? 'Free Mayor' : `Level ${s.level}`);
    this.text('hud-pop', `${formatNum(Math.floor(d.population))}${d.popCapacity ? ` / ${formatNum(d.popCapacity)}` : ''}`);
    this.text('hud-happy-val', `${s.happiness}%`);
    this.text('hud-coins', formatNum(Math.floor(s.coins)));
    this.text('hud-mat', formatNum(Math.floor(s.materials)));
    const happyIco = this.el.get('hud-happy-ico')!;
    const mood = s.happiness >= 70 ? 'happy' : s.happiness >= 45 ? 'neutral' : 'sad';
    if (happyIco.dataset.mood !== mood) {
      happyIco.dataset.mood = mood;
      happyIco.innerHTML = ICONS[mood];
    }

    // objectives
    const objEl = this.el.get('objectives')!;
    if (s.level > LEVELS.length) {
      objEl.innerHTML = `<h3>${icon('trophy', 'ico-s')} Free Mayor Mode <span class="lvl">score ${this.computeScores().total}</span></h3>
        <div class="obj">Keep improving MetroBloom — upgrades, parks, transit!</div>`;
    } else {
      const def = levelDef(s.level)!;
      const progress = evaluateLevel(s, d);
      const firstOpen = progress.find((p) => !p.done);
      objEl.innerHTML =
        `<h3>${def.title} <span class="lvl">Lv ${s.level}/10</span></h3>` +
        progress
          .map(
            (p) =>
              `<div class="obj${p.done ? ' done' : ''}"><span class="ico obj-ico">${p.done ? ICONS.check : ICONS.square}</span><span>${p.def.text}</span><span class="prog">${p.max > 1 ? `${p.cur}/${p.max}` : ''}</span></div>`,
          )
          .join('') +
        (firstOpen ? `<div class="hint">${icon('bulb', 'ico-s')} ${firstOpen.def.hint}</div>` : '');
    }
    this.updateTutorial(window.innerWidth, window.innerHeight);
    this.refreshPanel();
  }

  private text(id: string, value: string): void {
    const el = this.el.get(id);
    if (el && el.textContent !== value) el.textContent = value;
  }

  // ---------------- debug ----------------
  buildDebugPanel(onAction: (action: string) => void): void {
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;bottom:4px;left:4px;z-index:90;display:flex;gap:4px;flex-wrap:wrap;max-width:280px';
    for (const [label, act] of [
      ['+500🪙', 'coins'],
      ['+10🧱', 'materials'],
      ['Skip level', 'skip'],
      ['Sim ×4', 'fast'],
      ['Fire test', 'fire'],
      ['Finale', 'finale'],
      ['Metrics', 'metrics'],
    ] as const) {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'font-size:11px;padding:4px 8px;border-radius:6px;border:none;background:#333;color:#fff;opacity:0.85';
      b.addEventListener('click', () => onAction(act));
      d.appendChild(b);
    }
    this.root.appendChild(d);
  }
}

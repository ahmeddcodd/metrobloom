/** Minimal typed event bus — systems publish, UI/renderers observe. */
export type GameEventMap = {
  stateChanged: void; // coarse "resources/HUD may have changed"
  buildingChanged: string; // plotId whose visual/tier/state changed
  roadChanged: string; // edgeId whose tier changed
  districtUnlocked: string;
  selectionChanged: string | null; // plotId or edge selection cleared
  objectiveProgress: void;
  levelStarted: number;
  levelCompleted: number;
  collect: { plotId: string; kind: 'coins' | 'materials'; amount: number };
  toast: { text: string; icon?: string };
  fireStarted: string;
  fireResolved: string;
  deliveryArrived: string; // destination plotId
  landmarkStage: number;
  gameCompleted: void;
  tutorialFocus: { x: number; z: number; text: string } | null;
};

type Handler<T> = (payload: T) => void;

class EventBus {
  private handlers = new Map<string, Set<Handler<never>>>();

  on<K extends keyof GameEventMap>(event: K, fn: Handler<GameEventMap[K]>): () => void {
    let set = this.handlers.get(event as string);
    if (!set) {
      set = new Set();
      this.handlers.set(event as string, set);
    }
    set.add(fn as Handler<never>);
    return () => set.delete(fn as Handler<never>);
  }

  emit<K extends keyof GameEventMap>(event: K, payload: GameEventMap[K]): void {
    const set = this.handlers.get(event as string);
    if (!set) return;
    for (const fn of set) (fn as Handler<GameEventMap[K]>)(payload);
  }
}

export const bus = new EventBus();

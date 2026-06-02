// Stage backgrounds. Pure render: a Background reads nothing from `World`, is
// drawn behind the fighters inside the camera Container, and has ZERO effect on
// the deterministic sim (no collision/bounds; those stay in `engine/`. M8 stays
// green).
//
// A stage is a back-to-front stack of parallax layers plus an optional floor.
// Layers with parallax < 1 are "far" — they drift slower than the fighting plane
// as the camera pans, so distant scenery shows depth through a near layer's
// openings (e.g. mountains seen through a dojo wall's window). The near wall
// layer (parallax 1) sits at the fighting plane with its window/slats cut to
// transparent, revealing the far layer behind it.
import { Assets, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { GROUND_Y_SCREEN, STAGE_HEIGHT, STAGE_WIDTH } from '../engine/world.ts';

/** Extra width far layers are scaled past the stage so parallax drift never
 *  exposes an edge through the near layer's openings. */
const FAR_OVERSCAN = 1.5;

export interface ParallaxLayer {
  /** Image URL — STAGE_WIDTH × GROUND_Y_SCREEN (960×460), horizon at the bottom. */
  url: string;
  /**
   * Pan factor. 1 (default) = moves with the fighting plane (the near wall).
   * < 1 = far scenery, drifts slower as the camera pans (0 = pinned on screen).
   */
  parallax?: number;
}

/**
 * One stage's art. Render-only metadata — bundle it (Vite-imported PNG URLs) or
 * resolve it from generated assets (Blob URLs), exactly like character atlases.
 * Geometry is pinned to the engine's fixed stage so any art drops in:
 *   - layers: each STAGE_WIDTH × `groundY`, the wall/scenery plane, ordered
 *     BACK-TO-FRONT. Near layers use transparency to reveal far ones.
 *   - floorUrl: STAGE_WIDTH × (STAGE_HEIGHT − `groundY`), the floor plane below
 *     the wall.
 *   - groundY: screen-y of the wall↔floor junction (the floor's FAR edge).
 *     Defaults to GROUND_Y_SCREEN (460), the feet line. Set it ABOVE 460 for a
 *     perspective floor that recedes behind the fighters — then feet rest mid-
 *     floor (floor visible both behind and in front of them) instead of on the
 *     floor's back edge. Render-only; the sim's feet line stays at GROUND_Y_SCREEN.
 */
export interface StageArt {
  id: string;
  name: string;
  layers: ParallaxLayer[];
  floorUrl?: string;
  groundY?: number;
  /**
   * Solid colour painted behind every layer (e.g. 0x8a6a3f). Insurance so a
   * thin transparent seam or parallax over-drift at the stage edge never reveals
   * the app background — pick the layers' dominant tone. Optional.
   */
  backColor?: number;
}

/**
 * Scale `tex` to cover the w×h rect (filling it, cropping overflow) at `overscan`
 * and position it at (x, y). `valign` picks which edge to pin when the scaled
 * image overflows: 'bottom' keeps a backdrop's horizon on the ground line, 'top'
 * keeps a floor's near edge on the ground line.
 */
function coverSprite(
  tex: Texture,
  w: number,
  h: number,
  x: number,
  y: number,
  valign: 'top' | 'bottom' | 'center',
  overscan = 1,
): Sprite {
  const s = new Sprite(tex);
  const scale = Math.max(w / tex.width, h / tex.height) * overscan;
  s.scale.set(scale);
  const sw = tex.width * scale;
  const sh = tex.height * scale;
  s.x = x + (w - sw) / 2;
  s.y = valign === 'top' ? y : valign === 'bottom' ? y + h - sh : y + (h - sh) / 2;
  return s;
}

async function loadTex(url: string): Promise<Texture> {
  // Force the texture parser: Pixi auto-detects by extension, which a generated
  // `blob:` URL lacks (mirrors loadAtlasTextures). Backdrops are photographic, so
  // smooth (linear) scaling reads better than the nearest used for pixel art.
  const tex = await Assets.load<Texture>({ src: url, loadParser: 'loadTextures' });
  tex.source.scaleMode = 'linear';
  return tex;
}

interface BgLayer {
  sprite: Sprite;
  parallax: number;
  baseX: number;
}

/**
 * Stage background: a Container of parallax layers + floor, with a per-frame
 * `update` that drifts far layers against the camera pan. Add `view` to the
 * camera Container (behind the fighters) and call `update(camera.x, scale)` each
 * render frame, after the camera transform is set.
 */
export class Background {
  readonly view = new Container();
  private readonly layers: BgLayer[] = [];
  private neutralX: number | null = null;

  static async create(art: StageArt): Promise<Background> {
    const bg = new Background();
    // Wall/scenery fills above the junction; floor fills below it. Default
    // junction is the feet line; raise it (smaller y) for a receding floor.
    const groundY = art.groundY ?? GROUND_Y_SCREEN;
    if (art.backColor !== undefined) {
      // Behind everything, generously past the stage so it backs the view at any
      // zoom/pan (the camera is clamped to [0, STAGE_WIDTH] horizontally).
      const fill = new Graphics()
        .rect(-STAGE_WIDTH, -STAGE_HEIGHT, STAGE_WIDTH * 3, STAGE_HEIGHT * 3)
        .fill({ color: art.backColor });
      bg.view.addChild(fill);
    }
    for (const layer of art.layers) {
      const parallax = layer.parallax ?? 1;
      const tex = await loadTex(layer.url);
      const overscan = parallax < 1 ? FAR_OVERSCAN : 1;
      const sprite = coverSprite(tex, STAGE_WIDTH, groundY, 0, 0, 'bottom', overscan);
      bg.view.addChild(sprite);
      bg.layers.push({ sprite, parallax, baseX: sprite.x });
    }
    if (art.floorUrl) {
      const floor = await loadTex(art.floorUrl);
      // Overlap the junction by 1px so camera-zoom sub-pixel rounding never opens
      // a hairline seam between the wall base and the floor's far edge.
      const top = groundY - 1;
      bg.view.addChild(coverSprite(floor, STAGE_WIDTH, STAGE_HEIGHT - top, 0, top, 'top'));
    }
    return bg;
  }

  /**
   * Reposition far layers for the current camera pan. A layer at parallax `p`
   * counters `(1−p)` of the camera's pan (converted out of camera scale, since
   * the layer lives inside the zoomed camera) so it drifts slower on screen. The
   * first call fixes the neutral pan all drift is measured from.
   */
  update(cameraX: number, cameraScale: number): void {
    if (this.neutralX === null) this.neutralX = cameraX;
    const panWorld = (cameraX - this.neutralX) / cameraScale;
    for (const l of this.layers) {
      l.sprite.x = l.baseX - panWorld * (1 - l.parallax);
    }
  }
}

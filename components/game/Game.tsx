'use client';
import { useEffect, useRef, useState, useMemo } from 'react';
import {
  Box,
  Layers3,
  Sparkles,
  Undo2,
  Redo2,
  Plus,
  Minus,
  RotateCw,
  Move,
  Hammer,
  Eraser,
  Sun,
  Moon,
  Camera,
  Settings2,
  HelpCircle,
  Check,
  ChevronRight,
  Radio,
  X,
  Heart,
  Star,
  Users,
  Flower2,
  Armchair,
  Music2,
  Flag,
  Maximize,
  Download,
  Upload,
  Volume2,
  VolumeX,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Grid2X2,
  Crosshair,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  initialWorld,
  MATERIALS,
  blueprint,
  brushBlocks,
  place,
  remove,
  key,
  parseWorld,
  liveScore,
  HORIZONTAL_LIMIT,
  VERTICAL_LIMIT,
  expandGround,
  type World,
  type Point,
  type MaterialId,
  type Brush,
  type Blueprint,
} from '@/lib/world';
import { pickLiveComment, type LiveComment } from '@/lib/live-comments';
import { IslandEngine } from './engine';
import { registerWorldTools } from '@/lib/webmcp';

import { MyBlueprints, BlueprintSaveDialog } from './MyBlueprints';
import { loadBlueprints } from '@/lib/blueprint-storage';
import { placeBlueprint, type CustomBlueprint } from '@/lib/custom-blueprints';
import { MaterialPicker } from './MaterialPicker';
import {
  cells,
  shapeOf,
  rotateBlock,
  ZERO,
  type BlockShape,
  type QuarterTurn,
} from '@/lib/block-types';
import {
  difference,
  applyHistory,
  blocksInRange,
  type HistoryCommand,
} from '@/lib/history';
import { loadWorld, saveWorld } from '@/lib/storage';
const BLUEPRINTS = [
  {
    id: 'stage' as const,
    name: '配信ステージ',
    icon: Music2,
    desc: 'みんなが集まる場所',
  },
  {
    id: 'tree' as const,
    name: 'さくらの木',
    icon: Flower2,
    desc: '島をピンクに彩る',
  },
  {
    id: 'bench' as const,
    name: 'おしゃべりベンチ',
    icon: Armchair,
    desc: 'ちょっと、ひとやすみ',
  },
  {
    id: 'arch' as const,
    name: 'ウェルカムアーチ',
    icon: Flag,
    desc: '出会いの入り口',
  },
];
export default function Game() {
  const host = useRef<HTMLDivElement>(null),
    engine = useRef<IslandEngine | null>(null);
  const [world, setWorld] = useState<World>(initialWorld),
    worldRef = useRef(world);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [loaded, setLoaded] = useState(false);
  const [selection, setSelection] = useState<Point>({ x: 0, y: 1, z: 4 }),
    [hit, setHit] = useState<Point>({ x: 0, y: 0, z: 4 });
  const [material, setMaterial] = useState<MaterialId>('pink'),
    [brush, setBrush] = useState<Brush>('single'),
    [rotation, setRotation] = useState(0);
  const [tab, setTab] = useState<'blocks' | 'blueprints'>('blocks'),
    [plan, setPlan] = useState<Blueprint>('bench');
  const [erase, setErase] = useState(false),
    [night, setNight] = useState(false),
    [sound, setSound] = useState(false);
  const [live, setLive] = useState(false),
    [seconds, setSeconds] = useState(0),
    [result, setResult] = useState(false);
  const [modal, setModal] = useState<'help' | 'settings' | null>(null);
  const [comment, setComment] = useState<LiveComment>();
  const [chatVisible, setChatVisible] = useState(true);
  const nightRef = useRef(night);
  nightRef.current = night;
  const [toolsOpen, setToolsOpen] = useState(false);
  const [toast, setToast] = useState(''),
    [saved, setSaved] = useState('保存済み'),
    [showHint, setShowHint] = useState(true);
  const [history, setHistory] = useState<HistoryCommand[]>([]),
    [future, setFuture] = useState<HistoryCommand[]>([]);
  const fileInput = useRef<HTMLInputElement>(null),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    audio = useRef<AudioContext | null>(null);
  const saveAllowed = useRef(true);
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  const liveRef = useRef(live);
  liveRef.current = live;
  const finishRef = useRef(() => {});
  const [shape, setShape] = useState<BlockShape>('cube');
  const [myPlans, setMyPlans] = useState<CustomBlueprint[]>([]);
  const [customId, setCustomId] = useState<string>();
  const [savePlanOpen, setSavePlanOpen] = useState(false);
  const [interior, setInterior] = useState(false);
  const [planLoadError, setPlanLoadError] = useState(false);
  const customPlan = myPlans.find((p) => p.id === customId);
  const planName =
    customPlan?.name ?? BLUEPRINTS.find((b) => b.id === plan)!.name;
  useEffect(() => {
    let active = true;
    loadBlueprints()
      .then((p) => {
        if (active) setMyPlans(p);
      })
      .catch(() => {
        if (active) setPlanLoadError(true);
      });
    return () => {
      active = false;
    };
  }, []);
  const [rangeMode, setRangeMode] = useState(false);
  const [rangeStart, setRangeStart] = useState<Point>();
  const [rangeEnd, setRangeEnd] = useState<Point>();
  const [focusHint, setFocusHint] = useState(false);
  const selectRef = useRef<(p: Point) => void>(() => {});
  const rotateRef = useRef<
    (p: Point, axis: 'x' | 'y', direction: number) => void
  >(() => {});
  const selectedBlock = useMemo(
    () => world.blocks.find((b) => cells(b).some((c) => key(c) === key(hit))),
    [world.blocks, hit],
  );
  const rangeBlocks = useMemo(
    () =>
      rangeStart && rangeEnd ? blocksInRange(world, rangeStart, rangeEnd) : [],
    [world, rangeStart, rangeEnd],
  );
  selectRef.current = (p) => {
    if (rangeMode) {
      if (!rangeStart || rangeEnd) {
        setRangeStart(p);
        setRangeEnd(undefined);
        notify('ここから。もう1点をタップしてください');
      } else setRangeEnd(p);
    }
  };
  rotateRef.current = (p, axis, direction) => {
    if (liveRef.current || rangeMode || erase || !loaded) return;
    const b = worldRef.current.blocks.find((b) => key(b) === key(p));
    if (!b) return;
    const next = rotateBlock(b, axis, direction);
    if (next === b) {
      notify('この形はこの方向に回転しません');
      return;
    }
    commit({
      ...worldRef.current,
      blocks: worldRef.current.blocks.map((item) => (item === b ? next : item)),
    });
    notify('↻ 90° 回転しました');
  };
  const pending = useMemo(
    () =>
      tab === 'blueprints'
        ? customPlan
          ? placeBlueprint(customPlan, selection, rotation)
          : blueprint(plan, selection, rotation)
        : brushBlocks(selection, material, brush, rotation).map((b) => ({
            ...b,
            shape,
            rotation: { ...ZERO, y: rotation as QuarterTurn },
            ...(shape === 'door' ? { open: false } : {}),
          })),
    [tab, plan, customPlan, selection, rotation, material, brush, shape],
  );
  const validation = useMemo(() => place(world, pending), [world, pending]),
    score = useMemo(() => liveScore(world), [world]);
  const canRemove = !!selectedBlock;
  const level = 1 + Math.floor(world.placed / 50);
  function notify(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3200);
  }
  function chime() {
    if (!sound) return;
    try {
      const ctx = audio.current ?? new AudioContext();
      audio.current = ctx;
      void ctx.resume();
      [523.25, 659.25, 783.99].forEach((f, i) => {
        const o = ctx.createOscillator(),
          g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0, ctx.currentTime + i * 0.065);
        g.gain.linearRampToValueAtTime(
          0.055,
          ctx.currentTime + i * 0.065 + 0.01,
        );
        g.gain.exponentialRampToValueAtTime(
          0.001,
          ctx.currentTime + i * 0.065 + 0.25,
        );
        o.connect(g);
        g.connect(ctx.destination);
        o.start(ctx.currentTime + i * 0.065);
        o.stop(ctx.currentTime + i * 0.065 + 0.26);
      });
    } catch {
      /* Sound is optional on browsers without audio support. */
    }
  }
  function commit(next: World) {
    if (!loadedRef.current || liveRef.current) return;
    saveAllowed.current = true;
    const previous = worldRef.current;
    setHistory((h) => [...h.slice(-39), difference(previous, next)]);
    setFuture([]);
    worldRef.current = next;
    setWorld(next);
    if (next.blocks.length > previous.blocks.length)
      engine.current?.celebrate(next.blocks.at(-1)!);
  }
  function build() {
    if (!ready || !loaded || live) return;
    if (rangeMode) {
      if (!rangeStart || !rangeEnd) {
        notify('範囲の両端をタップしてください');
        return;
      }
      if (!rangeBlocks.length) {
        notify('この範囲にブロックはありません');
        return;
      }
      const removed = new Set(rangeBlocks.map(key));
      commit({
        ...world,
        blocks: world.blocks.filter((b) => !removed.has(key(b))),
      });
      notify(`${rangeBlocks.length}ブロックを削除しました。戻すで復元できます`);
      setRangeStart(undefined);
      setRangeEnd(undefined);
      return;
    }
    if (erase) {
      if (!canRemove) {
        notify('取り外すブロックを選んでね');
        return;
      }
      commit(remove(world, hit));
      notify('ブロックを取り外しました');
    } else {
      if (validation.error) {
        notify(validation.error);
        return;
      }
      commit(validation.world);
      chime();
      setShowHint(false);
      notify(
        tab === 'blueprints'
          ? `${planName}ができました！`
          : `${pending.length}ブロック、いい感じ！`,
      );
      // Keep floor extensions at ground level so repeated placement grows sideways.
      setSelection((p) => ({
        ...p,
        y:
          p.y === 0
            ? 0
            : Math.max(
                -VERTICAL_LIMIT,
                Math.min(VERTICAL_LIMIT, p.y + (p.y < 0 ? -1 : 1)),
              ),
      }));
    }
  }
  function undo() {
    const prev = history.at(-1);
    if (!prev || live) return;
    setFuture((f) => [prev, ...f]);
    setHistory((h) => h.slice(0, -1));
    const restored = applyHistory(worldRef.current, prev, true);
    worldRef.current = restored;
    setWorld(restored);
    notify('ひとつ前に戻しました');
  }
  function redo() {
    const next = future[0];
    if (!next || live) return;
    setHistory((h) => [...h, next]);
    setFuture((f) => f.slice(1));
    const restored = applyHistory(worldRef.current, next);
    worldRef.current = restored;
    setWorld(restored);
  }
  useEffect(() => {
    let cancelled = false;
    void loadWorld()
      .then((w) => {
        if (cancelled) return;
        if (w) {
          setWorld(w);
          worldRef.current = w;
          setShowHint(w.placed === 0);
        }
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        saveAllowed.current = false;
        setLoaded(true);
        setSaved('保存データを確認');
        notify(
          '保存を読み込めません。元データは保持しています。設定からJSONを保存・復元できます',
        );
      });
    try {
      setFocusHint(localStorage.getItem('iriamcraft-focus-help') !== 'seen');
    } catch {
      setFocusHint(true);
    }
    if (!host.current) return;
    const fail = (e: Event) => setError((e as CustomEvent<string>).detail);
    host.current.addEventListener('island-error', fail);
    try {
      const e = new IslandEngine(host.current, (p, n) => {
        setHit(p);
        selectRef.current(p);
        setSelection({ x: p.x + n.x, y: p.y + n.y, z: p.z + n.z });
      });
      engine.current = e;
      e.onInteriorChange = setInterior;
      e.onRotate = (p, axis, direction) =>
        rotateRef.current(p, axis, direction);
      e.onRotationPreview = () => notify('↻ 90° 指を離すと回転');
      e.setBlocks(worldRef.current.blocks);
      setReady(true);
    } catch {
      setError(
        'このブラウザで3D表示を開始できませんでした。最新版のChromeやSafariで開いてください。',
      );
    }
    const node = host.current;
    return () => {
      cancelled = true;
      engine.current?.dispose();
      engine.current = null;
      node.removeEventListener('island-error', fail);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      void audio.current?.close();
      audio.current = null;
    };
  }, []);
  useEffect(() => {
    engine.current?.setBlocks(world.blocks);
    worldRef.current = world;
  }, [world]);
  useEffect(
    () =>
      registerWorldTools(
        () => worldRef.current,
        (blocks) => {
          if (!loadedRef.current || liveRef.current)
            return { error: 'ライブ中は建築をお休みしています', count: 0 };
          const result = place(worldRef.current, blocks);
          if (result.error) return { error: result.error, count: 0 };
          commit(result.world);
          return { count: blocks.length };
        },
      ),
    [],
  );
  useEffect(() => {
    engine.current?.setGhost(
      live || rangeMode ? [] : erase ? [selectedBlock ?? hit] : pending,
      erase ? canRemove : !validation.error,
      erase,
    );
  }, [
    pending,
    hit,
    erase,
    live,
    canRemove,
    validation.error,
    rangeMode,
    selectedBlock,
  ]);
  useEffect(() => {
    engine.current?.setSelected(
      live || rangeMode || erase ? undefined : selectedBlock,
    );
  }, [selectedBlock, live, rangeMode, erase]);
  useEffect(() => {
    engine.current?.setRange(
      live ? undefined : rangeStart,
      rangeEnd ?? rangeStart,
    );
  }, [rangeStart, rangeEnd, live]);
  useEffect(() => {
    engine.current?.setNight(night);
  }, [night]);
  useEffect(() => {
    engine.current?.setLive(live, score.visitors);
  }, [live, score.visitors]);
  useEffect(() => {
    if (!loaded || !saveAllowed.current) return;
    let current = true;
    setSaved('保存中…');
    void saveWorld(world)
      .then(() => {
        if (current) setSaved('保存済み');
      })
      .catch(() => {
        if (current) setSaved('保存できません・JSON保存を');
      });
    return () => {
      current = false;
    };
  }, [world, loaded]);
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    const comments = setInterval(() => {
      setComment((previous) =>
        pickLiveComment(worldRef.current, nightRef.current, previous),
      );
    }, 4500);
    return () => {
      clearInterval(timer);
      clearInterval(comments);
    };
  }, [live]);
  useEffect(() => {
    if (live && seconds >= 30) finishRef.current();
  }, [seconds, live]);
  function finishLive() {
    setLive(false);
    setResult(true);
    const next = { ...worldRef.current, shows: worldRef.current.shows + 1 };
    worldRef.current = next;
    setWorld(next);
    chime();
  }
  finishRef.current = finishLive;
  function startLive() {
    setComment(pickLiveComment(worldRef.current, night));
    setChatVisible(true);
    setShowHint(false);
    setLive(true);
    setSeconds(0);
    setToolsOpen(false);
    setToast('');
    chime();
  }
  function download(url: string, name: string) {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
  }
  function exportWorld() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(world, null, 2)], { type: 'application/json' }),
    );
    download(url, 'iriamcraft-world.json');
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    notify('島のバックアップを書き出しました');
  }
  function photo() {
    if (!engine.current) return;
    download(engine.current.screenshot(), 'iriamcraft-island.png');
    notify('島の写真を保存しました');
  }
  const nudge = (axis: 'x' | 'y' | 'z', d: number) => {
    const move = (p: Point) => ({
      ...p,
      [axis]: Math.max(
        axis === 'y' ? -VERTICAL_LIMIT : -HORIZONTAL_LIMIT,
        Math.min(axis === 'y' ? VERTICAL_LIMIT : HORIZONTAL_LIMIT, p[axis] + d),
      ),
    });
    setSelection(move);
    setHit(move);
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        modal ||
        !!document.querySelector('[role="dialog"]') ||
        result ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.key === 'Enter' && e.target === document.body && !rangeMode) {
        e.preventDefault();
        build();
      }
      if (e.key === 'Escape') {
        setErase(false);
        setRangeMode(false);
        setRangeStart(undefined);
        setRangeEnd(undefined);
        setToolsOpen(false);
      }
      if (e.target !== document.body) return;
      if (e.key.toLowerCase() === 'r' && selectedBlock) {
        e.preventDefault();
        rotateRef.current(selectedBlock, e.shiftKey ? 'x' : 'y', 1);
        return;
      }
      const moves: Record<string, ['x' | 'y' | 'z', number]> = {
        ArrowLeft: ['x', -1],
        ArrowRight: ['x', 1],
        ArrowUp: ['z', -1],
        ArrowDown: ['z', 1],
        PageUp: ['y', 1],
        PageDown: ['y', -1],
      };
      if (moves[e.key]) {
        e.preventDefault();
        nudge(...moves[e.key]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });
  return (
    <main className={`game ${night ? 'night' : ''}`}>
      <header className="topbar">
        <a className="brand" href="./" aria-label="Iriamcraft ホーム">
          <span className="brand-mark">
            <Box strokeWidth={1.8} />
          </span>
          <span>
            Iriam<span className="brand-light">craft</span>
            <small>あなたの好きが、世界になる。</small>
          </span>
          <span className="beta">BETA</span>
        </a>
        <div className="header-center">
          <span className="status-dot" />
          マイワールド
          <span className="divider" />
          クリエイティブ
        </div>
        <div className="header-actions">
          <span
            className={`save-state ${saved !== '保存済み' ? 'save-error' : ''}`}
          >
            <Check size={14} />
            {saved}
          </span>
          <Button
            variant="ghost"
            className="icon-button"
            aria-label="遊び方"
            onClick={() => setModal('help')}
          >
            <HelpCircle />
          </Button>
          <Button
            variant="ghost"
            className="icon-button"
            aria-label="設定と保存"
            onClick={() => setModal('settings')}
          >
            <Settings2 />
          </Button>
          <span className="profile">
            K<span />
          </span>
        </div>
      </header>
      <section
        className={`playground ${live ? 'is-live' : ''}`}
        aria-label="建築ワールド"
      >
        <div ref={host} className="world-canvas" />
        {!ready && !error && (
          <div className="loading">
            <Box />
            <p>あなたの浮島を準備中…</p>
          </div>
        )}
        {error && (
          <div className="engine-error">
            <Box />
            <h2>3Dの島を表示できません</h2>
            <p>{error}</p>
            <Button onClick={() => location.reload()}>再読み込み</Button>
            <Button variant="outline" onClick={exportWorld}>
              島のデータを保存
            </Button>
          </div>
        )}
        <aside className="world-info glass-panel">
          <div className="eyebrow">
            <span className="tiny-island">
              <Box size={15} />
            </span>{' '}
            MY LITTLE UNIVERSE
          </div>
          <h1>
            <span>{world.name}</span>
            <Sparkles size={19} />
          </h1>
          <p>つくろう。ここが、あなたの居場所。</p>
          <div className="world-stats">
            <span>
              <Box size={14} />
              {world.blocks.length.toLocaleString()}
              <small>ブロック</small>
            </span>
            <span>
              <Users size={14} />
              {live ? score.visitors : 4}
              <small>住人</small>
            </span>
          </div>
          <div className="level-line">
            <span>
              Lv. {level}{' '}
              <b>
                {level === 1 ? 'かけだしクリエイター' : 'ワールドクリエイター'}
              </b>
            </span>
            <span>{world.placed % 50} / 50</span>
          </div>
          <div className="level-track">
            <span style={{ width: `${(world.placed % 50) * 2}%` }} />
          </div>
        </aside>
        <aside className="quest-card glass-panel">
          <div className="quest-heading">
            <span>
              <Star size={16} /> 今日のひらめき
            </span>
            <span>01</span>
          </div>
          <h2>
            {world.placed >= 10
              ? 'その調子！ライブを開こう'
              : 'あなたらしさを、ひとつ。'}
          </h2>
          <p>
            {world.placed >= 10
              ? 'できた島に、みんなをご招待。'
              : '好きなブロックを10個置いてみよう。'}
          </p>
          <div className="quest-bottom">
            <span>
              <Sparkles size={14} /> はじめの一歩
            </span>
            <b>
              {Math.min(world.placed, 10)} / 10{' '}
              {world.placed >= 10 && <Check size={13} />}
            </b>
          </div>
        </aside>
        {interior && (
          <div className="interior-status glass-panel">
            <span>👁 内部ビュー</span>
            <Button variant="outline" onClick={() => engine.current?.home()}>
              🏠 外観に戻る
            </Button>
          </div>
        )}
        <div className="sky-tag">
          <span className="status-dot" />
          {night ? '星降る夜' : 'おだやかな昼'}
          <span> • </span>そらの島
        </div>
        <div className="camera-tools glass-panel">
          <Button
            variant="ghost"
            className="icon-button"
            onClick={() => setNight((v) => !v)}
            aria-label={night ? '昼にする' : '夜にする'}
          >
            {night ? <Moon /> : <Sun />}
          </Button>
          <span />
          <Button
            variant="ghost"
            className="icon-button"
            onClick={photo}
            disabled={!ready || !loaded}
            aria-label="島の写真を保存"
          >
            <Camera />
          </Button>
          <Button
            variant="ghost"
            className="icon-button"
            onClick={() => engine.current?.top()}
            aria-label="真上から見る"
          >
            <Grid2X2 />
          </Button>
          <Button
            variant="ghost"
            className="icon-button"
            onClick={() => engine.current?.home()}
            aria-label="視点をリセット"
          >
            <Maximize />
          </Button>
        </div>
        <div className="orbit-tools">
          <Button
            className="round-button"
            variant="outline"
            onClick={() => engine.current?.rotate(-1)}
            aria-label="左に回転"
          >
            <RotateCw className="flip" />
          </Button>
          <div className="zoom-tools glass-panel">
            <Button
              variant="ghost"
              className="icon-button"
              onClick={() => engine.current?.zoom(-0.2)}
              aria-label="縮小"
            >
              <Minus />
            </Button>
            <span />
            <Button
              variant="ghost"
              className="icon-button"
              onClick={() => engine.current?.zoom(0.2)}
              aria-label="拡大"
            >
              <Plus />
            </Button>
          </div>
          <Button
            className="round-button"
            variant="outline"
            onClick={() => engine.current?.rotate()}
            aria-label="右に回転"
          >
            <RotateCw />
          </Button>
        </div>
        {showHint && !live && (
          <div className="world-hint">
            <span className="hint-icon">
              <Sparkles size={17} />
            </span>
            <div>
              <strong>思いついたら、置いてみよう。</strong>
              <span>島をタップで場所選び。ドラッグでぐるっと回転。</span>
            </div>
            <button
              aria-label="ヒントを閉じる"
              onClick={() => setShowHint(false)}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {!live && (
          <div className="live-launch">
            <span>この島に、みんなを呼ぼう。</span>
            <Button
              className="live-button"
              onClick={startLive}
              disabled={!ready || !loaded}
            >
              <Radio size={18} />
              ライブをひらく
              <ChevronRight size={16} />
            </Button>
          </div>
        )}
        {live && (
          <div
            className={`live-panel glass-panel ${chatVisible ? '' : 'chat-hidden'}`}
          >
            <div>
              <span className="live-badge">
                <span /> LIVE
              </span>
              <strong>{Math.max(0, 30 - seconds)}s</strong>
              <span className="live-visitors">
                <Users size={14} />
                {score.visitors}人
              </span>
              <Button
                variant="ghost"
                className="chat-toggle"
                onClick={() => setChatVisible((v) => !v)}
                aria-expanded={chatVisible}
                aria-controls="live-comment"
              >
                {chatVisible ? '隠す' : 'コメント'}
              </Button>
              <Button
                variant="ghost"
                className="icon-button"
                onClick={finishLive}
                aria-label="ライブを終了"
              >
                <X />
              </Button>
            </div>
            {chatVisible && comment && (
              <output
                id="live-comment"
                className="chat-line"
                aria-live="polite"
                aria-atomic="true"
              >
                <span>{comment.name}</span>
                <span className="chat-message">{comment.text}</span>
                <Heart size={14} />
              </output>
            )}
            <small>住民とのシミュレーション</small>
          </div>
        )}
        <div className="scene-caption">
          <Move size={13} />
          ドラッグで回転<span> / </span>2本指で移動・拡大
        </div>
      </section>
      <section
        className={`build-dock ${toolsOpen ? 'tools-open' : ''} ${live ? 'dock-live' : ''}`}
        aria-label="建築ツール"
      >
        <div className="dock-top">
          <div className="dock-tabs">
            <Button
              variant="ghost"
              className={tab === 'blocks' ? 'dock-tab active' : 'dock-tab'}
              onClick={() => {
                setTab('blocks');
                setErase(false);
                setRangeMode(false);
                setRangeStart(undefined);
                setRangeEnd(undefined);
              }}
            >
              <Box size={17} />
              ブロック
            </Button>
            <Button
              variant="ghost"
              className={tab === 'blueprints' ? 'dock-tab active' : 'dock-tab'}
              onClick={() => {
                setTab('blueprints');
                setErase(false);
                setRangeMode(false);
                setRangeStart(undefined);
                setRangeEnd(undefined);
              }}
            >
              <Layers3 size={17} />
              設計図<span className="new-badge">かんたん</span>
            </Button>
          </div>
          <div className="dock-top-right">
            <Button
              variant="ghost"
              className="tools-toggle"
              aria-expanded={toolsOpen}
              aria-controls="build-options build-position"
              onClick={() => setToolsOpen((v) => !v)}
            >
              <Settings2 size={16} />
              {toolsOpen ? '閉じる' : '調整'}
            </Button>
            <span className="free-label">素材はぜんぶ、使い放題。</span>
            <Button
              variant="ghost"
              className="icon-button"
              aria-label="元に戻す"
              disabled={!history.length || live}
              onClick={undo}
            >
              <Undo2 />
            </Button>
            <Button
              variant="ghost"
              className="icon-button"
              aria-label="やり直す"
              disabled={!future.length || live}
              onClick={redo}
            >
              <Redo2 />
            </Button>
          </div>
        </div>
        {toolsOpen && (
          <div className="part-actions">
            <Button
              variant="outline"
              aria-pressed={rangeMode}
              onClick={() => {
                setRangeMode((v) => !v);
                setErase(false);
                setRangeStart(undefined);
                setRangeEnd(undefined);
              }}
            >
              範囲選択
            </Button>
            <Button
              variant="outline"
              onClick={() => setRotation((r) => (r + 1) % 4)}
            >
              配置の向き {rotation * 90}°
            </Button>
            <Button
              variant="outline"
              disabled={!selectedBlock}
              onClick={() =>
                selectedBlock && rotateRef.current(selectedBlock, 'y', 1)
              }
            >
              選択を↻
            </Button>
            <Button
              variant="outline"
              disabled={!selectedBlock}
              onClick={() =>
                selectedBlock && rotateRef.current(selectedBlock, 'x', 1)
              }
            >
              選択を上下↻
            </Button>
            {selectedBlock && shapeOf(selectedBlock) === 'door' && (
              <Button
                variant="outline"
                onClick={() =>
                  commit({
                    ...world,
                    blocks: world.blocks.map((b) =>
                      b === selectedBlock ? { ...b, open: !b.open } : b,
                    ),
                  })
                }
              >
                {selectedBlock.open ? 'ドアを閉める' : 'ドアを開く'}
              </Button>
            )}
          </div>
        )}
        {focusHint && toolsOpen && (
          <div className="focus-help">
            <span>
              🎯 選んだ場所を中央に表示
              <br />
              建築する場所が画面の端に行ってしまったときに使います。照準ボタンで、今選んでいる場所が画面中央に移動します。
            </span>
            <button
              aria-label="中央表示の説明を閉じる"
              onClick={() => {
                setFocusHint(false);
                try {
                  localStorage.setItem('iriamcraft-focus-help', 'seen');
                } catch {
                  /* Optional hint preference. */
                }
              }}
            >
              ×
            </button>
          </div>
        )}
        {rangeMode && rangeStart && rangeEnd && (
          <section className="range-actions" aria-label="選択範囲">
            <strong>
              選択中 {rangeBlocks.length.toLocaleString()}ブロック
            </strong>
            <span>
              幅 {Math.abs(rangeStart.x - rangeEnd.x) + 1} × 高さ{' '}
              {Math.abs(rangeStart.y - rangeEnd.y) + 1} × 奥行{' '}
              {Math.abs(rangeStart.z - rangeEnd.z) + 1}
            </span>
            <Button
              disabled={!rangeBlocks.length || !loaded || live || planLoadError}
              onClick={() => setSavePlanOpen(true)}
            >
              設計図として保存
            </Button>
            <Button
              variant="outline"
              disabled={!rangeBlocks.length || !loaded || live}
              onClick={build}
            >
              範囲を消す
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setRangeStart(undefined);
                setRangeEnd(undefined);
                setRangeMode(false);
              }}
            >
              キャンセル
            </Button>
          </section>
        )}
        {savePlanOpen && (
          <BlueprintSaveDialog
            blocks={rangeBlocks}
            number={myPlans.length + 1}
            onClose={() => setSavePlanOpen(false)}
            onSaved={(p) => {
              setMyPlans((ps) => [p, ...ps]);
              notify(`「${p.name}」を保存しました`);
            }}
          />
        )}
        <div className="dock-main">
          <div className="palette-wrap">
            {tab === 'blocks' ? (
              <MaterialPicker
                material={material}
                shape={shape}
                onChange={(m, s) => {
                  setMaterial(m);
                  setShape(s);
                  setErase(false);
                  setRangeMode(false);
                  setRangeStart(undefined);
                  setRangeEnd(undefined);
                }}
              />
            ) : (
              <div className="blueprint-sections">
                <strong>おすすめ</strong>
                <div className="blueprint-palette">
                  {BLUEPRINTS.map((b) => (
                    <Button
                      key={b.id}
                      variant="ghost"
                      className={`blueprint-card ${!customPlan && plan === b.id ? 'selected' : ''}`}
                      onClick={() => {
                        setPlan(b.id);
                        setCustomId(undefined);
                        setErase(false);
                      }}
                    >
                      <b.icon />
                      <span>
                        <strong>{b.name}</strong>
                        <small>{b.desc}</small>
                      </span>
                    </Button>
                  ))}
                </div>
                {planLoadError && (
                  <p role="alert">
                    マイ設計図を読み込めませんでした。ほかのタブを閉じて再読み込みしてください。保存済みデータは保持しています。
                  </p>
                )}
                <MyBlueprints
                  plans={myPlans}
                  selected={customId}
                  onChange={setMyPlans}
                  onSelect={(p) => {
                    setCustomId(p.id);
                    setErase(false);
                    setRangeMode(false);
                    setRangeStart(undefined);
                    setRangeEnd(undefined);
                    notify(
                      `「${p.name}」を選びました。場所と向きを決めて配置してください`,
                    );
                  }}
                />
              </div>
            )}
          </div>
          <div className="build-controls">
            <div className="brush-controls" id="build-options">
              {tab === 'blocks' ? (
                <div className="segmented" aria-label="配置する形">
                  {(['single', 'line', 'floor'] as Brush[]).map((b, i) => (
                    <Button
                      variant="ghost"
                      key={b}
                      aria-pressed={brush === b}
                      className={brush === b ? 'active' : ''}
                      onClick={() => setBrush(b)}
                    >
                      {['1個', '3連', '3×3'][i]}
                    </Button>
                  ))}
                </div>
              ) : (
                <Button
                  className="rotate-plan"
                  variant="outline"
                  onClick={() => setRotation((r) => (r + 1) % 4)}
                >
                  <RotateCw size={15} /> 回転 {rotation * 90}°
                </Button>
              )}
              <Button
                variant="ghost"
                className={`erase-button ${erase ? 'active' : ''}`}
                onClick={() => {
                  setErase((v) => !v);
                  setRangeMode(false);
                  setRangeStart(undefined);
                  setRangeEnd(undefined);
                }}
                aria-label="取り外しモード"
                aria-pressed={erase}
              >
                <Eraser size={17} />
              </Button>
            </div>
            <Button
              className={`place-button ${erase ? 'erasing' : ''}`}
              disabled={!ready || !loaded || live || rangeMode}
              onClick={build}
            >
              {erase ? <Eraser size={19} /> : <Plus size={21} />}
              <span>
                {rangeMode
                  ? rangeEnd
                    ? '選択範囲を確認'
                    : rangeStart
                      ? 'ここから → 2点目を選択'
                      : '1点目を選択'
                  : erase
                    ? '取り外す'
                    : tab === 'blueprints'
                      ? 'まとめて建てる'
                      : 'ここに置く'}
              </span>
              <kbd>↵</kbd>
            </Button>
          </div>
        </div>
        <div className="dock-bottom" id="build-position">
          <span>
            <span className="status-dot" />
            {erase
              ? '取り外すブロックをタップ'
              : tab === 'blueprints'
                ? `${planName}を選択中`
                : `${MATERIALS.find((m) => m.id === material)!.name}を選択中`}
            <span className="desktop-only">
              {' '}
              ·{' '}
              {erase
                ? '取り外しても、元に戻せます'
                : 'まずは気軽に、ひとつ置いてみよう'}
            </span>
          </span>
          <div className="position-controls">
            <Crosshair size={13} />
            <span>
              {selection.x}, {selection.z}
            </span>
            <button onClick={() => nudge('x', -1)} aria-label="配置位置を左へ">
              <ArrowLeft size={14} />
            </button>
            <button onClick={() => nudge('x', 1)} aria-label="配置位置を右へ">
              <ArrowRight size={14} />
            </button>
            <button onClick={() => nudge('z', -1)} aria-label="配置位置を奥へ">
              <ArrowUp size={14} />
            </button>
            <button onClick={() => nudge('z', 1)} aria-label="配置位置を手前へ">
              <ArrowDown size={14} />
            </button>
            <span className="height-label">高さ {selection.y}</span>
            <button
              onClick={() => engine.current?.focus(erase ? hit : selection)}
              aria-label="選択中の建築位置を画面中央へ移動"
              title="選んだ場所を中央に表示"
            >
              <Crosshair size={14} />
            </button>
            <button onClick={() => nudge('y', -1)} aria-label="配置を一段下へ">
              <Minus size={14} />
            </button>
            <button onClick={() => nudge('y', 1)} aria-label="配置を一段上へ">
              <Plus size={14} />
            </button>
          </div>
        </div>
      </section>
      {toast && (
        <output className="toast">
          <Sparkles size={17} />
          {toast}
        </output>
      )}
      <Dialog
        open={modal !== null}
        onOpenChange={(open) => {
          if (!open) setModal(null);
        }}
      >
        <DialogContent className="game-dialog">
          <DialogTitle>
            {modal === 'help'
              ? '小さなひらめきから、世界をつくろう。'
              : 'あなたのワールド'}
          </DialogTitle>
          <DialogDescription>
            {modal === 'help'
              ? 'スマホは縦のまま。指ひとつで、建築をもっと自由に。'
              : 'この島は、いま使っているブラウザに自動保存されます。'}
          </DialogDescription>
          {modal === 'help' ? (
            <>
              <div className="help-steps">
                <p>
                  <b>01</b>
                  <span>
                    <strong>好きな素材を選ぶ</strong>
                    ブロック、または「設計図」を選びます。
                  </span>
                </p>
                <p>
                  <b>02</b>
                  <span>
                    <strong>島をタップして、場所を決める</strong>
                    緑は置ける場所。赤は重なりや範囲外です。
                  </span>
                </p>
                <p>
                  <b>03</b>
                  <span>
                    <strong>「ここに置く」で、できあがり！</strong>
                    3連・3×3で一気に建築。失敗は「戻す」で安心。
                  </span>
                </p>
              </div>
              <div className="help-note">
                🎯 選んだ場所を中央に表示
                <br />
                建築する場所が画面の端に行ってしまったときに使います。調整の照準ボタンをタップすると、今選んでいる場所が画面中央に移動します。
                <br />
                選択済みブロック上を左右スワイプで水平90°回転、上下で縦回転。空いた場所からドラッグでカメラ回転。PCはR、Shift+R。
                <br />
                範囲選択で2点を選ぶと、設計図として保存・範囲を消すを選べます。削除は戻すでまとめて復元できます。マイ設計図は設計図タブから何度でも配置できます。
                <br />
                最大まで拡大した後、さらにズームすると内部ビューになります。ズームで前進・後退し、壁を通り抜けられます。「外観に戻る」で元の視点へ戻れます。
                <br />
                PC：矢印キーで位置調整、PageUp / Downで高さ、Enterで配置、Ctrl /
                ⌘ + Zで戻す。キーボード操作はボタン外をクリックしてから。
              </div>
              <p className="credits">
                IRIAMのキャラクター交流・配信文化に着想を得た非公式ファンゲームです。公式サービスへの接続や実際の配信機能はありません。
              </p>
            </>
          ) : (
            <>
              <label className="name-field">
                島の名前
                <input
                  maxLength={40}
                  value={world.name}
                  onChange={(e) => {
                    const next = { ...world, name: e.target.value };
                    worldRef.current = next;
                    setWorld(next);
                  }}
                />
              </label>
              <Button
                variant="outline"
                className="setting-row"
                disabled={live}
                onClick={() => {
                  const next = expandGround(world);
                  if (next.error) {
                    notify(next.error);
                    return;
                  }
                  commit(next.world);
                  setModal(null);
                  notify('床を広げました。「戻す」で元に戻せます');
                }}
              >
                <Grid2X2 />
                保存した島の床を広げる
              </Button>
              <Button
                variant="outline"
                className="setting-row"
                onClick={() => setSound((v) => !v)}
              >
                {sound ? <Volume2 /> : <VolumeX />}建築の効果音
                <span>{sound ? 'ON' : 'OFF'}</span>
              </Button>
              <Button
                variant="outline"
                className="setting-row"
                onClick={exportWorld}
              >
                <Download />
                島のバックアップを保存
              </Button>
              <Button
                variant="outline"
                className="setting-row"
                onClick={() => fileInput.current?.click()}
              >
                <Upload />
                バックアップを読み込む
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    const next = parseWorld(await f.text());
                    commit(next);
                    setRangeMode(false);
                    setRangeStart(undefined);
                    setRangeEnd(undefined);
                    setErase(false);
                    notify('島を読み込みました。「戻す」で前の島に戻せます');
                    setModal(null);
                  } catch {
                    notify(
                      'このファイルは読み込めません。IriamcraftのJSONを選んでください',
                    );
                  }
                  e.target.value = '';
                }}
              />
              <p className="credits">
                ブラウザのデータ消去に備えてバックアップを保存できます。端末間の自動同期はありません。
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={result} onOpenChange={setResult}>
        <DialogContent className="game-dialog result-dialog">
          <span className="result-star">
            <Star size={40} />
          </span>
          <DialogTitle>あなたの「好き」が、届いた！</DialogTitle>
          <DialogDescription>
            島に集まってくれて、ありがとう。
            <br />
            次はどんな場所をつくろう？
          </DialogDescription>
          <div className="result-stats">
            <span>
              <Users />
              {score.visitors}
              <small>遊びに来た住人</small>
            </span>
            <span>
              <Star />
              {score.stars}
              <small>今回のエール</small>
            </span>
          </div>
          <Button className="place-button" onClick={() => setResult(false)}>
            <Hammer size={18} />
            もっと、つくろう
          </Button>
        </DialogContent>
      </Dialog>
    </main>
  );
}
